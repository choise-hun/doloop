package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import ulevelp.api.ApiException
import ulevelp.api.ConflictException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.*
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

        private fun ts(dt: OffsetDateTime): String = DateTimeFormatter.ISO_INSTANT.format(dt.toInstant())
    }

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

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
        if (lock) query.forUpdate(ForUpdateOption.ForUpdate)
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
     * 실제 티어가 유료 → free가 되면 같은 트랜잭션에서 다운그레이드 정리(§1-3)
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
            ProfilesTable.update({ ProfilesTable.id eq userId }) {
                it[tierOverride] = tier
                it[tierOverrideUntil] = until
            }
            val afterRow = loadUserRow(userId)
            val afterTier = effectiveTier(afterRow, now)
            if (TierLimits.isPaid(beforeTier) && !TierLimits.isPaid(afterTier)) {
                downgradeCleanup(userId)
            }
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
