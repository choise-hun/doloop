package ulevelp.service

import io.ktor.http.*
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNotNull
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import ulevelp.api.ApiException
import ulevelp.api.ConflictException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.*
import ulevelp.service.CategoryService.Companion.insertCategory
import ulevelp.service.SharedFolderSync.KIND_CURATED
import ulevelp.service.SharedFolderSync.KIND_MONTHLY_PICK
import ulevelp.service.SharedFolderSync.KIND_USER
import ulevelp.service.SharedFolderSync.copyCategory
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

// ---- 내 분류의 공개본 (소유자만 본다) ----

@Serializable
data class ShareSummaryDto(
    val folderId: String,
    val categoryId: String,
    val title: String,
    val isPublic: Boolean,
    val autoSync: Boolean,
    val hidden: Boolean,          // owner가 숨김 — 공개여도 목록·상세에 안 나온다
    val itemCount: Int,
    val likeCount: Int,
    val cloneCount: Int,
    val publishedAt: String?,
    val publicName: String?       // 커뮤니티에 보이는 내 이름(N2)
)

@Serializable
data class ShareEnvelope(val share: ShareSummaryDto?)

// ---- 공개 응답 (다른 사용자가 본다). 사용자 글자는 공개 제목·공개 이름만 ----

@Serializable
data class PublicOwnerDto(
    val id: String,
    val publicName: String?,
    val isCreator: Boolean,
    val creatorBadge: String?
)

/**
 * 공개 폴더 카드(플레이리스트 카드처럼 — 표지 = 앞 곡 썸네일, 부제 = 아티스트 몇 명). M1-4b E2:
 * `kind` user·curated·monthly_pick, 운영자 폴더는 `owner` null·`titleI18n`·`descriptionI18n`(화면이 `titleI18n[locale] ?: title`),
 * `month`는 monthly_pick만(`YYYY-MM`). `coverVideoIds` = 앞 4곡(썸네일은 화면이 videoId로 만든다),
 * `artists` = 앞 곡들의 YouTube 채널명(겹침 없이 3개까지, 아직 못 받은 곡은 빠짐)
 */
@Serializable
data class PublicFolderSummaryDto(
    val id: String,
    val kind: String,
    val title: String,
    val titleI18n: JsonObject,
    val descriptionI18n: JsonObject,
    val month: String?,
    val owner: PublicOwnerDto?,
    val itemCount: Int,
    val coverVideoId: String?,
    val coverVideoIds: List<String>,
    val artists: List<String>,
    val likeCount: Int,
    val likedByMe: Boolean,
    val cloneCount: Int,
    val autoSync: Boolean,
    val publishedAt: String?
)

@Serializable
data class PublicFolderListResponse(val folders: List<PublicFolderSummaryDto>, val next: String?)

/** 제목·아티스트는 YouTube 원래 값(N3, `video_titles`). 아직 못 받았으면 null. `noteI18n` = 운영자 곡 설명(user 폴더는 `{}`) */
@Serializable
data class PublicFolderItemDto(
    val videoId: String,
    val position: Int,
    val title: String?,
    val artist: String?,
    val a: Double?,
    val b: Double?,
    val rate: Double,
    val noteI18n: JsonObject
)

@Serializable
data class PublicFolderDetailResponse(val folder: PublicFolderSummaryDto, val items: List<PublicFolderItemDto>)

@Serializable
data class FolderLikeResponse(val liked: Boolean, val likeCount: Int)

@Serializable
data class FolderCloneResponse(val categoryId: String, val imported: Int, val alreadyInLibrary: Int, val skippedLimit: Int)

@Serializable
data class FollowResponse(val following: Boolean, val followerCount: Long)

@Serializable
data class PublicUserSummaryDto(
    val id: String,
    val publicName: String?,
    val isCreator: Boolean,
    val creatorBadge: String?,
    val folderCount: Int
)

@Serializable
data class FollowListResponse(val users: List<PublicUserSummaryDto>)

/** `practiceLog` = 학습 기록 공유에 동의한 유료 사용자만(아니면 null, M1-4b) */
@Serializable
data class PublicUserPageResponse(
    val id: String,
    val publicName: String?,
    val isCreator: Boolean,
    val creatorBadge: String?,
    val creatorBio: String,
    val followerCount: Long,
    val followingByMe: Boolean,
    val folders: List<PublicFolderSummaryDto>,
    val practiceLog: PracticeLogDto?
)

/** 이달의 곡 — 홈에서 곡 5개를 바로 보이므로 항목까지 */
@Serializable
data class MonthlyPickDto(val folder: PublicFolderSummaryDto, val items: List<PublicFolderItemDto>)

/** `GET /curation/home` — 화면의 가로 줄(선반) 넷. 각 줄 최대 [CurationPolicy.SECTION_MAX]개 */
@Serializable
data class CurationHomeResponse(
    val curated: List<PublicFolderSummaryDto>,
    val monthlyPick: MonthlyPickDto?,
    val showcase: List<PublicFolderSummaryDto>,
    val following: List<PublicFolderSummaryDto>
)

/**
 * 홈 큐레이션 수치 — 화면을 보며 바꿀 값은 여기만 고친다(M1-4b E5·E9, 사용자 2026-11-06 "20개, 비율은 조절하기 편하게").
 * 쇼케이스 = 크리에이터 폴더 최대 [SHOWCASE_CREATOR_MAX]칸 + 나머지 칸은 팔로워 상위 사용자 폴더.
 * 한쪽이 모자라면 다른 쪽이 남은 칸을 채운다
 */
object CurationPolicy {
    const val SECTION_MAX = 20              // curated·following 줄 카드 수
    const val SHOWCASE_TOTAL = 20           // 쇼케이스 카드 수
    const val SHOWCASE_CREATOR_MAX = 10     // 그중 크리에이터 몫 최대(나머지 = 인기 사용자 몫)
    const val SHOWCASE_POPULAR_USERS = 10   // 팔로워 상위 몇 명을 인기 사용자 후보로
    const val SHOWCASE_MIN_FOLLOWERS = 1    // 인기 사용자 후보의 최소 팔로워 수
    const val SHOWCASE_PER_USER_MAX = 3     // 한 사람이 차지할 수 있는 최대 칸(0 = 제한 없음)
    const val COVER_COUNT = 4               // 카드 표지 썸네일 수
    const val ARTIST_COUNT = 3              // 카드 부제 아티스트 수
    const val ARTIST_SCAN = 10              // 아티스트를 찾을 앞 곡 수
}

