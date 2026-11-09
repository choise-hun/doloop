package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import ulevelp.api.ApiException
import ulevelp.api.ConflictException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.*
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

@Serializable
data class AdminUserDto(
    val id: String,
    val email: String,
    val displayName: String,
    val role: String,
    val tier: String,
    val billingTier: String,
    val tierOverride: String?,
    val tierOverrideUntil: String?,
    val credits: CreditsDto,
    val isCreator: Boolean,
    val creatorBadge: String?,
    val creatorBio: String
)

@Serializable
data class AdminUserListResponse(val users: List<AdminUserDto>)

@Serializable
data class AdminCreditResponse(val credits: CreditsDto, val ledgerId: Long)

@Serializable
data class AdminAuditDto(
    val id: Long,
    val actorId: String,
    val action: String,
    val targetUserId: String?,
    val targetId: String?,
    val before: JsonElement?,
    val after: JsonElement?,
    val reason: String,
    val createdAt: String
)

@Serializable
data class AdminAuditListResponse(val rows: List<AdminAuditDto>)

// ---- 커뮤니티 관리 (M1-4a) ----

@Serializable
data class AdminReportDto(
    val id: Long,
    val folderId: String,
    val folderTitle: String,
    val folderHidden: Boolean,
    val ownerId: String?,
    val ownerPublicName: String?,
    val reporterId: String,
    val reason: String,
    val detail: String,
    val status: String,
    val createdAt: String,
    val resolvedAt: String?
)

@Serializable
data class AdminReportListResponse(val rows: List<AdminReportDto>)

/** 관리 화면의 폴더(비공개 초안 포함). 운영자 폴더 필드는 M1-4b — user 폴더는 `titleI18n`·`descriptionI18n` `{}`·`month` null */
@Serializable
data class AdminSharedFolderDto(
    val id: String,
    val kind: String,
    val ownerId: String?,
    val title: String,
    val isPublic: Boolean,
    val autoSync: Boolean,
    val hidden: Boolean,
    val hiddenAt: String?,
    val hiddenReason: String?,
    val titleI18n: JsonObject,
    val descriptionI18n: JsonObject,
    val month: String?,
    val sortOrder: Int,
    val itemCount: Int,
    val likeCount: Int,
    val cloneCount: Int,
    val publishedAt: String?,
    val createdAt: String
)

/** 운영자 폴더 + 항목(목록·항목 교체 응답) */
@Serializable
data class AdminSharedFolderDetailDto(val folder: AdminSharedFolderDto, val items: List<PublicFolderItemDto>)

@Serializable
data class AdminSharedFolderListResponse(val folders: List<AdminSharedFolderDetailDto>)

@Serializable
data class AdminDeletedResponse(val id: String, val deleted: Boolean)

/** `PUT /admin/shared-folders/{id}/items`의 항목 하나(E1 — 제목·아티스트는 받지 않고 YouTube 값을 쓴다) */
data class AdminFolderItemInput(
    val videoId: String,
    val a: java.math.BigDecimal?,
    val b: java.math.BigDecimal?,
    val rate: java.math.BigDecimal,
    val noteI18n: JsonElement?
)

/** `PATCH /admin/shared-folders/{id}` 입력. null = 그대로 */
data class AdminFolderPatch(
    val titleI18n: JsonElement? = null,
    val descriptionI18n: JsonElement? = null,
    val isPublic: Boolean? = null,
    val sortOrder: Int? = null,
    val hidden: Boolean? = null,
    val hiddenReason: String? = null
) {
    val hasOperatorFields: Boolean get() = titleI18n != null || descriptionI18n != null || isPublic != null || sortOrder != null
    val isEmpty: Boolean get() = !hasOperatorFields && hidden == null
}

@Serializable
data class AdminPublicNameResponse(val userId: String, val publicName: String?)

/**
 * owner 관리 API (개발산출물/결과/M1-1_스키마설계.md §5-2). 모든 쓰기는 같은 트랜잭션에서 admin_audit 한 행.
 * role은 DB profiles.role에서만 읽는다(JWT user_metadata 금지) — 확인은 AdminRoutes의 route 한 곳
 */
class AdminService(private val db: Database?) {

    companion object {
        const val MAX_GRANT = 1000                 // 1회 지급·차감 상한(Q6)
        const val MAX_REASON_LENGTH = 200
        const val MAX_BADGE_LENGTH = 20
        const val MAX_BIO_LENGTH = 200
        const val MAX_AUDIT_LIMIT = 200
        val BUCKETS = setOf("purchased", "monthly")
        val REPORT_STATUSES = setOf("open", "resolved", "dismissed")
        val REPORT_RESOLUTIONS = setOf("resolved", "dismissed")

        // 운영자 폴더(M1-4b E9)
        val I18N_KEYS = setOf("ko", "en", "ja")
        const val MAX_FOLDER_TITLE = 100
        const val MAX_FOLDER_DESCRIPTION = 1000
        const val MAX_ITEM_NOTE = 300
        const val MAX_MONTHLY_PICK_ITEMS = 5
        const val MAX_CURATED_ITEMS = 50
        val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
        private val MONTH_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM")

        private fun ts(dt: OffsetDateTime): String = DateTimeFormatter.ISO_INSTANT.format(dt.toInstant())
    }

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    private fun Transaction.requireEpisodeOwner(actorId: UUID) {
        val role = ProfilesTable.select(ProfilesTable.role).where { ProfilesTable.id eq actorId }.singleOrNull()?.get(ProfilesTable.role)
        if (role != "owner") throw ApiException(HttpStatusCode.Forbidden, "FORBIDDEN", "관리자만 쓸 수 있습니다.")
    }

