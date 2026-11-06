package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import ulevelp.api.*
import ulevelp.auth.AuthenticatedUser
import ulevelp.db.*
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@Serializable
data class KeySummaryDto(
    val hint: String,
    val updatedAt: String
)

@Serializable
data class KeysStatusDto(
    val notion: KeySummaryDto? = null
)

@Serializable
data class MeResponseDto(
    val id: String,
    val email: String,
    val displayName: String,
    val role: String,
    val storageProvider: String,
    val driveFolderId: String? = null,
    val takeUsedBytes: Long,
    val takeQuotaBytes: Long,
    val migratedLocalAt: String? = null,
    val keys: KeysStatusDto,
    // V5 티어·크레딧 (개발산출물/결과/M1-1_스키마설계.md §5-1). tier = 실제 티어(override 반영)
    val tier: String,
    val billingTier: String,
    val tierOverrideUntil: String? = null,
    val limits: TierLimitsDto,
    val usage: TierUsageDto,
    val credits: CreditsDto,
    val locale: String? = null,
    val isCreator: Boolean,
    val creatorBadge: String? = null,
    val creatorBio: String,
    val shareAutosync: Boolean,
    val sharePracticeLog: Boolean,
    // 커뮤니티 이름(N2, M1-4a) — 커뮤니티 처음 쓸 때 직접 정함. null = 아직 안 정함
    val publicName: String? = null,
    // 다음에 이름을 바꿀 수 있는 시각(7일에 한 번). null = 지금 바로 된다
    val publicNameNextChangeAt: String? = null
)

class ProfileService(private val db: Database?) {

    private val deletedUserIds: MutableSet<UUID> = ConcurrentHashMap.newKeySet()

    companion object {
        const val CONFIRM_DELETE_TEXT = "삭제합니다"
        private val VALID_STORAGE_PROVIDERS = setOf("supabase", "drive")

        private fun formatTimestamp(dt: OffsetDateTime): String =
            DateTimeFormatter.ISO_INSTANT.format(dt.toInstant())

        private fun parseIsoTimestamp(raw: String, fieldName: String): OffsetDateTime {
            return try {
                OffsetDateTime.parse(raw).withOffsetSameInstant(ZoneOffset.UTC)
            } catch (_: DateTimeParseException) {
                try {
                    Instant.parse(raw).atOffset(ZoneOffset.UTC)
                } catch (_: DateTimeParseException) {
                    throw InvalidInputException("$fieldName 형식이 올바른 ISO-8601 시각이 아닙니다.")
                }
            }
        }
    }

    private fun requireDb(): Database =
        db ?: throw ApiException(
            status = HttpStatusCode.ServiceUnavailable,
            code = "DB_UNAVAILABLE",
            message = "데이터베이스가 연결되어 있지 않습니다."
        )

    /**
     * 인증된 첫 요청 시 `users`와 `profiles`를 `INSERT ... ON CONFLICT (id) DO NOTHING`으로 보장하고,
     * 이메일이 변경된 경우 `users.email`만 갱신한다 (`docs/03-api-spec.md` 2.1절, `FR-AUTH-2`).
     *
     * - 이미 탈퇴(`deleteMe`)한 사용자의 잔여 토큰 요청은 재생성하지 않고 `401 UNAUTHORIZED`로 차단한다.
     * - 기존 사용자는 단일 `SELECT`로 확인하여 이메일 변경이 없으면 쓰기 쿼리를 발생시키지 않는다.
     */
    suspend fun ensureUserAndProfile(user: AuthenticatedUser) {
        if (user.id in deletedUserIds) {
            throw UnauthorizedException("탈퇴 처리된 계정입니다.")
        }

        val database = requireDb()
        DatabaseFactory.dbQuery(database) {
            val existingEmail = (UsersTable innerJoin ProfilesTable)
                .select(UsersTable.email)
                .where { UsersTable.id eq user.id }
                .singleOrNull()
                ?.get(UsersTable.email)

            if (existingEmail != null) {
                if (user.email.isNotEmpty() && existingEmail != user.email) {
                    UsersTable.update({ UsersTable.id eq user.id }) {
                        it[email] = user.email
                    }
                }
                return@dbQuery
            }

            UsersTable.insertIgnore {
                it[id] = user.id
                it[email] = user.email
            }

            if (user.email.isNotEmpty()) {
                UsersTable.update({ (UsersTable.id eq user.id) and (UsersTable.email neq user.email) }) {
                    it[email] = user.email
                }
            }

            ProfilesTable.insertIgnore {
                it[id] = user.id
                it[displayName] = user.displayNameHint
            }
        }
    }