@Serializable
data class FolderReportResponse(val reportId: Long)

/** 커뮤니티 이름(N2). nextChangeAt = 다음에 바꿀 수 있는 시각(지금 바로 되면 null) */
@Serializable
data class PublicNameResponse(val publicName: String?, val changedAt: String?, val nextChangeAt: String?)

const val PUBLIC_NAME_MIN = 2
const val PUBLIC_NAME_MAX = 20
const val PUBLIC_NAME_CHANGE_DAYS = 7L

/** 다음 변경 가능 시각. 이름이 없거나(처음·초기화 뒤) 7일이 지났으면 null */
fun nextPublicNameChangeAt(name: String?, changedAt: OffsetDateTime?, now: OffsetDateTime): OffsetDateTime? {
    if (name == null || changedAt == null) return null
    val next = changedAt.plusDays(PUBLIC_NAME_CHANGE_DAYS)
    return if (now.isBefore(next)) next else null
}

/**
 * 공유·커뮤니티 (개발산출물/결과/M1-1_스키마설계.md §5-5, M1-4a).
 * 공개 경로가 읽는 것: `shared_folders`·`shared_folder_items`·`video_titles`·`profiles`의 공개 열
 * (`public_name`·크리에이터 열)·`follows`·`folder_likes`. `songs`(메모·사용자 제목)·`notes`·`progressions`·`takes`는
 * 공개 경로에서 읽지 않는다 — 내 라이브러리로 복제할 때만 내 `songs`에 쓴다
 */
