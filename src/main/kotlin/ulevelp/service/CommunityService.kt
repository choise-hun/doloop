package ulevelp.service

import io.ktor.http.*
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.Serializable
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
import ulevelp.service.SharedFolderSync.KIND_USER
import ulevelp.service.SharedFolderSync.copyCategory
import java.time.OffsetDateTime
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

@Serializable
data class PublicFolderSummaryDto(
    val id: String,
    val title: String,
    val owner: PublicOwnerDto,
    val itemCount: Int,
    val coverVideoId: String?,
    val likeCount: Int,
    val likedByMe: Boolean,
    val cloneCount: Int,
    val autoSync: Boolean,
    val publishedAt: String?
)

@Serializable
data class PublicFolderListResponse(val folders: List<PublicFolderSummaryDto>, val next: String?)

/** 제목·아티스트는 YouTube 원래 값(N3, `video_titles`). 아직 못 받았으면 null */
@Serializable
data class PublicFolderItemDto(
    val videoId: String,
    val position: Int,
    val title: String?,
    val artist: String?,
    val a: Double?,
    val b: Double?,
    val rate: Double
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

/** 학습 기록(`practiceLog`)은 M1-4b */
@Serializable
data class PublicUserPageResponse(
    val id: String,
    val publicName: String?,
    val isCreator: Boolean,
    val creatorBadge: String?,
    val creatorBio: String,
    val followerCount: Long,
    val followingByMe: Boolean,
    val folders: List<PublicFolderSummaryDto>
)

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
        fillTitlesForFolder(database, UUID.fromString(summary.folderId))
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
        fillTitlesForFolder(database, UUID.fromString(summary.folderId))
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

    /** 보이는 user 폴더 하나 — 비공개·숨김·없음·무료 소유자는 404 */
    private fun Transaction.requireVisibleUserFolder(folderId: UUID): ResultRow {
        val row = SharedFoldersTable.selectAll()
            .where { (SharedFoldersTable.id eq folderId) and visibleUserFolders() }
            .singleOrNull() ?: throw NotFoundException("공개 폴더를 찾을 수 없습니다.")
        if (row[SharedFoldersTable.ownerId]!! !in paidOwners(listOf(row[SharedFoldersTable.ownerId]!!))) {
            throw NotFoundException("공개 폴더를 찾을 수 없습니다.")
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
        val covers = SharedFolderItemsTable.select(SharedFolderItemsTable.folderId, SharedFolderItemsTable.videoId)
            .where { (SharedFolderItemsTable.folderId inList folderIds) and (SharedFolderItemsTable.position eq 0) }
            .associate { it[SharedFolderItemsTable.folderId] to it[SharedFolderItemsTable.videoId] }
        val liked = FolderLikesTable.select(FolderLikesTable.folderId)
            .where { (FolderLikesTable.userId eq viewerId) and (FolderLikesTable.folderId inList folderIds) }
            .map { it[FolderLikesTable.folderId] }
            .toSet()
        val owners = publicOwners(rows.mapNotNull { it[SharedFoldersTable.ownerId] })
        return rows.map { row ->
            val id = row[SharedFoldersTable.id]
            val ownerId = row[SharedFoldersTable.ownerId]!!
            PublicFolderSummaryDto(
                id = id.toString(),
                title = row[SharedFoldersTable.title],
                owner = owners[ownerId] ?: PublicOwnerDto(ownerId.toString(), null, false, null),
                itemCount = counts[id] ?: 0,
                coverVideoId = covers[id],
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
        DatabaseFactory.dbQuery(database) { requireVisibleUserFolder(folderId) }
        fillTitlesForFolder(database, folderId)
        return DatabaseFactory.dbQuery(database) {
            val row = requireVisibleUserFolder(folderId)
            PublicFolderDetailResponse(
                folder = publicSummaries(listOf(row), viewerId).single(),
                items = publicItems(folderId)
            )
        }
    }

    private fun Transaction.publicItems(folderId: UUID): List<PublicFolderItemDto> =
        SharedFolderItemsTable
            .join(VideoTitlesTable, JoinType.LEFT, SharedFolderItemsTable.videoId, VideoTitlesTable.videoId)
            .select(
                SharedFolderItemsTable.videoId, SharedFolderItemsTable.position, SharedFolderItemsTable.a,
                SharedFolderItemsTable.b, SharedFolderItemsTable.rate, VideoTitlesTable.title, VideoTitlesTable.author
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
                    rate = it[SharedFolderItemsTable.rate].toDouble()
                )
            }

    /** 공개본 항목 중 `video_titles`에 없는 영상의 YouTube 제목을 받아 둔다(트랜잭션 밖, N3). 실패는 건너뜀 */
    private suspend fun fillTitlesForFolder(database: Database, folderId: UUID) {
        val missing = DatabaseFactory.dbQuery(database) {
            SharedFolderItemsTable
                .join(VideoTitlesTable, JoinType.LEFT, SharedFolderItemsTable.videoId, VideoTitlesTable.videoId)
                .select(SharedFolderItemsTable.videoId)
                .where { (SharedFolderItemsTable.folderId eq folderId) and VideoTitlesTable.videoId.isNull() }
                .orderBy(SharedFolderItemsTable.position to SortOrder.ASC)
                .limit(MAX_TITLE_FETCH)
                .map { it[SharedFolderItemsTable.videoId] }
        }
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
            val row = requireVisibleUserFolder(folderId)
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
            val row = requireVisibleUserFolder(folderId)
            if (row[SharedFoldersTable.ownerId] == userId) throw InvalidInputException("내 폴더는 복제할 수 없습니다.")
        }
        fillTitlesForFolder(database, folderId)
        return DatabaseFactory.dbQuery(database) {
            val ctx = tierContext(userId, lock = true)
            requireCommunityWrite(ctx)
            val folder = requireVisibleUserFolder(folderId)
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
            folders = publicSummaries(folders, viewerId)
        )
    }

    // ================= 신고 =================

    /** `POST /community/folders/{id}/reports` `{reason, detail?}` — detail은 owner만 본다. 열린 신고 중복 409 */
    suspend fun report(viewerId: UUID, folderId: UUID, reason: String, detail: String): FolderReportResponse =
        DatabaseFactory.dbQuery(requireDb()) {
            val row = requireVisibleUserFolder(folderId)
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