    /**
     * `GET /api/v1/me` — 내 프로필, 스토리지 사용량/한도, 로컬 기록 이관 시각, 키 등록 요약 반환 (`docs/03-api-spec.md` 2.2절).
     */
    suspend fun getMe(userId: UUID): MeResponseDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            loadMeInTransaction(userId)
        }
    }

    /**
     * `PATCH /api/v1/me` — 표시 이름, 저장소 종류, 드라이브 폴더 ID, 로컬 이관 시각만 수정 (`docs/03-api-spec.md` 2.3절).
     * `role` 및 `takeQuotaBytes`는 요청 본문에 포함되더라도 무시한다 (`FR-AUTH-3`).
     * 노션 실시간 연동이 활성화된 상태에서 `storageProvider = "drive"` 변경은 `409 Conflict`로 거부한다 (`FR-SYNC-5`).
     */
    suspend fun patchMe(userId: UUID, body: JsonObject): MeResponseDto {
        val database = requireDb()

        val hasDisplayName = body.containsKey("displayName")
        val newDisplayName: String? = if (hasDisplayName) {
            val elem = body["displayName"]
            if (elem !is JsonPrimitive || !elem.isString) {
                throw InvalidInputException("displayName은 문자열이어야 합니다.")
            }
            val trimmed = elem.content.trim()
            if (trimmed.length > 100) {
                throw InvalidInputException("displayName은 100자 이하여야 합니다.")
            }
            trimmed
        } else {
            null
        }

        val hasStorageProvider = body.containsKey("storageProvider")
        val newStorageProvider: String? = if (hasStorageProvider) {
            val elem = body["storageProvider"]
            if (elem !is JsonPrimitive || !elem.isString || elem.content !in VALID_STORAGE_PROVIDERS) {
                throw InvalidInputException("storageProvider는 'supabase' 또는 'drive'여야 합니다.")
            }
            elem.content
        } else {
            null
        }

        val hasDriveFolderId = body.containsKey("driveFolderId")
        val newDriveFolderId: String? = if (hasDriveFolderId) {
            when (val elem = body["driveFolderId"]) {
                null, is JsonNull -> null
                is JsonPrimitive -> {
                    if (!elem.isString) {
                        throw InvalidInputException("driveFolderId는 문자열 또는 null이어야 합니다.")
                    }
                    elem.content.trim().takeIf { it.isNotEmpty() }
                }
                else -> throw InvalidInputException("driveFolderId는 문자열 또는 null이어야 합니다.")
            }
        } else {
            null
        }

        val hasMigratedLocalAt = body.containsKey("migratedLocalAt")
        val newMigratedLocalAt: OffsetDateTime? = if (hasMigratedLocalAt) {
            when (val elem = body["migratedLocalAt"]) {
                null, is JsonNull -> null
                is JsonPrimitive -> {
                    if (!elem.isString) {
                        throw InvalidInputException("migratedLocalAt은 ISO-8601 문자열 또는 null이어야 합니다.")
                    }
                    parseIsoTimestamp(elem.content, "migratedLocalAt")
                }
                else -> throw InvalidInputException("migratedLocalAt은 ISO-8601 문자열 또는 null이어야 합니다.")
            }
        } else {
            null
        }

        // 설정 "연습 리스트 공유 자동 연동"(M1-1 §4). 켜기는 유료만, 끄면 모든 폴더 auto_sync=false(마지막 공개본은 남음)
        val hasShareAutosync = body.containsKey("shareAutosync")
        val newShareAutosync: Boolean? = if (hasShareAutosync) {
            val elem = body["shareAutosync"]
            if (elem !is JsonPrimitive || elem.isString || elem.booleanOrNull == null) {
                throw InvalidInputException("shareAutosync는 불리언이어야 합니다.")
            }
            elem.boolean
        } else {
            null
        }

        return DatabaseFactory.dbQuery(database) {
            if (newShareAutosync == true) {
                requireCommunityWrite(tierContext(userId))
            }
            if (newShareAutosync == false) {
                SharedFoldersTable.update({ SharedFoldersTable.ownerId eq userId }) {
                    it[autoSync] = false
                }
            }

            if (newStorageProvider == "drive") {
                requireDrive(tierContext(userId)) // 무료는 Drive 불가(M1-1 §5-1)
                val notionSyncEnabled = NotionSyncTable
                    .selectAll()
                    .where { (NotionSyncTable.userId eq userId) and (NotionSyncTable.enabled eq true) }
                    .count() > 0L
                if (notionSyncEnabled) {
                    throw ConflictException(
                        message = "노션 실시간 연동이 켜져 있는 동안에는 Google Drive 저장소로 변경할 수 없습니다.",
                        code = "NOTION_SYNC_CONFLICT"
                    )
                }
            }

            if (hasDisplayName || hasStorageProvider || hasDriveFolderId || hasMigratedLocalAt || newShareAutosync != null) {
                ProfilesTable.update({ ProfilesTable.id eq userId }) {
                    if (newShareAutosync != null) {
                        it[shareAutosync] = newShareAutosync
                    }
                    if (hasDisplayName && newDisplayName != null) {
                        it[displayName] = newDisplayName
                    }
                    if (hasStorageProvider && newStorageProvider != null) {
                        it[storageProvider] = newStorageProvider
                    }
                    if (hasDriveFolderId) {
                        it[driveFolderId] = newDriveFolderId
                    }
                    if (hasMigratedLocalAt) {
                        it[migratedLocalAt] = newMigratedLocalAt
                    }
                }
            }

            loadMeInTransaction(userId)
        }
    }

    /**
     * `DELETE /api/v1/me` — 계정 탈퇴 및 하위 데이터 전체 삭제 (`docs/03-api-spec.md` 2.4절, `FR-AUTH-4`).
     * 1) Supabase Storage 오디오 파일(`takes.storage = 'supabase'`) 키를 `storage_trash`에 적재
     * 2) 암호화된 외부 API 키(`integrations`) 삭제
     * 3) `users` 행 삭제 (`ON DELETE CASCADE`로 모든 하위 테이블 영구 삭제)
     * 4) 삭제된 사용자 ID를 기록하여 잔여 JWT로 인한 빈 프로필 재생성을 차단
     */
    suspend fun deleteMe(userId: UUID, confirmText: String) {
        if (confirmText != CONFIRM_DELETE_TEXT) {
            throw InvalidInputException("계정 삭제 확인 문구('$CONFIRM_DELETE_TEXT')가 일치하지 않습니다.")
        }

        val database = requireDb()
        DatabaseFactory.dbQuery(database) {
            val supabaseStorageKeys = TakesTable
                .select(TakesTable.storageKey)
                .where { (TakesTable.userId eq userId) and (TakesTable.storage eq "supabase") }
                .map { it[TakesTable.storageKey] }

            for (key in supabaseStorageKeys) {
                StorageTrashTable.insert {
                    it[storageKey] = key
                }
            }

            IntegrationsTable.deleteWhere { IntegrationsTable.userId eq userId }
            UsersTable.deleteWhere { UsersTable.id eq userId }
        }

        // TODO(Supabase Auth Admin): 운영 환경에서 Supabase Auth 사용자 삭제 연동 전까지 잔여 토큰을 통한 프로필 재생성을 차단
        deletedUserIds.add(userId)
    }

    /**
     * 사용자 데이터 소유권 격리 조회 (`NFR-SEC-2`):
     * 인증된 `userId` 소유의 곡 ID 목록만 반환한다 (타 사용자의 곡은 절대 조회되지 않음).
     */
    suspend fun listOwnedSongIds(userId: UUID): List<UUID> {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            SongsTable
                .select(SongsTable.id)
                .where { SongsTable.userId eq userId }
                .map { it[SongsTable.id] }
        }
    }

    /**
     * 사용자 데이터 단건 접근 가드 (`NFR-SEC-2`):
     * 요청한 `songId`가 현재 인증된 `userId`의 소유가 아니면 `404 NOT_FOUND`를 던져 교차 접근을 차단한다.
     */
    suspend fun requireOwnedSong(userId: UUID, songId: UUID): UUID {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            SongsTable
                .select(SongsTable.id)
                .where { (SongsTable.id eq songId) and (SongsTable.userId eq userId) }
                .singleOrNull()
                ?.get(SongsTable.id)
                ?: throw NotFoundException("곡을 찾을 수 없습니다.")
        }
    }

    /**
     * 사용자 세션 단건 접근 가드 (`NFR-SEC-2`):
     * 요청한 `sessionId`가 현재 인증된 `userId`의 소유가 아니면 `404 NOT_FOUND`를 던져 교차 접근을 차단한다.
     */
    suspend fun requireOwnedSession(userId: UUID, sessionId: UUID): UUID {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            SessionsTable
                .select(SessionsTable.id)
                .where { (SessionsTable.id eq sessionId) and (SessionsTable.userId eq userId) }
                .singleOrNull()
                ?.get(SessionsTable.id)
                ?: throw NotFoundException("연습 기록을 찾을 수 없습니다.")
        }
    }

    private fun Transaction.loadMeInTransaction(userId: UUID): MeResponseDto {
        val row = (UsersTable innerJoin ProfilesTable)
            .selectAll()
            .where { UsersTable.id eq userId }
            .singleOrNull()
            ?: throw NotFoundException("사용자 프로필을 찾을 수 없습니다.")

        val usedBytes = serverTakeBytes(userId)
        val tier = effectiveTier(row)
        val limits = TierLimits.of(tier)

        val integrationRows = IntegrationsTable
            .select(
                IntegrationsTable.provider,
                IntegrationsTable.hint,
                IntegrationsTable.updatedAt
            )
            .where { (IntegrationsTable.userId eq userId) and (IntegrationsTable.appId eq "ulevelp") }
            .associateBy { it[IntegrationsTable.provider] }

        fun findKeySummary(providerName: String): KeySummaryDto? {
            return integrationRows[providerName]?.let {
                KeySummaryDto(
                    hint = it[IntegrationsTable.hint],
                    updatedAt = formatTimestamp(it[IntegrationsTable.updatedAt])
                )
            }
        }

        return MeResponseDto(
            id = row[UsersTable.id].toString(),
            email = row[UsersTable.email],
            displayName = row[ProfilesTable.displayName],
            role = row[ProfilesTable.role],
            storageProvider = row[ProfilesTable.storageProvider],
            driveFolderId = row[ProfilesTable.driveFolderId],
            takeUsedBytes = usedBytes,
            takeQuotaBytes = limits.takeBytes, // 실제 티어 한도(take_quota_bytes 열은 읽지 않음, A2)
            migratedLocalAt = row[ProfilesTable.migratedLocalAt]?.let { formatTimestamp(it) },
            keys = KeysStatusDto(
                notion = findKeySummary("notion")
            ),
            tier = tier,
            billingTier = row[ProfilesTable.billingTier],
            tierOverrideUntil = row[ProfilesTable.tierOverrideUntil]
                ?.takeIf { row[ProfilesTable.tierOverride] != null }
                ?.let { formatTimestamp(it) },
            limits = limits.toDto(),
            usage = TierUsageDto(
                songs = songCount(userId),
                categories = categoryCount(userId),
                takeBytes = usedBytes,
                takeSongs = serverTakeSongIds(userId).size.toLong()
            ),
            credits = CreditsDto(row[ProfilesTable.monthlyCredits], row[ProfilesTable.purchasedCredits]),
            locale = row[ProfilesTable.locale],
            isCreator = row[ProfilesTable.isCreator],
            creatorBadge = row[ProfilesTable.creatorBadge],
            creatorBio = row[ProfilesTable.creatorBio],
            shareAutosync = row[ProfilesTable.shareAutosync],
            sharePracticeLog = row[ProfilesTable.sharePracticeLog],
            publicName = row[ProfilesTable.publicName],
            publicNameNextChangeAt = nextPublicNameChangeAt(
                row[ProfilesTable.publicName], row[ProfilesTable.publicNameChangedAt], OffsetDateTime.now(ZoneOffset.UTC)
            )?.let { formatTimestamp(it) }
        )
    }
}