class CommunityService(
    private val db: Database?,
    private val videoMetaClient: VideoMetaClient
) {
    companion object {
        const val MAX_TITLE_LENGTH = CategoryService.MAX_NAME_LENGTH // 복제하면 분류 이름이 되므로 같게(20)
        const val PAGE_SIZE = 20
        const val MAX_DETAIL_LENGTH = 500
        const val MAX_TITLE_FETCH = 60           // 한 요청에서 oEmbed로 받을 제목 수 상한
        val SORTS = setOf("recent", "clones", "likes")
        val REPORT_REASONS = setOf("spam", "inappropriate", "copyright", "other")

        val EMPTY_OBJECT = JsonObject(emptyMap())
        val MONTH_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM")
        val KST: ZoneId = ZoneId.of("Asia/Seoul")

        private fun ts(dt: OffsetDateTime): String = DateTimeFormatter.ISO_INSTANT.format(dt.toInstant())
    }

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    // ================= 내 분류 공개 =================

    /** `GET /categories/{id}/share` — 공개본이 없으면 `share: null` */
    suspend fun getShare(userId: UUID, categoryId: UUID): ShareSummaryDto? = DatabaseFactory.dbQuery(requireDb()) {
        requireOwnCategory(userId, categoryId)
        SharedFoldersTable.selectAll().where { SharedFoldersTable.sourceCategoryId eq categoryId }
            .singleOrNull()?.let { shareSummary(it) }
    }

    /**
     * `PUT /categories/{id}/share` `{isPublic, autoSync?, title?}`.
     * 공개: 유료만, 커뮤니티 이름이 있어야 한다(409 `PUBLIC_NAME_REQUIRED`). 처음 공개(또는 비공개 → 공개, 자동 연동 새로 켬)면 복사.
     * 제목(N1)은 입력 → 없으면 지금 공개 제목 → 없으면 분류 이름. 금칙어면 400 `BANNED_WORD`.
     * 비공개: 티어 무관, 행·좋아요는 남는다
     */
    suspend fun share(
        userId: UUID,
        categoryId: UUID,
        isPublic: Boolean,
        autoSync: Boolean?,
        title: String?
    ): ShareSummaryDto {
        val database = requireDb()
        val summary = DatabaseFactory.dbQuery(database) {
            val ctx = tierContext(userId, lock = true)
            val category = requireOwnCategory(userId, categoryId)
            val existing = SharedFoldersTable.selectAll()
                .where { SharedFoldersTable.sourceCategoryId eq categoryId }
                .forUpdate(ForUpdateOption.ForUpdate)
                .singleOrNull()

            if (!isPublic) {
                if (autoSync == true) throw InvalidInputException("비공개 폴더는 자동 연동을 켤 수 없습니다.")
                val row = existing ?: throw NotFoundException("공개한 적 없는 분류입니다.")
                SharedFoldersTable.update({ SharedFoldersTable.id eq row[SharedFoldersTable.id] }) {
                    it[SharedFoldersTable.isPublic] = false
                    it[SharedFoldersTable.autoSync] = false
                }
                return@dbQuery shareSummary(loadFolder(row[SharedFoldersTable.id]))
            }

            requireCommunityWrite(ctx)
            val finalTitle = validateTitle(title ?: existing?.get(SharedFoldersTable.title) ?: category[CategoriesTable.name])
            val profile = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.single()
            val wantAutoSync = autoSync ?: existing?.get(SharedFoldersTable.autoSync) ?: false
            if (wantAutoSync && !profile[ProfilesTable.shareAutosync]) {
                throw ConflictException("설정에서 '연습 리스트 공유 자동 연동'을 먼저 켜야 합니다.", "SHARE_AUTOSYNC_OFF")
            }
            requirePublicName(profile)

            val folderId = existing?.get(SharedFoldersTable.id) ?: (SharedFoldersTable.insert {
                it[kind] = KIND_USER
                it[ownerId] = userId
                it[sourceCategoryId] = categoryId
                it[SharedFoldersTable.title] = finalTitle
            } get SharedFoldersTable.id)
            val needCopy = existing == null || !existing[SharedFoldersTable.isPublic] ||
                (wantAutoSync && !existing[SharedFoldersTable.autoSync])
            SharedFoldersTable.update({ SharedFoldersTable.id eq folderId }) {
                it[SharedFoldersTable.title] = finalTitle
                it[SharedFoldersTable.isPublic] = true
                it[SharedFoldersTable.autoSync] = wantAutoSync
            }
            if (needCopy) copyCategory(folderId, userId, categoryId, markPublished = true)
            shareSummary(loadFolder(folderId))
        }
        fillTitlesForFolder(UUID.fromString(summary.folderId))
        return summary
    }

    /** `POST /categories/{id}/share/republish` `{title?}` — 다시 복사(공개 여부는 그대로). 유료만 */
    suspend fun republish(userId: UUID, categoryId: UUID, title: String?): ShareSummaryDto {
        val database = requireDb()
        val summary = DatabaseFactory.dbQuery(database) {
            val ctx = tierContext(userId, lock = true)
            requireOwnCategory(userId, categoryId)
            requireCommunityWrite(ctx)
            val row = SharedFoldersTable.selectAll()
                .where { SharedFoldersTable.sourceCategoryId eq categoryId }
                .forUpdate(ForUpdateOption.ForUpdate)
                .singleOrNull() ?: throw NotFoundException("공개한 적 없는 분류입니다.")
            val folderId = row[SharedFoldersTable.id]
            if (title != null) {
                val finalTitle = validateTitle(title)
                SharedFoldersTable.update({ SharedFoldersTable.id eq folderId }) { it[SharedFoldersTable.title] = finalTitle }
            }
            copyCategory(folderId, userId, categoryId, markPublished = true)
            shareSummary(loadFolder(folderId))
        }
        fillTitlesForFolder(UUID.fromString(summary.folderId))
        return summary
    }

    private fun validateTitle(raw: String): String {
        val t = raw.trim()
        if (t.isEmpty() || t.length > MAX_TITLE_LENGTH) {
            throw InvalidInputException("title은 1~${MAX_TITLE_LENGTH}자여야 합니다.")
        }
        BannedWords.require("title", t)
        return t
    }

    /** 공개 이름(N2)이 정해져 있어야 게시할 수 있다. 없으면 409 `PUBLIC_NAME_REQUIRED` */
    private fun requirePublicName(profile: ResultRow): String =
        profile[ProfilesTable.publicName]
            ?: throw ConflictException("커뮤니티 이름을 먼저 정해 주세요.", "PUBLIC_NAME_REQUIRED")

    /**
     * `PUT /community/me/public-name` `{publicName}` — 커뮤니티 이름(N2 확정 2026-11-06).
     * 2~20자, 띄어쓰기 금지, 금칙어 400, 중복 409 `PUBLIC_NAME_TAKEN`(정규화 키 — 존메이어·존.메이어·존_메이어는 같은 이름),
     * 7일에 한 번(409 `PUBLIC_NAME_CHANGE_TOO_SOON` `detail{nextChangeAt}`). 처음 정할 때·owner 초기화 뒤는 바로 된다.
     * 지금 이름과 같으면 아무것도 바꾸지 않는다(변경 시각도 그대로)
     */
    suspend fun setPublicName(userId: UUID, raw: String, now: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)): PublicNameResponse {
        val name = raw.trim()
        if (name.any { it.isWhitespace() }) throw InvalidInputException("커뮤니티 이름에는 띄어쓰기를 쓸 수 없습니다.")
        if (name.length !in PUBLIC_NAME_MIN..PUBLIC_NAME_MAX) {
            throw InvalidInputException("커뮤니티 이름은 ${PUBLIC_NAME_MIN}~${PUBLIC_NAME_MAX}자여야 합니다.")
        }
        val key = BannedWords.normalize(name)
        if (key.length < PUBLIC_NAME_MIN) throw InvalidInputException("커뮤니티 이름에는 글자나 숫자가 ${PUBLIC_NAME_MIN}자 이상 있어야 합니다.")
        BannedWords.require("publicName", name)
        return DatabaseFactory.dbQuery(requireDb()) {
            val profile = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }
                .forUpdate(ForUpdateOption.ForUpdate).single()
            val current = profile[ProfilesTable.publicName]
            val changedAt = profile[ProfilesTable.publicNameChangedAt]
            if (current == name) return@dbQuery publicNameResponse(current, changedAt, now)
            if (current != null && changedAt != null && now.isBefore(changedAt.plusDays(PUBLIC_NAME_CHANGE_DAYS))) {
                throw ApiException(
                    status = HttpStatusCode.Conflict,
                    code = "PUBLIC_NAME_CHANGE_TOO_SOON",
                    message = "커뮤니티 이름은 ${PUBLIC_NAME_CHANGE_DAYS}일에 한 번 바꿀 수 있습니다.",
                    detail = buildJsonObject { put("nextChangeAt", ts(changedAt.plusDays(PUBLIC_NAME_CHANGE_DAYS))) }
                )
            }
            val taken = ProfilesTable.selectAll()
                .where { (ProfilesTable.publicNameKey eq key) and (ProfilesTable.id neq userId) }
                .count() > 0L
            if (taken) throw nameTaken()
            try {
                ProfilesTable.update({ ProfilesTable.id eq userId }) {
                    it[publicName] = name
                    it[publicNameKey] = key
                    it[publicNameChangedAt] = now
                }
            } catch (e: ExposedSQLException) {
                if (e.sqlState == "23505") throw nameTaken()
                throw e
            }
            publicNameResponse(name, now, now)
        }
    }

    private fun nameTaken() = ConflictException(
        "이미 쓰고 있는 커뮤니티 이름입니다. 띄어쓰기·기호·대소문자만 다른 이름도 같은 이름으로 봅니다.",
        "PUBLIC_NAME_TAKEN"
    )

    private fun publicNameResponse(name: String?, changedAt: OffsetDateTime?, now: OffsetDateTime) = PublicNameResponse(
        publicName = name,
        changedAt = changedAt?.let { ts(it) },
        nextChangeAt = nextPublicNameChangeAt(name, changedAt, now)?.let { ts(it) }
    )

    private fun Transaction.requireOwnCategory(userId: UUID, categoryId: UUID): ResultRow =
        CategoriesTable.selectAll()
            .where { (CategoriesTable.id eq categoryId) and (CategoriesTable.userId eq userId) }
            .singleOrNull() ?: throw NotFoundException("분류를 찾을 수 없습니다.")

    private fun Transaction.loadFolder(folderId: UUID): ResultRow =
        SharedFoldersTable.selectAll().where { SharedFoldersTable.id eq folderId }.single()

    private fun Transaction.shareSummary(row: ResultRow): ShareSummaryDto {
        val folderId = row[SharedFoldersTable.id]
        val ownerId = row[SharedFoldersTable.ownerId]!!
        return ShareSummaryDto(
            folderId = folderId.toString(),
            categoryId = row[SharedFoldersTable.sourceCategoryId]!!.toString(),
            title = row[SharedFoldersTable.title],
            isPublic = row[SharedFoldersTable.isPublic],
            autoSync = row[SharedFoldersTable.autoSync],
            hidden = row[SharedFoldersTable.hiddenAt] != null,
            itemCount = itemCounts(listOf(folderId))[folderId] ?: 0,
            likeCount = row[SharedFoldersTable.likeCount],
            cloneCount = row[SharedFoldersTable.cloneCount],
            publishedAt = row[SharedFoldersTable.publishedAt]?.let { ts(it) },
            publicName = ProfilesTable.select(ProfilesTable.publicName).where { ProfilesTable.id eq ownerId }
                .singleOrNull()?.get(ProfilesTable.publicName)
        )
    }

    // ================= 공개 폴더 =================

    /** 공개 user 폴더 조건: 공개 · 숨김 아님 (소유자 유료는 [paidOwners]로 거른다) */
    private fun visibleUserFolders(): Op<Boolean> =
        (SharedFoldersTable.kind eq KIND_USER) and (SharedFoldersTable.isPublic eq true) and SharedFoldersTable.hiddenAt.isNull()

    /** 소유자 중 실제 티어가 유료인 사람(무료가 된 소유자의 폴더는 정리 전이라도 안 보인다) */
    private fun Transaction.paidOwners(ownerIds: Collection<UUID>): Set<UUID> {
        if (ownerIds.isEmpty()) return emptySet()
        return ProfilesTable.selectAll().where { ProfilesTable.id inList ownerIds.distinct() }
            .filter { TierLimits.isPaid(effectiveTier(it)) }
            .map { it[ProfilesTable.id] }
            .toSet()
    }

    /** 공개 운영자 폴더(curated·monthly_pick) 조건: 공개 · 숨김 아님 (M1-4b) */
    private fun visibleOperatorFolders(kind: String): Op<Boolean> =
        (SharedFoldersTable.kind eq kind) and (SharedFoldersTable.isPublic eq true) and SharedFoldersTable.hiddenAt.isNull()

    /**
     * 보이는 폴더 하나 — user(공개·숨김 아님·소유자 유료) 또는 운영자 폴더(공개·숨김 아님).
     * 비공개·숨김·없음·무료 소유자는 404 (M1-4b: 상세·좋아요·복제가 운영자 폴더도 받는다)
     */
    private fun Transaction.requireVisibleFolder(folderId: UUID): ResultRow {
        val row = SharedFoldersTable.selectAll()
            .where { (SharedFoldersTable.id eq folderId) and (SharedFoldersTable.isPublic eq true) and SharedFoldersTable.hiddenAt.isNull() }
            .singleOrNull() ?: throw NotFoundException("공개 폴더를 찾을 수 없습니다.")
        val ownerId = row[SharedFoldersTable.ownerId]
        if (row[SharedFoldersTable.kind] == KIND_USER) {
            val owner = ownerId ?: throw NotFoundException("공개 폴더를 찾을 수 없습니다.")
            if (owner !in paidOwners(listOf(owner))) throw NotFoundException("공개 폴더를 찾을 수 없습니다.")
        }
        return row
    }

    private fun Transaction.itemCounts(folderIds: List<UUID>): Map<UUID, Int> {
        if (folderIds.isEmpty()) return emptyMap()
        val countExpr = SharedFolderItemsTable.videoId.count()
        return SharedFolderItemsTable.select(SharedFolderItemsTable.folderId, countExpr)
            .where { SharedFolderItemsTable.folderId inList folderIds }
            .groupBy(SharedFolderItemsTable.folderId)
            .associate { it[SharedFolderItemsTable.folderId] to it[countExpr].toInt() }
    }

    /** 폴더 행 → 공개 요약. 행 순서를 지킨다 */
    private fun Transaction.publicSummaries(rows: List<ResultRow>, viewerId: UUID): List<PublicFolderSummaryDto> {
        if (rows.isEmpty()) return emptyList()
        val folderIds = rows.map { it[SharedFoldersTable.id] }
        val counts = itemCounts(folderIds)
        // 앞 곡들(위치는 0부터 연속) — 표지 썸네일·부제 아티스트
        val heads = SharedFolderItemsTable
            .join(VideoTitlesTable, JoinType.LEFT, SharedFolderItemsTable.videoId, VideoTitlesTable.videoId)
            .select(SharedFolderItemsTable.folderId, SharedFolderItemsTable.videoId, SharedFolderItemsTable.position, VideoTitlesTable.author)
            .where {
                (SharedFolderItemsTable.folderId inList folderIds) and
                    (SharedFolderItemsTable.position less maxOf(CurationPolicy.COVER_COUNT, CurationPolicy.ARTIST_SCAN))
            }
            .orderBy(SharedFolderItemsTable.position to SortOrder.ASC)
            .groupBy({ it[SharedFolderItemsTable.folderId] }) { it }
        val liked = FolderLikesTable.select(FolderLikesTable.folderId)
            .where { (FolderLikesTable.userId eq viewerId) and (FolderLikesTable.folderId inList folderIds) }
            .map { it[FolderLikesTable.folderId] }
            .toSet()
        val owners = publicOwners(rows.mapNotNull { it[SharedFoldersTable.ownerId] })
        return rows.map { row ->
            val id = row[SharedFoldersTable.id]
            val ownerId = row[SharedFoldersTable.ownerId]
            val head = heads[id].orEmpty()
            val covers = head.take(CurationPolicy.COVER_COUNT).map { it[SharedFolderItemsTable.videoId] }
            val isUser = row[SharedFoldersTable.kind] == KIND_USER
            PublicFolderSummaryDto(
                id = id.toString(),
                kind = row[SharedFoldersTable.kind],
                title = row[SharedFoldersTable.title],
                titleI18n = if (isUser) EMPTY_OBJECT else row[SharedFoldersTable.titleI18n].asObject(),
                descriptionI18n = if (isUser) EMPTY_OBJECT else row[SharedFoldersTable.descriptionI18n].asObject(),
                month = row[SharedFoldersTable.month]?.let { MONTH_FORMAT.format(it) },
                owner = ownerId?.let { owners[it] ?: PublicOwnerDto(it.toString(), null, false, null) },
                itemCount = counts[id] ?: 0,
                coverVideoId = covers.firstOrNull(),
                coverVideoIds = covers,
                artists = head.take(CurationPolicy.ARTIST_SCAN)
                    .mapNotNull { it.getOrNull(VideoTitlesTable.author)?.trim()?.takeIf { a -> a.isNotEmpty() } }
                    .distinct()
                    .take(CurationPolicy.ARTIST_COUNT),
                likeCount = row[SharedFoldersTable.likeCount],
                likedByMe = id in liked,
                cloneCount = row[SharedFoldersTable.cloneCount],
                autoSync = row[SharedFoldersTable.autoSync],
                publishedAt = row[SharedFoldersTable.publishedAt]?.let { ts(it) }
            )
        }
    }

    /** 공개 열만: public_name·크리에이터 표시. display_name·이메일은 읽지 않는다 */
    private fun Transaction.publicOwners(ids: Collection<UUID>): Map<UUID, PublicOwnerDto> {
        if (ids.isEmpty()) return emptyMap()
        return ProfilesTable
            .select(ProfilesTable.id, ProfilesTable.publicName, ProfilesTable.isCreator, ProfilesTable.creatorBadge)
            .where { ProfilesTable.id inList ids.distinct() }
            .associate {
                it[ProfilesTable.id] to PublicOwnerDto(
                    id = it[ProfilesTable.id].toString(),
                    publicName = it[ProfilesTable.publicName],
                    isCreator = it[ProfilesTable.isCreator],
                    creatorBadge = it[ProfilesTable.creatorBadge]
                )
            }
    }

    /** `GET /community/folders?sort=&cursor=` — cursor = 다음 시작 위치(불투명 문자열로 다룬다) */
    suspend fun listFolders(viewerId: UUID, sort: String, cursor: Int): PublicFolderListResponse =
        DatabaseFactory.dbQuery(requireDb()) {
            val order: Array<Pair<Expression<*>, SortOrder>> = when (sort) {
                "clones" -> arrayOf(SharedFoldersTable.cloneCount to SortOrder.DESC, SharedFoldersTable.publishedAt to SortOrder.DESC_NULLS_LAST)
                "likes" -> arrayOf(SharedFoldersTable.likeCount to SortOrder.DESC, SharedFoldersTable.publishedAt to SortOrder.DESC_NULLS_LAST)
                else -> arrayOf(SharedFoldersTable.publishedAt to SortOrder.DESC_NULLS_LAST)
            }
            val rows = SharedFoldersTable.selectAll()
                .where { visibleUserFolders() }
                .orderBy(*order, SharedFoldersTable.id to SortOrder.ASC)
                .limit(PAGE_SIZE + 1)
                .offset(cursor.toLong())
                .toList()
            val page = rows.take(PAGE_SIZE)
            val paid = paidOwners(page.mapNotNull { it[SharedFoldersTable.ownerId] })
            PublicFolderListResponse(
                folders = publicSummaries(page.filter { it[SharedFoldersTable.ownerId] in paid }, viewerId),
                next = if (rows.size > PAGE_SIZE) (cursor + PAGE_SIZE).toString() else null
            )
        }

    /** `GET /community/folders/{id}` — 비공개·숨김은 404 */
    suspend fun getFolder(viewerId: UUID, folderId: UUID): PublicFolderDetailResponse {
        val database = requireDb()
        DatabaseFactory.dbQuery(database) { requireVisibleFolder(folderId) }
        fillTitlesForFolder(folderId)
        return DatabaseFactory.dbQuery(database) {
            val row = requireVisibleFolder(folderId)
            PublicFolderDetailResponse(
                folder = publicSummaries(listOf(row), viewerId).single(),
                items = publicItems(folderId)
            )
        }
    }

    private fun Transaction.publicItems(folderId: UUID): List<PublicFolderItemDto> = publicFolderItems(folderId)

    // ================= 홈 큐레이션 (M1-4b, 설계 §5-5) =================

    /**
     * `GET /curation/home` — 무료도 열람(Q10). 줄 넷: 운영자 큐레이션(`sort_order` → 만든 순), 이달의 곡(E4),
     * 쇼케이스(E5, [CurationPolicy]), 팔로잉(내가 팔로우한 사람의 공개 user 폴더 최근 순)
     */
    suspend fun curationHome(viewerId: UUID, now: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)): CurationHomeResponse {
        val database = requireDb()
        val pickId = DatabaseFactory.dbQuery(database) { monthlyPickRow(now)?.get(SharedFoldersTable.id) }
        if (pickId != null) fillTitlesForFolder(pickId)
        return DatabaseFactory.dbQuery(database) {
            val curated = SharedFoldersTable.selectAll()
                .where { visibleOperatorFolders(KIND_CURATED) }
                .orderBy(
                    SharedFoldersTable.sortOrder to SortOrder.ASC,
                    SharedFoldersTable.createdAt to SortOrder.ASC,
                    SharedFoldersTable.id to SortOrder.ASC
                )
                .limit(CurationPolicy.SECTION_MAX)
                .toList()
            val pick = monthlyPickRow(now)
            CurationHomeResponse(
                curated = publicSummaries(curated, viewerId),
                monthlyPick = pick?.let {
                    MonthlyPickDto(publicSummaries(listOf(it), viewerId).single(), publicItems(it[SharedFoldersTable.id]))
                },
                showcase = publicSummaries(showcaseRows(), viewerId),
                following = publicSummaries(followingRows(viewerId), viewerId)
            )
        }
    }

    /** 이달의 곡(E4): KST 이번 달 공개본, 없으면 가장 최근 지난 달 것. 앞으로 올 달은 미리 만들어도 안 보인다 */
    private fun Transaction.monthlyPickRow(now: OffsetDateTime): ResultRow? {
        val thisMonth = now.atZoneSameInstant(KST).toLocalDate().withDayOfMonth(1)
        return SharedFoldersTable.selectAll()
            .where { visibleOperatorFolders(KIND_MONTHLY_PICK) and (SharedFoldersTable.month lessEq thisMonth) }
            .orderBy(SharedFoldersTable.month to SortOrder.DESC)
            .limit(1)
            .singleOrNull()
    }

    /** 팔로우한 사람(유료)의 공개 user 폴더, 최근 게시 순 */
    private fun Transaction.followingRows(viewerId: UUID): List<ResultRow> {
        val followees = FollowsTable.select(FollowsTable.followeeId)
            .where { FollowsTable.followerId eq viewerId }
            .map { it[FollowsTable.followeeId] }
        val paid = paidOwners(followees)
        if (paid.isEmpty()) return emptyList()
        return SharedFoldersTable.selectAll()
            .where { visibleUserFolders() and (SharedFoldersTable.ownerId inList paid) }
            .orderBy(SharedFoldersTable.publishedAt to SortOrder.DESC_NULLS_LAST, SharedFoldersTable.id to SortOrder.ASC)
            .limit(CurationPolicy.SECTION_MAX)
            .toList()
    }

    /**
     * 쇼케이스(E5): 크리에이터 전원 + 팔로워 상위 사용자(크리에이터 아님)의 **자동 연동** 공개 user 폴더.
     * 소유자 = 커뮤니티 이름 있음·실제 티어 유료. 크리에이터 몫 먼저, 각 몫 안에서 팔로워 수 → 최근 게시.
     * 칸 나눔·한 사람 최대 칸은 [CurationPolicy]
     */
    private fun Transaction.showcaseRows(): List<ResultRow> {
        val creators = ProfilesTable.select(ProfilesTable.id)
            .where { (ProfilesTable.isCreator eq true) and ProfilesTable.publicName.isNotNull() }
            .map { it[ProfilesTable.id] }
        val followerExpr = FollowsTable.followerId.count()
        // 무료·폴더 없는 사람을 걸러도 N명이 남도록 넉넉히 읽는다
        val popularCandidates = FollowsTable
            .join(ProfilesTable, JoinType.INNER, FollowsTable.followeeId, ProfilesTable.id)
            .select(FollowsTable.followeeId, followerExpr)
            .where { (ProfilesTable.isCreator eq false) and ProfilesTable.publicName.isNotNull() }
            .groupBy(FollowsTable.followeeId)
            .having { followerExpr greaterEq CurationPolicy.SHOWCASE_MIN_FOLLOWERS.toLong() }
            .orderBy(followerExpr to SortOrder.DESC, FollowsTable.followeeId to SortOrder.ASC)
            .limit(CurationPolicy.SHOWCASE_POPULAR_USERS * 5)
            .associate { it[FollowsTable.followeeId] to it[followerExpr] }

        val paid = paidOwners(creators + popularCandidates.keys)
        if (paid.isEmpty()) return emptyList()
        val byOwner = SharedFoldersTable.selectAll()
            .where { visibleUserFolders() and (SharedFoldersTable.autoSync eq true) and (SharedFoldersTable.ownerId inList paid) }
            .orderBy(SharedFoldersTable.publishedAt to SortOrder.DESC_NULLS_LAST, SharedFoldersTable.id to SortOrder.ASC)
            .toList()
            .groupBy { it[SharedFoldersTable.ownerId]!! }
        val creatorFollowers = if (creators.isEmpty()) emptyMap() else
            FollowsTable.select(FollowsTable.followeeId, followerExpr)
                .where { FollowsTable.followeeId inList creators }
                .groupBy(FollowsTable.followeeId)
                .associate { it[FollowsTable.followeeId] to it[followerExpr] }

        fun rowsOf(owners: List<UUID>, followers: Map<UUID, Long>): List<ResultRow> = owners
            .filter { it in byOwner }
            .sortedWith(compareByDescending<UUID> { followers[it] ?: 0L }.thenBy { it.toString() })
            .flatMap { owner ->
                val rows = byOwner.getValue(owner)
                if (CurationPolicy.SHOWCASE_PER_USER_MAX > 0) rows.take(CurationPolicy.SHOWCASE_PER_USER_MAX) else rows
            }

        val creatorRows = rowsOf(creators.filter { it in paid }, creatorFollowers)
        val popularOwners = popularCandidates.keys.filter { it in paid && it in byOwner }.take(CurationPolicy.SHOWCASE_POPULAR_USERS)
        val popularRows = rowsOf(popularOwners, popularCandidates)
        val popularTake = popularRows.take(
            CurationPolicy.SHOWCASE_TOTAL - minOf(creatorRows.size, CurationPolicy.SHOWCASE_CREATOR_MAX)
        )
        return creatorRows.take(CurationPolicy.SHOWCASE_TOTAL - popularTake.size) + popularTake
    }

    /** 공개본 항목 중 `video_titles`에 없는 영상의 YouTube 제목을 받아 둔다(트랜잭션 밖, N3). 실패는 건너뜀 */
    suspend fun fillTitlesForFolder(folderId: UUID) {
        val missing = DatabaseFactory.dbQuery(requireDb()) {
            SharedFolderItemsTable
                .join(VideoTitlesTable, JoinType.LEFT, SharedFolderItemsTable.videoId, VideoTitlesTable.videoId)
                .select(SharedFolderItemsTable.videoId)
                .where { (SharedFolderItemsTable.folderId eq folderId) and VideoTitlesTable.videoId.isNull() }
                .orderBy(SharedFolderItemsTable.position to SortOrder.ASC)
                .limit(MAX_TITLE_FETCH)
                .map { it[SharedFolderItemsTable.videoId] }
        }
        fetchTitles(missing)
    }

    /** 영상 목록 중 `video_titles`에 없는 것만 받아 둔다(학습 기록의 오늘 곡도 쓴다) */
    suspend fun fillTitles(videoIds: Collection<String>) {
        if (videoIds.isEmpty()) return
        val wanted = videoIds.distinct()
        val known = DatabaseFactory.dbQuery(requireDb()) {
            VideoTitlesTable.select(VideoTitlesTable.videoId)
                .where { VideoTitlesTable.videoId inList wanted }
                .map { it[VideoTitlesTable.videoId] }
                .toSet()
        }
        fetchTitles(wanted.filter { it !in known }.take(MAX_TITLE_FETCH))
    }

    private suspend fun fetchTitles(missing: List<String>) {
        val database = requireDb()
        if (missing.isEmpty()) return
        val fetched = coroutineScope {
            val sem = Semaphore(8)
            missing.map { videoId -> async { sem.withPermit { videoId to videoMetaClient.fetch(videoId) } } }.awaitAll()
        }.mapNotNull { (videoId, meta) -> meta?.let { videoId to it } }
        if (fetched.isEmpty()) return
        DatabaseFactory.dbQuery(database) {
            VideoTitlesTable.batchInsert(fetched, ignore = true) { (videoId, meta) ->
                this[VideoTitlesTable.videoId] = videoId
                this[VideoTitlesTable.title] = meta.title.take(300)
                this[VideoTitlesTable.author] = meta.author.take(200)
            }
        }
    }

    // ================= 좋아요 =================

    /** `PUT|DELETE /community/folders/{id}/like` — 멱등. 자기 폴더 400 */
    suspend fun setLike(viewerId: UUID, folderId: UUID, liked: Boolean): FolderLikeResponse =
        DatabaseFactory.dbQuery(requireDb()) {
            val row = requireVisibleFolder(folderId)
            if (row[SharedFoldersTable.ownerId] == viewerId) {
                throw InvalidInputException("내 폴더에는 좋아요를 누를 수 없습니다.")
            }
            if (liked) {
                val inserted = FolderLikesTable.insertIgnore {
                    it[FolderLikesTable.folderId] = folderId
                    it[userId] = viewerId
                }.insertedCount
                if (inserted == 1) {
                    SharedFoldersTable.update({ SharedFoldersTable.id eq folderId }) {
                        with(SqlExpressionBuilder) { it[likeCount] = likeCount + 1 }
                    }
                }
            } else {
                val deleted = FolderLikesTable.deleteWhere {
                    (FolderLikesTable.folderId eq folderId) and (FolderLikesTable.userId eq viewerId)
                }
                if (deleted > 0) {
                    SharedFoldersTable.update({ SharedFoldersTable.id eq folderId }) {
                        with(SqlExpressionBuilder) { it[likeCount] = likeCount - 1 }
                    }
                }
            }
            FolderLikeResponse(liked, loadFolder(folderId)[SharedFoldersTable.likeCount])
        }

    // ================= 복제 =================

    /**
     * `POST /community/folders/{id}/clone` — 유료만. 새 분류(이름 = 공개 제목, 겹치면 " (2)")에 폴더 순서대로
     * 남은 곡 칸까지. 이미 있는 곡은 칸을 쓰지 않고 분류에만. 새 곡 제목·아티스트 = YouTube 원래 값(N3).
     * 분류 칸 없음 403 `CATEGORY_LIMIT_EXCEEDED`(아무것도 안 만듦)
     */
    suspend fun clone(userId: UUID, folderId: UUID): FolderCloneResponse {
        val database = requireDb()
        DatabaseFactory.dbQuery(database) {
            requireCommunityWrite(tierContext(userId))
            val row = requireVisibleFolder(folderId)
            if (row[SharedFoldersTable.ownerId] == userId) throw InvalidInputException("내 폴더는 복제할 수 없습니다.")
        }
        fillTitlesForFolder(folderId)
        return DatabaseFactory.dbQuery(database) {
            val ctx = tierContext(userId, lock = true)
            requireCommunityWrite(ctx)
            val folder = requireVisibleFolder(folderId)
            if (folder[SharedFoldersTable.ownerId] == userId) throw InvalidInputException("내 폴더는 복제할 수 없습니다.")
            requireCategorySlot(ctx)
            val categoryId = insertCategory(userId, freeCategoryName(userId, folder[SharedFoldersTable.title]))

            val items = publicItems(folderId)
            val existing: Map<String, UUID> = if (items.isEmpty()) emptyMap() else
                SongsTable.select(SongsTable.videoId, SongsTable.id)
                    .where { (SongsTable.userId eq userId) and (SongsTable.videoId inList items.map { it.videoId }) }
                    .associate { it[SongsTable.videoId] to it[SongsTable.id] }

            var remaining = remainingSongSlots(ctx) // null = 제한 없음
            var imported = 0
            var already = 0
            var skippedLimit = 0
            val itemRows = SharedFolderItemsTable.selectAll()
                .where { SharedFolderItemsTable.folderId eq folderId }
                .associateBy { it[SharedFolderItemsTable.videoId] }
            for (item in items) {
                val songId = existing[item.videoId]
                if (songId != null) {
                    linkCategory(userId, songId, categoryId)
                    already++
                    continue
                }
                if (remaining != null && remaining <= 0L) {
                    skippedLimit++
                    continue
                }
                val src = itemRows.getValue(item.videoId)
                val newId = UUID.randomUUID()
                SongsTable.insert {
                    it[id] = newId
                    it[SongsTable.userId] = userId
                    it[title] = item.title ?: SongService.UNTITLED
                    it[artist] = item.artist.orEmpty()
                    it[videoId] = item.videoId
                    it[a] = src[SharedFolderItemsTable.a]
                    it[b] = src[SharedFolderItemsTable.b]
                    it[rate] = src[SharedFolderItemsTable.rate]
                }
                OutboxRepository.enqueueIfSyncEnabled(userId, "song", newId, "upsert")
                linkCategory(userId, newId, categoryId)
                imported++
                if (remaining != null) remaining--
            }
            SharedFoldersTable.update({ SharedFoldersTable.id eq folderId }) {
                with(SqlExpressionBuilder) { it[cloneCount] = cloneCount + 1 }
            }
            SharedFolderSync.resyncCategories(this, userId, listOf(categoryId)) // 새 분류라 공개본은 아직 없다(설계 §4 호출 지점)
            FolderCloneResponse(categoryId.toString(), imported, already, skippedLimit)
        }
    }

    private fun Transaction.linkCategory(userId: UUID, songId: UUID, categoryId: UUID) {
        SongCategoriesTable.insertIgnore {
            it[SongCategoriesTable.userId] = userId
            it[SongCategoriesTable.songId] = songId
            it[SongCategoriesTable.categoryId] = categoryId
        }
    }

    /** 내 분류와 겹치지 않는 이름(대소문자 무시). 겹치면 "제목 (2)"… 분류 이름 길이(20) 안에서 */
    private fun Transaction.freeCategoryName(userId: UUID, title: String): String {
        val taken = CategoriesTable.select(CategoriesTable.name)
            .where { CategoriesTable.userId eq userId }
            .map { it[CategoriesTable.name].lowercase() }
            .toSet()
        val base = title.take(CategoryService.MAX_NAME_LENGTH).trim()
        if (base.lowercase() !in taken) return base
        for (n in 2..99) {
            val suffix = " ($n)"
            val candidate = base.take(CategoryService.MAX_NAME_LENGTH - suffix.length).trimEnd() + suffix
            if (candidate.lowercase() !in taken) return candidate
        }
        throw ConflictException("같은 이름의 분류가 너무 많습니다.")
    }

    // ================= 팔로우·사용자 페이지 =================

    /** 커뮤니티에 이름이 있는 사용자(= 게시한 적 있음)만 팔로우·페이지 대상. 없으면 404 */
    private fun Transaction.requirePublicUser(userId: UUID): ResultRow =
        ProfilesTable.selectAll()
            .where { (ProfilesTable.id eq userId) and ProfilesTable.publicName.isNotNull() }
            .singleOrNull() ?: throw NotFoundException("사용자를 찾을 수 없습니다.")

    private fun Transaction.followerCount(userId: UUID): Long =
        FollowsTable.selectAll().where { FollowsTable.followeeId eq userId }.count()

    /** `PUT|DELETE /community/follows/{userId}` — 멱등. 자기 자신 400. 무료도 된다(Q10) */
    suspend fun setFollow(viewerId: UUID, targetId: UUID, follow: Boolean): FollowResponse =
        DatabaseFactory.dbQuery(requireDb()) {
            if (viewerId == targetId) throw InvalidInputException("자기 자신은 팔로우할 수 없습니다.")
            if (follow) {
                requirePublicUser(targetId)
                FollowsTable.insertIgnore {
                    it[followerId] = viewerId
                    it[followeeId] = targetId
                }
            } else {
                FollowsTable.deleteWhere { (FollowsTable.followerId eq viewerId) and (FollowsTable.followeeId eq targetId) }
            }
            FollowResponse(follow, followerCount(targetId))
        }

    /** `GET /community/follows` — 내가 팔로우한 사람 */
    suspend fun listFollows(viewerId: UUID): FollowListResponse = DatabaseFactory.dbQuery(requireDb()) {
        val ids = FollowsTable.select(FollowsTable.followeeId)
            .where { FollowsTable.followerId eq viewerId }
            .orderBy(FollowsTable.createdAt to SortOrder.DESC)
            .map { it[FollowsTable.followeeId] }
        val owners = publicOwners(ids)
        val folderCounts = visibleFolderCounts(ids)
        FollowListResponse(ids.mapNotNull { id ->
            owners[id]?.let { PublicUserSummaryDto(it.id, it.publicName, it.isCreator, it.creatorBadge, folderCounts[id] ?: 0) }
        })
    }

    private fun Transaction.visibleFolderCounts(ownerIds: List<UUID>): Map<UUID, Int> {
        if (ownerIds.isEmpty()) return emptyMap()
        val paid = paidOwners(ownerIds)
        if (paid.isEmpty()) return emptyMap()
        val countExpr = SharedFoldersTable.id.count()
        return SharedFoldersTable.select(SharedFoldersTable.ownerId, countExpr)
            .where { visibleUserFolders() and (SharedFoldersTable.ownerId inList paid) }
            .groupBy(SharedFoldersTable.ownerId)
            .associate { it[SharedFoldersTable.ownerId]!! to it[countExpr].toInt() }
    }

    /** `GET /community/users/{userId}` — 이메일·display_name 없음 */
    suspend fun userPage(viewerId: UUID, targetId: UUID): PublicUserPageResponse = DatabaseFactory.dbQuery(requireDb()) {
        val profile = requirePublicUser(targetId)
        val folders = if (targetId in paidOwners(listOf(targetId))) {
            SharedFoldersTable.selectAll()
                .where { visibleUserFolders() and (SharedFoldersTable.ownerId eq targetId) }
                .orderBy(SharedFoldersTable.publishedAt to SortOrder.DESC_NULLS_LAST, SharedFoldersTable.id to SortOrder.ASC)
                .toList()
        } else {
            emptyList()
        }
        PublicUserPageResponse(
            id = targetId.toString(),
            publicName = profile[ProfilesTable.publicName],
            isCreator = profile[ProfilesTable.isCreator],
            creatorBadge = profile[ProfilesTable.creatorBadge],
            creatorBio = profile[ProfilesTable.creatorBio],
            followerCount = followerCount(targetId),
            followingByMe = FollowsTable.selectAll()
                .where { (FollowsTable.followerId eq viewerId) and (FollowsTable.followeeId eq targetId) }
                .count() > 0L,
            folders = publicSummaries(folders, viewerId),
            practiceLog = null // 라우트가 PracticeLogService로 채운다(동의한 유료만)
        )
    }

    // ================= 신고 =================

    /** `POST /community/folders/{id}/reports` `{reason, detail?}` — detail은 owner만 본다. 열린 신고 중복 409 */
    suspend fun report(viewerId: UUID, folderId: UUID, reason: String, detail: String): FolderReportResponse =
        DatabaseFactory.dbQuery(requireDb()) {
            val row = requireVisibleFolder(folderId)
            if (row[SharedFoldersTable.kind] != KIND_USER) throw InvalidInputException("운영자 폴더는 신고할 수 없습니다.")
            if (row[SharedFoldersTable.ownerId] == viewerId) throw InvalidInputException("내 폴더는 신고할 수 없습니다.")
            val open = FolderReportsTable.selectAll()
                .where {
                    (FolderReportsTable.folderId eq folderId) and (FolderReportsTable.reporterId eq viewerId) and
                        (FolderReportsTable.status eq "open")
                }
                .count() > 0L
            if (open) throw ConflictException("이미 신고한 폴더입니다. 처리될 때까지 기다려 주세요.", "ALREADY_REPORTED")
            val id = try {
                FolderReportsTable.insert {
                    it[FolderReportsTable.folderId] = folderId
                    it[reporterId] = viewerId
                    it[FolderReportsTable.reason] = reason
                    it[FolderReportsTable.detail] = detail
                } get FolderReportsTable.id
            } catch (e: ExposedSQLException) {
                if (e.sqlState == "23505") throw ConflictException("이미 신고한 폴더입니다. 처리될 때까지 기다려 주세요.", "ALREADY_REPORTED")
                throw e
            }
            FolderReportResponse(id)
        }
}