    /** 신규 관리 쓰기: profiles(UUID 순) → 곡 → 세션 → 카드 → 신고. */
    private fun Transaction.lockEpisode(actorId: UUID, postId: UUID): ResultRow {
        val c = SharedPracticeCardsTable
        val initial = c.selectAll().where { c.id eq postId }.singleOrNull() ?: throw NotFoundException()
        ProfilesTable.selectAll().where { ProfilesTable.id inList listOf(actorId, initial[c.userId]).distinct() }
            .orderBy(ProfilesTable.id to SortOrder.ASC).forUpdate(ForUpdateOption.ForUpdate).toList()
        requireEpisodeOwner(actorId)
        val sessionId = initial[c.sessionId]
        val songId = SessionsTable.select(SessionsTable.songId).where { (SessionsTable.id eq sessionId) and (SessionsTable.userId eq initial[c.userId]) }
            .singleOrNull()?.get(SessionsTable.songId) ?: throw NotFoundException()
        SongsTable.selectAll().where { (SongsTable.id eq songId) and (SongsTable.userId eq initial[c.userId]) }
            .forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: throw NotFoundException()
        SessionsTable.selectAll().where { (SessionsTable.id eq sessionId) and (SessionsTable.userId eq initial[c.userId]) }
            .forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: throw NotFoundException()
        return c.selectAll().where { c.id eq postId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: throw NotFoundException()
    }

    suspend fun moderateEpisode(actorId: UUID, postId: UUID, status: String, reason: String): AdminEpisodeModerationDto = DatabaseFactory.dbQuery(requireDb()) {
        val c = SharedPracticeCardsTable
        val old = lockEpisode(actorId, postId)
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val hidden = old[c.status] == "moderation_hidden"
        if (status == "published" && !hidden && old[c.status] == "tier_paused") episodeConflict("POST_REPUBLISH_REQUIRED")
        if (status == "moderation_hidden" || hidden) {
            val paid = TierLimits.isPaid(tierContext(old[c.userId]).tier)
            c.update({ c.id eq postId }) {
                if (status == "moderation_hidden") {
                    it[c.status] = "moderation_hidden"; it[hiddenAt] = now; it[hiddenReason] = reason
                } else {
                    it[c.status] = if (old[c.tierPausedAt] != null || !paid) "tier_paused" else "published"
                    it[hiddenAt] = null; it[hiddenReason] = null
                    if (!paid && old[c.tierPausedAt] == null) it[tierPausedAt] = now
                }
            }
            val after = c.selectAll().where { c.id eq postId }.single()
            fun state(row: ResultRow) = buildJsonObject {
                put("status", row[c.status]); put("hiddenAt", episodeTs(row[c.hiddenAt])); put("tierPausedAt", episodeTs(row[c.tierPausedAt])); put("withdrawnAt", episodeTs(row[c.withdrawnAt]))
            }
            audit(actorId, "episode_moderate", old[c.userId], state(old), state(after), reason, postId.toString())
        }
        val row = c.selectAll().where { c.id eq postId }.single()
        AdminEpisodeModerationDto(postId.toString(), row[c.status], episodeTs(row[c.hiddenAt]), row[c.hiddenReason], episodeTs(row[c.tierPausedAt]), episodeTs(row[c.withdrawnAt]), episodeTs(row[c.updatedAt])!!)
    }

    private fun Transaction.episodeReportDto(row: ResultRow): AdminEpisodeReportDto {
        val r = SharedPracticeCardReportsTable
        val c = SharedPracticeCardsTable
        val card = c.selectAll().where { c.id eq row[r.cardId] }.single()
        val name = ProfilesTable.select(ProfilesTable.publicName).where { ProfilesTable.id eq card[c.userId] }.single()[ProfilesTable.publicName]
        return AdminEpisodeReportDto(row[r.id].toString(), row[r.cardId].toString(), card[c.userId].toString(), name, row[r.reporterId].toString(), row[r.reason], row[r.detail], row[r.status],
            episodeTs(row[r.createdAt])!!, episodeTs(row[r.resolvedAt]), card[c.status], episodeTs(card[c.withdrawnAt]), episodeTs(card[c.hiddenAt]))
    }

    suspend fun listEpisodeReports(actorId: UUID, status: String, limit: Int, rawCursor: String?): AdminEpisodeReportListResponse {
        val cursor = EpisodeCursor.parse(rawCursor, "reports", status)
        return DatabaseFactory.dbQuery(requireDb()) {
            requireEpisodeOwner(actorId)
            val r = SharedPracticeCardReportsTable
            val rows = r.selectAll().where { (r.status eq status) and episodeBefore(r.createdAt, r.id, cursor) }
                .orderBy(r.createdAt to SortOrder.DESC, r.id to SortOrder.DESC).limit(limit + 1).toList()
            AdminEpisodeReportListResponse(rows.take(limit).map { episodeReportDto(it) }, if (rows.size > limit) episodeNext(rows[limit - 1], "reports", status, r.createdAt, r.id) else null)
        }
    }

    suspend fun resolveEpisodeReport(actorId: UUID, reportId: UUID, status: String, reason: String): AdminEpisodeReportDto = DatabaseFactory.dbQuery(requireDb()) {
        val r = SharedPracticeCardReportsTable
        val postId = r.select(r.cardId).where { r.id eq reportId }.singleOrNull()?.get(r.cardId) ?: throw NotFoundException()
        val card = lockEpisode(actorId, postId)
        val old = r.selectAll().where { r.id eq reportId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: throw NotFoundException()
        if (old[r.status] != "open") episodeConflict("REPORT_ALREADY_RESOLVED")
        r.update({ r.id eq reportId }) { it[r.status] = status; it[resolvedAt] = OffsetDateTime.now(ZoneOffset.UTC) }
        val after = r.selectAll().where { r.id eq reportId }.single()
        audit(actorId, "episode_report_resolve", card[SharedPracticeCardsTable.userId],
            buildJsonObject { put("status", "open"); put("postId", postId.toString()) },
            buildJsonObject { put("status", status); put("resolvedAt", episodeTs(after[r.resolvedAt])); put("postId", postId.toString()) }, reason, reportId.toString())
        episodeReportDto(after)
    }

    /** owner가 아니면 403 FORBIDDEN */
    suspend fun requireOwner(userId: UUID) {
        val role = DatabaseFactory.dbQuery(requireDb()) {
            ProfilesTable.select(ProfilesTable.role).where { ProfilesTable.id eq userId }.singleOrNull()?.get(ProfilesTable.role)
        }
        if (role != "owner") {
            throw ApiException(HttpStatusCode.Forbidden, "FORBIDDEN", "관리자만 쓸 수 있습니다.")
        }
    }

    private fun Transaction.loadUserRow(userId: UUID, lock: Boolean = false): ResultRow {
        val query = (UsersTable innerJoin ProfilesTable).selectAll().where { UsersTable.id eq userId }
        // Tier/share writes lock profiles first. Locking users here as well could invert
        // the FK key-share lock acquired by a concurrent first card INSERT.
        if (lock) query.forUpdate(ForUpdateOption.PostgreSQL.ForUpdate(null, ProfilesTable))
        return query.singleOrNull() ?: throw NotFoundException("사용자를 찾을 수 없습니다.")
    }

    private fun toDto(row: ResultRow) = AdminUserDto(
        id = row[UsersTable.id].toString(),
        email = row[UsersTable.email],
        displayName = row[ProfilesTable.displayName],
        role = row[ProfilesTable.role],
        tier = effectiveTier(row),
        billingTier = row[ProfilesTable.billingTier],
        tierOverride = row[ProfilesTable.tierOverride],
        tierOverrideUntil = row[ProfilesTable.tierOverrideUntil]?.let { ts(it) },
        credits = CreditsDto(row[ProfilesTable.monthlyCredits], row[ProfilesTable.purchasedCredits]),
        isCreator = row[ProfilesTable.isCreator],
        creatorBadge = row[ProfilesTable.creatorBadge],
        creatorBio = row[ProfilesTable.creatorBio]
    )

    private fun tierJson(row: ResultRow) = buildJsonObject {
        put("tier", effectiveTier(row))
        put("tierOverride", row[ProfilesTable.tierOverride])
        put("tierOverrideUntil", row[ProfilesTable.tierOverrideUntil]?.let { ts(it) })
    }

    private fun creatorJson(row: ResultRow) = buildJsonObject {
        put("isCreator", row[ProfilesTable.isCreator])
        put("creatorBadge", row[ProfilesTable.creatorBadge])
        put("creatorBio", row[ProfilesTable.creatorBio])
    }

    private fun Transaction.audit(
        actorId: UUID,
        action: String,
        targetUserId: UUID?,
        before: JsonObject?,
        after: JsonObject?,
        reason: String,
        targetId: String? = null
    ): Long = AdminAuditTable.insert {
        it[AdminAuditTable.actorId] = actorId
        it[AdminAuditTable.action] = action
        it[AdminAuditTable.targetUserId] = targetUserId
        it[AdminAuditTable.targetId] = targetId
        it[AdminAuditTable.before] = before
        it[AdminAuditTable.after] = after
        it[AdminAuditTable.reason] = reason
    } get AdminAuditTable.id

    fun validateReason(raw: String?): String {
        val reason = raw?.trim().orEmpty()
        if (reason.isEmpty() || reason.length > MAX_REASON_LENGTH) {
            throw InvalidInputException("reason은 1~${MAX_REASON_LENGTH}자여야 합니다.")
        }
        return reason
    }

    /** `GET /admin/users?email=` — 대소문자 무시 완전 일치 */
    suspend fun findUsersByEmail(email: String): AdminUserListResponse = DatabaseFactory.dbQuery(requireDb()) {
        val rows = (UsersTable innerJoin ProfilesTable).selectAll()
            .where { UsersTable.email.lowerCase() eq email.trim().lowercase() }
            .toList()
        AdminUserListResponse(rows.map { toDto(it) })
    }

    /**
     * `PUT /admin/users/{userId}/tier-override` — tier null = override 해제(until도 null이어야 함).
     * 실제 티어가 유료 → free가 되면 같은 트랜잭션에서 다운그레이드 정리(§1-3), 크레딧 주기 전환 판정(M1-3d)
     */
    suspend fun setTierOverride(
        actorId: UUID,
        userId: UUID,
        tier: String?,
        until: OffsetDateTime?,
        reason: String,
        now: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)
    ): AdminUserDto {
        if (tier != null && tier !in TierLimits.TIERS) {
            throw InvalidInputException("tier는 free·pro·pro_plus 또는 null이어야 합니다.")
        }
        if (tier == null && until != null) {
            throw InvalidInputException("tier가 null이면 until도 null이어야 합니다.")
        }
        if (until != null && !until.isAfter(now)) {
            throw InvalidInputException("until은 지금보다 뒤여야 합니다.")
        }
        return DatabaseFactory.dbQuery(requireDb()) {
            val beforeRow = loadUserRow(userId, lock = true)
            val beforeTier = effectiveTier(beforeRow, now)
            pauseExpiredEpisodeCards(userId, beforeRow, now)
            // 충전 시각이 지났는데 cron(매시)이 아직이면 바꾸기 전 티어로 먼저 처리한다(M1-3d)
            processDueCycle(userId, beforeTier, now.toInstant())
            ProfilesTable.update({ ProfilesTable.id eq userId }) {
                it[tierOverride] = tier
                it[tierOverrideUntil] = until
            }
            val afterRow = loadUserRow(userId)
            val afterTier = effectiveTier(afterRow, now)
            if (TierLimits.isPaid(beforeTier) && !TierLimits.isPaid(afterTier)) {
                downgradeCleanup(userId)
            }
            // 무료 → 유료 즉시 지급 + 30일 주기, Pro → Pro+ 차액. 유료 → 무료는 주기 끝까지 유예(M1-3e: afterTier가 유료로 남아 정리도 주기 끝)
            onTierChange(userId, beforeTier, afterTier, now.toInstant())
            audit(actorId, "tier_override", userId, tierJson(beforeRow), tierJson(afterRow), reason)
            toDto(loadUserRow(userId))
        }
    }

    /**
     * `POST /admin/users/{userId}/credits` — |delta| ≤ 1000, 결과 잔액 ≥ 0. admin_audit을 먼저 쓰고 그 id를 원장에(§3)
     */
    suspend fun adjustCredits(actorId: UUID, userId: UUID, delta: Int, bucket: String, reason: String): AdminCreditResponse {
        if (delta == 0) throw InvalidInputException("delta는 0이 아니어야 합니다.")
        if (kotlin.math.abs(delta) > MAX_GRANT) {
            throw ApiException(
                HttpStatusCode.BadRequest,
                "ADMIN_GRANT_LIMIT_EXCEEDED",
                "1회 지급·차감은 ${MAX_GRANT} 크레딧까지입니다.",
                detail = buildJsonObject { put("max", MAX_GRANT) }
            )
        }
        if (bucket !in BUCKETS) throw InvalidInputException("bucket은 purchased 또는 monthly여야 합니다.")

        return DatabaseFactory.dbQuery(requireDb()) {
            val row = loadUserRow(userId, lock = true)
            val column = if (bucket == "monthly") ProfilesTable.monthlyCredits else ProfilesTable.purchasedCredits
            val balance = row[column]
            val after = balance + delta
            if (after < 0) {
                throw ApiException(
                    HttpStatusCode.Conflict,
                    "CREDIT_BALANCE_NEGATIVE",
                    "잔액(${balance})보다 많이 차감할 수 없습니다.",
                    detail = buildJsonObject { put("balance", balance) }
                )
            }
            val auditId = audit(
                actorId, "credit_adjust", userId,
                buildJsonObject { put("bucket", bucket); put("balance", balance) },
                buildJsonObject { put("bucket", bucket); put("balance", after); put("delta", delta) },
                reason
            )
            ProfilesTable.update({ ProfilesTable.id eq userId }) { it[column] = after }
            val ledgerId = CreditLedgerTable.insert {
                it[CreditLedgerTable.userId] = userId
                it[CreditLedgerTable.bucket] = bucket
                it[CreditLedgerTable.delta] = delta
                it[balanceAfter] = after
                it[CreditLedgerTable.reason] = "admin_adjust"
                it[CreditLedgerTable.auditId] = auditId
                it[memo] = reason
            } get CreditLedgerTable.id
            val updated = loadUserRow(userId)
            AdminCreditResponse(
                CreditsDto(updated[ProfilesTable.monthlyCredits], updated[ProfilesTable.purchasedCredits]),
                ledgerId
            )
        }
    }

    /** `PUT /admin/users/{userId}/creator` — 입력에 없는 badge·bio는 그대로 */
    suspend fun setCreator(
        actorId: UUID,
        userId: UUID,
        isCreator: Boolean,
        badge: JsonElement?,
        bio: String?,
        reason: String
    ): AdminUserDto {
        // badge: 키 없음 = 그대로, null = 지움, 문자열 = 1~20자
        val badgeValue: String? = when (badge) {
            null, is JsonNull -> null
            else -> {
                val text = (badge as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content?.trim()
                    ?: throw InvalidInputException("creatorBadge는 문자열 또는 null이어야 합니다.")
                if (text.isEmpty() || text.length > MAX_BADGE_LENGTH) {
                    throw InvalidInputException("creatorBadge는 1~${MAX_BADGE_LENGTH}자여야 합니다.")
                }
                text
            }
        }
        if (bio != null && bio.length > MAX_BIO_LENGTH) {
            throw InvalidInputException("creatorBio는 ${MAX_BIO_LENGTH}자 이하여야 합니다.")
        }
        return DatabaseFactory.dbQuery(requireDb()) {
            val beforeRow = loadUserRow(userId, lock = true)
            ProfilesTable.update({ ProfilesTable.id eq userId }) {
                it[ProfilesTable.isCreator] = isCreator
                if (badge != null) it[creatorBadge] = badgeValue
                if (bio != null) it[creatorBio] = bio
            }
            val afterRow = loadUserRow(userId)
            audit(actorId, "creator_update", userId, creatorJson(beforeRow), creatorJson(afterRow), reason)
            toDto(afterRow)
        }
    }

    // ================= 커뮤니티 (M1-4a, §5-2 M1-4 줄) =================

    private fun reportJson(row: ResultRow) = buildJsonObject {
        put("status", row[FolderReportsTable.status])
        put("resolvedAt", row[FolderReportsTable.resolvedAt]?.let { ts(it) })
    }

    private fun reportQuery() = FolderReportsTable
        .join(SharedFoldersTable, JoinType.INNER, FolderReportsTable.folderId, SharedFoldersTable.id)
        .join(ProfilesTable, JoinType.LEFT, SharedFoldersTable.ownerId, ProfilesTable.id)
        .select(
            FolderReportsTable.id, FolderReportsTable.folderId, FolderReportsTable.reporterId, FolderReportsTable.reason,
            FolderReportsTable.detail, FolderReportsTable.status, FolderReportsTable.createdAt, FolderReportsTable.resolvedAt,
            SharedFoldersTable.title, SharedFoldersTable.hiddenAt, SharedFoldersTable.ownerId, ProfilesTable.publicName
        )

    private fun toReportDto(row: ResultRow) = AdminReportDto(
        id = row[FolderReportsTable.id],
        folderId = row[FolderReportsTable.folderId].toString(),
        folderTitle = row[SharedFoldersTable.title],
        folderHidden = row[SharedFoldersTable.hiddenAt] != null,
        ownerId = row[SharedFoldersTable.ownerId]?.toString(),
        ownerPublicName = row.getOrNull(ProfilesTable.publicName),
        reporterId = row[FolderReportsTable.reporterId].toString(),
        reason = row[FolderReportsTable.reason],
        detail = row[FolderReportsTable.detail],
        status = row[FolderReportsTable.status],
        createdAt = ts(row[FolderReportsTable.createdAt]),
        resolvedAt = row[FolderReportsTable.resolvedAt]?.let { ts(it) }
    )

    /** `GET /admin/reports?status=&limit=` — 최근 순(기본 open) */
    suspend fun listReports(status: String, limit: Int): AdminReportListResponse = DatabaseFactory.dbQuery(requireDb()) {
        val rows = reportQuery()
            .where { FolderReportsTable.status eq status }
            .orderBy(FolderReportsTable.id to SortOrder.DESC)
            .limit(limit)
            .map { toReportDto(it) }
        AdminReportListResponse(rows)
    }

    /** `PATCH /admin/reports/{id}` `{status: resolved|dismissed, reason}` — 열린 신고만(아니면 409) */
    suspend fun resolveReport(actorId: UUID, reportId: Long, status: String, reason: String): AdminReportDto {
        if (status !in REPORT_RESOLUTIONS) throw InvalidInputException("status는 resolved 또는 dismissed여야 합니다.")
        return DatabaseFactory.dbQuery(requireDb()) {
            val before = FolderReportsTable.selectAll().where { FolderReportsTable.id eq reportId }
                .forUpdate(ForUpdateOption.ForUpdate)
                .singleOrNull() ?: throw NotFoundException("신고를 찾을 수 없습니다.")
            if (before[FolderReportsTable.status] != "open") throw ConflictException("이미 처리한 신고입니다.")
            FolderReportsTable.update({ FolderReportsTable.id eq reportId }) {
                it[FolderReportsTable.status] = status
                it[resolvedAt] = OffsetDateTime.now(ZoneOffset.UTC)
            }
            val after = FolderReportsTable.selectAll().where { FolderReportsTable.id eq reportId }.single()
            val ownerId = SharedFoldersTable.select(SharedFoldersTable.ownerId)
                .where { SharedFoldersTable.id eq before[FolderReportsTable.folderId] }
                .singleOrNull()?.get(SharedFoldersTable.ownerId)
            audit(actorId, "report_resolve", ownerId, reportJson(before), reportJson(after), reason, targetId = reportId.toString())
            toReportDto(reportQuery().where { FolderReportsTable.id eq reportId }.single())
        }
    }

    // ---- 공유 폴더 (user 폴더는 숨김만, 운영자 폴더는 만들기·고치기·항목·삭제 — M1-4b) ----

    private fun Transaction.lockFolder(folderId: UUID): ResultRow =
        SharedFoldersTable.selectAll().where { SharedFoldersTable.id eq folderId }
            .forUpdate(ForUpdateOption.ForUpdate)
            .singleOrNull() ?: throw NotFoundException("폴더를 찾을 수 없습니다.")

    private fun Transaction.folderDto(row: ResultRow): AdminSharedFolderDto {
        val id = row[SharedFoldersTable.id]
        val isUser = row[SharedFoldersTable.kind] == SharedFolderSync.KIND_USER
        return AdminSharedFolderDto(
            id = id.toString(),
            kind = row[SharedFoldersTable.kind],
            ownerId = row[SharedFoldersTable.ownerId]?.toString(),
            title = row[SharedFoldersTable.title],
            isPublic = row[SharedFoldersTable.isPublic],
            autoSync = row[SharedFoldersTable.autoSync],
            hidden = row[SharedFoldersTable.hiddenAt] != null,
            hiddenAt = row[SharedFoldersTable.hiddenAt]?.let { ts(it) },
            hiddenReason = row[SharedFoldersTable.hiddenReason],
            titleI18n = if (isUser) CommunityService.EMPTY_OBJECT else row[SharedFoldersTable.titleI18n].asObject(),
            descriptionI18n = if (isUser) CommunityService.EMPTY_OBJECT else row[SharedFoldersTable.descriptionI18n].asObject(),
            month = row[SharedFoldersTable.month]?.let { MONTH_FORMAT.format(it) },
            sortOrder = row[SharedFoldersTable.sortOrder],
            itemCount = SharedFolderItemsTable.selectAll().where { SharedFolderItemsTable.folderId eq id }.count().toInt(),
            likeCount = row[SharedFoldersTable.likeCount],
            cloneCount = row[SharedFoldersTable.cloneCount],
            publishedAt = row[SharedFoldersTable.publishedAt]?.let { ts(it) },
            createdAt = ts(row[SharedFoldersTable.createdAt])
        )
    }

    /** 감사 before·after용 요약 — 운영자 폴더는 글자·공개·순서, user 폴더는 숨김 */
    private fun folderAuditJson(row: ResultRow) = buildJsonObject {
        put("kind", row[SharedFoldersTable.kind])
        put("title", row[SharedFoldersTable.title])
        put("isPublic", row[SharedFoldersTable.isPublic])
        put("hiddenAt", row[SharedFoldersTable.hiddenAt]?.let { ts(it) })
        put("hiddenReason", row[SharedFoldersTable.hiddenReason])
        if (row[SharedFoldersTable.kind] != SharedFolderSync.KIND_USER) {
            put("titleI18n", row[SharedFoldersTable.titleI18n])
            put("descriptionI18n", row[SharedFoldersTable.descriptionI18n])
            put("month", row[SharedFoldersTable.month]?.let { MONTH_FORMAT.format(it) })
            put("sortOrder", row[SharedFoldersTable.sortOrder])
        }
    }

    private fun Transaction.itemsAuditJson(folderId: UUID) = buildJsonObject {
        put("items", JsonArray(
            SharedFolderItemsTable.select(SharedFolderItemsTable.videoId)
                .where { SharedFolderItemsTable.folderId eq folderId }
                .orderBy(SharedFolderItemsTable.position to SortOrder.ASC)
                .map { JsonPrimitive(it[SharedFolderItemsTable.videoId]) }
        ))
    }

    /**
     * 번역 글자 묶음 `{ko?, en?, ja?}` 검사(E9). 다른 키·문자열 아닌 값 400, 빈 값은 빠진다.
     * [requireKo]면 `ko` 필수(= `title` 열)
     */
    fun validateI18n(field: String, raw: JsonElement?, maxLength: Int, requireKo: Boolean): JsonObject {
        if (raw == null || raw is JsonNull) {
            if (requireKo) throw InvalidInputException("$field.ko 값이 필요합니다.")
            return CommunityService.EMPTY_OBJECT
        }
        val obj = raw as? JsonObject ?: throw InvalidInputException("$field 은(는) {ko, en, ja} 객체여야 합니다.")
        val out = linkedMapOf<String, JsonElement>()
        for ((key, value) in obj) {
            if (key !in I18N_KEYS) throw InvalidInputException("$field 의 키는 ko·en·ja만 쓸 수 있습니다.")
            val text = (value as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()
                ?: throw InvalidInputException("$field.$key 은(는) 문자열이어야 합니다.")
            if (text.length > maxLength) throw InvalidInputException("$field.$key 은(는) ${maxLength}자 이하여야 합니다.")
            if (text.isNotEmpty()) out[key] = JsonPrimitive(text)
        }
        if (requireKo && out["ko"] == null) throw InvalidInputException("$field.ko 값이 필요합니다(1~${maxLength}자).")
        return JsonObject(out)
    }

    /** `YYYY-MM` → 그 달 1일. 틀리면 400 */
    fun parseMonth(raw: String): LocalDate = try {
        java.time.YearMonth.parse(raw.trim(), MONTH_FORMAT).atDay(1)
    } catch (_: java.time.format.DateTimeParseException) {
        throw InvalidInputException("month는 YYYY-MM 형식이어야 합니다.")
    }

    /** `GET /admin/shared-folders?kind=` — 운영자 폴더(초안·숨김 포함) + 항목. kind 없으면 둘 다 */
    suspend fun listOperatorFolders(kind: String?): AdminSharedFolderListResponse {
        val kinds = if (kind == null) SharedFolderSync.OPERATOR_KINDS else setOf(kind)
        if (!SharedFolderSync.OPERATOR_KINDS.containsAll(kinds)) {
            throw InvalidInputException("kind는 curated 또는 monthly_pick이어야 합니다.")
        }
        return DatabaseFactory.dbQuery(requireDb()) {
            val rows = SharedFoldersTable.selectAll()
                .where { SharedFoldersTable.kind inList kinds }
                .orderBy(
                    SharedFoldersTable.kind to SortOrder.ASC,
                    SharedFoldersTable.month to SortOrder.DESC_NULLS_LAST,
                    SharedFoldersTable.sortOrder to SortOrder.ASC,
                    SharedFoldersTable.createdAt to SortOrder.ASC
                )
                .toList()
            AdminSharedFolderListResponse(rows.map { AdminSharedFolderDetailDto(folderDto(it), publicFolderItems(it[SharedFoldersTable.id])) })
        }
    }

    /** `POST /admin/shared-folders` — 운영자 폴더 만들기. 늘 비공개 초안으로 시작(E9). 같은 달 monthly_pick 409 */
    suspend fun createOperatorFolder(
        actorId: UUID,
        kind: String,
        titleI18nRaw: JsonElement?,
        descriptionI18nRaw: JsonElement?,
        monthRaw: String?,
        sortOrder: Int?,
        reason: String
    ): AdminSharedFolderDto {
        if (kind !in SharedFolderSync.OPERATOR_KINDS) throw InvalidInputException("kind는 curated 또는 monthly_pick이어야 합니다.")
        val titleI18n = validateI18n("titleI18n", titleI18nRaw, MAX_FOLDER_TITLE, requireKo = true)
        val descriptionI18n = validateI18n("descriptionI18n", descriptionI18nRaw, MAX_FOLDER_DESCRIPTION, requireKo = false)
        val month = when {
            kind == SharedFolderSync.KIND_MONTHLY_PICK -> parseMonth(monthRaw ?: throw InvalidInputException("monthly_pick은 month(YYYY-MM)가 필요합니다."))
            monthRaw != null -> throw InvalidInputException("month는 monthly_pick만 쓸 수 있습니다.")
            else -> null
        }
        return DatabaseFactory.dbQuery(requireDb()) {
            if (month != null) {
                val taken = SharedFoldersTable.selectAll()
                    .where { (SharedFoldersTable.kind eq SharedFolderSync.KIND_MONTHLY_PICK) and (SharedFoldersTable.month eq month) }
                    .count() > 0L
                if (taken) throw ConflictException("이 달의 곡 폴더가 이미 있습니다.")
            }
            val id = try {
                SharedFoldersTable.insert {
                    it[SharedFoldersTable.kind] = kind
                    it[title] = (titleI18n["ko"] as JsonPrimitive).content
                    it[SharedFoldersTable.titleI18n] = titleI18n
                    it[SharedFoldersTable.descriptionI18n] = descriptionI18n
                    it[SharedFoldersTable.month] = month
                    it[SharedFoldersTable.sortOrder] = sortOrder ?: 0
                    it[isPublic] = false
                } get SharedFoldersTable.id
            } catch (e: org.jetbrains.exposed.exceptions.ExposedSQLException) {
                if (e.sqlState == "23505") throw ConflictException("이 달의 곡 폴더가 이미 있습니다.")
                throw e
            }
            val row = SharedFoldersTable.selectAll().where { SharedFoldersTable.id eq id }.single()
            audit(actorId, "folder_create", null, null, folderAuditJson(row), reason, targetId = id.toString())
            folderDto(row)
        }
    }

    /**
     * `PATCH /admin/shared-folders/{id}` — 필드 하나 이상(없으면 400).
     * user 폴더: `hidden`·`hiddenReason`만(다른 필드 400). 운영자 폴더: `titleI18n`·`descriptionI18n`·`isPublic`·`sortOrder`·`hidden`.
     * 비공개 → 공개면 `published_at` = 지금. 감사 action: 숨김만 바꾸면 `folder_hide`·`folder_unhide`, 아니면 `folder_update`
     */
    suspend fun updateFolder(actorId: UUID, folderId: UUID, patch: AdminFolderPatch, reason: String): AdminSharedFolderDto {
        if (patch.isEmpty) {
            throw InvalidInputException("바꿀 값(titleI18n·descriptionI18n·isPublic·sortOrder·hidden)이 하나 이상 필요합니다.")
        }
        if (patch.hiddenReason != null && patch.hiddenReason.length > MAX_REASON_LENGTH) {
            throw InvalidInputException("hiddenReason은 ${MAX_REASON_LENGTH}자 이하여야 합니다.")
        }
        val titleI18n = patch.titleI18n?.let { validateI18n("titleI18n", it, MAX_FOLDER_TITLE, requireKo = true) }
        val descriptionI18n = patch.descriptionI18n?.let { validateI18n("descriptionI18n", it, MAX_FOLDER_DESCRIPTION, requireKo = false) }
        return DatabaseFactory.dbQuery(requireDb()) {
            val before = lockFolder(folderId)
            val isUser = before[SharedFoldersTable.kind] == SharedFolderSync.KIND_USER
            if (isUser && patch.hasOperatorFields) {
                throw InvalidInputException("사용자 폴더는 숨김(hidden)만 바꿀 수 있습니다.")
            }
            val now = OffsetDateTime.now(ZoneOffset.UTC)
            SharedFoldersTable.update({ SharedFoldersTable.id eq folderId }) {
                if (titleI18n != null) {
                    it[title] = (titleI18n["ko"] as JsonPrimitive).content
                    it[SharedFoldersTable.titleI18n] = titleI18n
                }
                if (descriptionI18n != null) it[SharedFoldersTable.descriptionI18n] = descriptionI18n
                if (patch.sortOrder != null) it[SharedFoldersTable.sortOrder] = patch.sortOrder
                if (patch.isPublic != null) {
                    it[isPublic] = patch.isPublic
                    if (patch.isPublic && !before[SharedFoldersTable.isPublic]) it[publishedAt] = now
                }
                when (patch.hidden) {
                    true -> {
                        it[hiddenAt] = before[SharedFoldersTable.hiddenAt] ?: now
                        it[SharedFoldersTable.hiddenReason] = patch.hiddenReason
                    }
                    false -> {
                        it[hiddenAt] = null
                        it[SharedFoldersTable.hiddenReason] = null
                    }
                    null -> Unit
                }
            }
            val after = SharedFoldersTable.selectAll().where { SharedFoldersTable.id eq folderId }.single()
            val action = when {
                patch.hasOperatorFields -> "folder_update"
                patch.hidden == true -> "folder_hide"
                else -> "folder_unhide"
            }
            audit(
                actorId, action, before[SharedFoldersTable.ownerId],
                folderAuditJson(before), folderAuditJson(after), reason, targetId = folderId.toString()
            )
            folderDto(after)
        }
    }

    /**
     * `PUT /admin/shared-folders/{id}/items` `{items, reason}` — 운영자 폴더 항목 통째 교체(E1). 순서 = 입력 순서.
     * monthly_pick ≤ 5·curated ≤ 50(넘으면 400 `INVALID_INPUT{max}`), videoId 형식·중복 400, a < b.
     * 공개 중이면 `published_at` = 지금. YouTube 제목은 부르는 쪽이 트랜잭션 뒤에 채운다
     */
    suspend fun replaceFolderItems(actorId: UUID, folderId: UUID, items: List<AdminFolderItemInput>, reason: String): AdminSharedFolderDto {
        val seen = HashSet<String>()
        val notes = items.map { item ->
            if (!VIDEO_ID.matches(item.videoId)) throw InvalidInputException("videoId 형식이 올바르지 않습니다: ${item.videoId.take(20)}")
            if (!seen.add(item.videoId)) throw InvalidInputException("같은 videoId가 두 번 있습니다: ${item.videoId}")
            if (item.a != null && item.b != null && item.a >= item.b) throw InvalidInputException("a는 b보다 작아야 합니다(${item.videoId}).")
            validateI18n("noteI18n", item.noteI18n, MAX_ITEM_NOTE, requireKo = false)
        }
        return DatabaseFactory.dbQuery(requireDb()) {
            val before = lockFolder(folderId)
            val max = when (before[SharedFoldersTable.kind]) {
                SharedFolderSync.KIND_MONTHLY_PICK -> MAX_MONTHLY_PICK_ITEMS
                SharedFolderSync.KIND_CURATED -> MAX_CURATED_ITEMS
                else -> throw InvalidInputException("사용자 폴더의 곡은 바꿀 수 없습니다(운영자 폴더만).")
            }
            if (items.size > max) {
                throw ApiException(
                    HttpStatusCode.BadRequest, "INVALID_INPUT", "이 폴더에는 곡을 ${max}개까지 넣을 수 있습니다.",
                    detail = buildJsonObject { put("max", max) }
                )
            }
            val beforeItems = itemsAuditJson(folderId)
            SharedFolderItemsTable.deleteWhere { SharedFolderItemsTable.folderId eq folderId }
            SharedFolderItemsTable.batchInsert(items.withIndex().toList()) { (index, item) ->
                this[SharedFolderItemsTable.folderId] = folderId
                this[SharedFolderItemsTable.videoId] = item.videoId
                this[SharedFolderItemsTable.position] = index
                this[SharedFolderItemsTable.a] = item.a
                this[SharedFolderItemsTable.b] = item.b
                this[SharedFolderItemsTable.rate] = item.rate
                this[SharedFolderItemsTable.noteI18n] = notes[index]
            }
            if (before[SharedFoldersTable.isPublic]) {
                SharedFoldersTable.update({ SharedFoldersTable.id eq folderId }) { it[publishedAt] = OffsetDateTime.now(ZoneOffset.UTC) }
            }
            audit(actorId, "folder_items_replace", null, beforeItems, itemsAuditJson(folderId), reason, targetId = folderId.toString())
            folderDto(SharedFoldersTable.selectAll().where { SharedFoldersTable.id eq folderId }.single())
        }
    }

    /** 폴더 + 항목(항목 교체 응답 — YouTube 제목을 채운 뒤 읽는다) */
    suspend fun folderDetail(folderId: UUID): AdminSharedFolderDetailDto = DatabaseFactory.dbQuery(requireDb()) {
        val row = SharedFoldersTable.selectAll().where { SharedFoldersTable.id eq folderId }.singleOrNull()
            ?: throw NotFoundException("폴더를 찾을 수 없습니다.")
        AdminSharedFolderDetailDto(folderDto(row), publicFolderItems(folderId))
    }

    /** `DELETE /admin/shared-folders/{id}` `{reason}` — 운영자 폴더만(user 폴더 400 — 숨김을 쓴다). 항목·좋아요는 CASCADE */
    suspend fun deleteOperatorFolder(actorId: UUID, folderId: UUID, reason: String): AdminDeletedResponse =
        DatabaseFactory.dbQuery(requireDb()) {
            val before = lockFolder(folderId)
            if (before[SharedFoldersTable.kind] == SharedFolderSync.KIND_USER) {
                throw InvalidInputException("사용자 폴더는 지울 수 없습니다. 숨김(hidden)을 쓰세요.")
            }
            val beforeJson = buildJsonObject {
                folderAuditJson(before).forEach { (k, v) -> put(k, v) }
                itemsAuditJson(folderId).forEach { (k, v) -> put(k, v) }
            }
            SharedFoldersTable.deleteWhere { SharedFoldersTable.id eq folderId }
            audit(actorId, "folder_delete", null, beforeJson, null, reason, targetId = folderId.toString())
            AdminDeletedResponse(folderId.toString(), deleted = true)
        }

    /** `DELETE /admin/users/{userId}/public-name` `{reason}` — 커뮤니티 이름 NULL(N2). 사용자는 바로 새 이름을 정할 수 있다 */
    suspend fun resetPublicName(actorId: UUID, userId: UUID, reason: String): AdminPublicNameResponse =
        DatabaseFactory.dbQuery(requireDb()) {
            val before = loadUserRow(userId, lock = true)
            ProfilesTable.update({ ProfilesTable.id eq userId }) {
                it[publicName] = null
                it[publicNameKey] = null
                it[publicNameChangedAt] = null // 7일 제한도 풀어 바로 새 이름을 정할 수 있게
            }
            audit(
                actorId, "public_name_reset", userId,
                buildJsonObject { put("publicName", before[ProfilesTable.publicName]) },
                buildJsonObject { put("publicName", null as String?) },
                reason
            )
            AdminPublicNameResponse(userId.toString(), null)
        }

    /** `GET /admin/audit?targetUserId=&limit=` — 최근 순 */
    suspend fun listAudit(targetUserId: UUID?, limit: Int): AdminAuditListResponse = DatabaseFactory.dbQuery(requireDb()) {
        val query = AdminAuditTable.selectAll()
        if (targetUserId != null) query.andWhere { AdminAuditTable.targetUserId eq targetUserId }
        val rows = query.orderBy(AdminAuditTable.id to SortOrder.DESC).limit(limit).map {
            AdminAuditDto(
                id = it[AdminAuditTable.id],
                actorId = it[AdminAuditTable.actorId].toString(),
                action = it[AdminAuditTable.action],
                targetUserId = it[AdminAuditTable.targetUserId]?.toString(),
                targetId = it[AdminAuditTable.targetId],
                before = it[AdminAuditTable.before],
                after = it[AdminAuditTable.after],
                reason = it[AdminAuditTable.reason],
                createdAt = ts(it[AdminAuditTable.createdAt])
            )
        }
        AdminAuditListResponse(rows)
    }
}