/** 운영자 폴더 JSON 열 → 객체(형식이 틀리면 빈 객체) */
internal fun JsonElement.asObject(): JsonObject = this as? JsonObject ?: CommunityService.EMPTY_OBJECT

/** 공개본 항목(위치 순). 제목·아티스트 = `video_titles`(YouTube 값), 운영자 곡 설명 `noteI18n`. 관리 API도 쓴다 */
internal fun Transaction.publicFolderItems(folderId: UUID): List<PublicFolderItemDto> =
        SharedFolderItemsTable
            .join(VideoTitlesTable, JoinType.LEFT, SharedFolderItemsTable.videoId, VideoTitlesTable.videoId)
            .select(
                SharedFolderItemsTable.videoId, SharedFolderItemsTable.position, SharedFolderItemsTable.a,
                SharedFolderItemsTable.b, SharedFolderItemsTable.rate, SharedFolderItemsTable.noteI18n,
                VideoTitlesTable.title, VideoTitlesTable.author
            )
            .where { SharedFolderItemsTable.folderId eq folderId }
            .orderBy(SharedFolderItemsTable.position to SortOrder.ASC)
            .map {
                PublicFolderItemDto(
                    videoId = it[SharedFolderItemsTable.videoId],
                    position = it[SharedFolderItemsTable.position],
                    title = it.getOrNull(VideoTitlesTable.title),
                    artist = it.getOrNull(VideoTitlesTable.author),
                    a = it[SharedFolderItemsTable.a]?.toDouble(),
                    b = it[SharedFolderItemsTable.b]?.toDouble(),
                    rate = it[SharedFolderItemsTable.rate].toDouble(),
                    noteI18n = it[SharedFolderItemsTable.noteI18n].asObject()
                )
            }
