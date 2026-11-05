package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.lessEq
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import org.slf4j.LoggerFactory
import ulevelp.api.ApiException
import ulevelp.api.NotFoundException
import ulevelp.db.*
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/**
 * 티어별 한도 (개발산출물/결과/M1-1_스키마설계.md §1-2). null = 제한 없음. DB에 넣지 않는 코드 상수
 */
data class TierLimits(
    val songs: Int?,
    val categories: Int?,
    val takeBytes: Long,
    val takeSongs: Int?,
    val takeDurationSec: Int?,
    val drive: Boolean,
    val ai: Boolean,
    val communityWrite: Boolean
) {
    companion object {
        const val FREE = "free"
        const val PRO = "pro"
        const val PRO_PLUS = "pro_plus"
        val TIERS = listOf(FREE, PRO, PRO_PLUS)

        private val BY_TIER = mapOf(
            FREE to TierLimits(10, 2, 5_242_880L, 2, 120, drive = false, ai = false, communityWrite = false),
            PRO to TierLimits(100, 7, 104_857_600L, null, null, drive = true, ai = true, communityWrite = true),
            PRO_PLUS to TierLimits(150, 10, 209_715_200L, null, null, drive = true, ai = true, communityWrite = true)
        )

        fun of(tier: String): TierLimits = BY_TIER[tier] ?: BY_TIER.getValue(FREE)

        /** 바로 위 티어. 맨 위면 null (A4 업그레이드 안내) */
        fun nextTier(tier: String): String? = when (tier) {
            FREE -> PRO
            PRO -> PRO_PLUS
            else -> null
        }

        fun isPaid(tier: String): Boolean = tier != FREE
    }
}

@Serializable
data class TierLimitsDto(
    val songs: Int?,
    val categories: Int?,
    val takeBytes: Long,
    val takeSongs: Int?,
    val takeDurationSec: Int?,
    val drive: Boolean,
    val ai: Boolean,
    val communityWrite: Boolean
)

@Serializable
data class TierUsageDto(
    val songs: Long,
    val categories: Long,
    val takeBytes: Long,
    val takeSongs: Long
)

@Serializable
data class CreditsDto(val monthly: Int, val purchased: Int)

fun TierLimits.toDto() = TierLimitsDto(songs, categories, takeBytes, takeSongs, takeDurationSec, drive, ai, communityWrite)

/**
 * 실제 티어 = 기한 안의 tier_override, 아니면 billing_tier (§1-1). 서버 코드는 이 함수로만 계산한다
 */
fun effectiveTier(billingTier: String, override: String?, overrideUntil: OffsetDateTime?, now: OffsetDateTime): String =
    if (override != null && (overrideUntil == null || overrideUntil.isAfter(now))) override else billingTier

fun effectiveTier(row: ResultRow, now: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)): String =
    effectiveTier(row[ProfilesTable.billingTier], row[ProfilesTable.tierOverride], row[ProfilesTable.tierOverrideUntil], now)

/** 한도 검사에 쓰는 사용자 티어 문맥. lock=true면 profiles 행을 FOR UPDATE로 잠가 동시 추가를 줄 세운다 */
data class TierContext(val userId: UUID, val tier: String) {
    val limits: TierLimits get() = TierLimits.of(tier)
}

fun Transaction.tierContext(userId: UUID, lock: Boolean = false): TierContext {
    val query = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }
    if (lock) query.forUpdate(ForUpdateOption.ForUpdate)
    val row = query.singleOrNull() ?: throw NotFoundException("사용자 프로필을 찾을 수 없습니다.")
    return TierContext(userId, effectiveTier(row))
}

// ---------- 사용량 ----------

fun Transaction.songCount(userId: UUID): Long =
    SongsTable.selectAll().where { SongsTable.userId eq userId }.count()

fun Transaction.categoryCount(userId: UUID): Long =
    CategoriesTable.selectAll().where { CategoriesTable.userId eq userId }.count()

fun Transaction.serverTakeBytes(userId: UUID): Long {
    val sumExpr = TakesTable.sizeBytes.sum()
    return TakesTable.select(sumExpr)
        .where { (TakesTable.userId eq userId) and (TakesTable.storage eq "supabase") }
        .singleOrNull()?.get(sumExpr) ?: 0L
}

fun Transaction.serverTakeSongIds(userId: UUID): Set<UUID> =
    TakesTable.select(TakesTable.songId)
        .where { (TakesTable.userId eq userId) and (TakesTable.storage eq "supabase") }
        .withDistinct()
        .map { it[TakesTable.songId] }
        .toSet()

// ---------- 에러 (§6, detail에 nextTier·nextLimit — A4) ----------

private fun limitDetail(used: Long, limit: Number?, tier: String, nextLimit: Number?): JsonObject = buildJsonObject {
    put("limit", limit)
    put("used", used)
    put("tier", tier)
    put("nextTier", TierLimits.nextTier(tier))
    put("nextLimit", nextLimit)
}

private fun nextLimitOf(tier: String, pick: (TierLimits) -> Number?): Number? =
    TierLimits.nextTier(tier)?.let { pick(TierLimits.of(it)) }

fun tierUpgradeRequired(feature: String, tier: String, message: String): ApiException = ApiException(
    HttpStatusCode.Forbidden,
    "TIER_UPGRADE_REQUIRED",
    message,
    detail = buildJsonObject {
        put("feature", feature)
        put("tier", tier)
        put("nextTier", TierLimits.nextTier(tier))
    }
)

// ---------- 한도 검사 (추가하려는 순간에만 — 다운그레이드 데이터는 유지, Q8) ----------

/** 곡 [adding]개를 더 넣을 수 있는지. 넘으면 통째 403 `SONG_LIMIT_EXCEEDED` (A3) */
fun Transaction.requireSongSlots(ctx: TierContext, adding: Int) {
    val limit = ctx.limits.songs ?: return
    val used = songCount(ctx.userId)
    if (used + adding > limit) {
        throw ApiException(
            HttpStatusCode.Forbidden,
            "SONG_LIMIT_EXCEEDED",
            "곡은 ${limit}곡까지 등록할 수 있습니다.",
            detail = limitDetail(used, limit, ctx.tier, nextLimitOf(ctx.tier) { it.songs })
        )
    }
}

/** 남은 곡 칸 수. 제한 없으면 null (재생목록 가져오기·복제의 "남은 칸까지") */
fun Transaction.remainingSongSlots(ctx: TierContext): Long? =
    ctx.limits.songs?.let { (it - songCount(ctx.userId)).coerceAtLeast(0) }

fun Transaction.requireCategorySlot(ctx: TierContext) {
    val limit = ctx.limits.categories ?: return
    val used = categoryCount(ctx.userId)
    if (used + 1 > limit) {
        throw ApiException(
            HttpStatusCode.Forbidden,
            "CATEGORY_LIMIT_EXCEEDED",
            "분류는 ${limit}개까지 만들 수 있습니다.",
            detail = limitDetail(used, limit, ctx.tier, nextLimitOf(ctx.tier) { it.categories })
        )
    }
}

/** 서버 녹음 총량. 넘으면 413 `TAKE_QUOTA_EXCEEDED`(기존 코드·상태 유지) */
fun takeQuotaExceeded(ctx: TierContext, usedBytes: Long): ApiException {
    val limit = ctx.limits.takeBytes
    return ApiException(
        HttpStatusCode.PayloadTooLarge,
        "TAKE_QUOTA_EXCEEDED",
        "녹음 저장 한도(${limit / 1_048_576}MB)를 넘습니다. 오래된 녹음을 지운 뒤 다시 올려 주세요.",
        detail = buildJsonObject {
            put("limitBytes", limit)
            put("usedBytes", usedBytes)
            put("tier", ctx.tier)
            put("nextTier", TierLimits.nextTier(ctx.tier))
            put("nextLimit", nextLimitOf(ctx.tier) { it.takeBytes })
        }
    )
}

/** 무료 녹음 규칙: 한 개 길이, 녹음 곡 수 (A1 — 옛 RECENT_SONG_ONLY·SINGLE_SONG_TAKE_LIMIT 대체) */
fun requireTakeDuration(ctx: TierContext, durationSec: Int) {
    val limit = ctx.limits.takeDurationSec ?: return
    if (durationSec > limit) {
        throw ApiException(
            HttpStatusCode.Forbidden,
            "TAKE_DURATION_LIMIT_EXCEEDED",
            "녹음 한 개는 ${limit / 60}분까지 저장할 수 있습니다.",
            detail = buildJsonObject {
                put("limitSec", limit)
                put("tier", ctx.tier)
                put("nextTier", TierLimits.nextTier(ctx.tier))
            }
        )
    }
}

/** [existingSongIds] = 지금 서버 녹음이 있는 곡들, [songId] = 이번에 녹음을 더할 곡 */
fun requireTakeSongs(ctx: TierContext, existingSongIds: Set<UUID>, songId: UUID) {
    val limit = ctx.limits.takeSongs ?: return
    if (songId !in existingSongIds && existingSongIds.size + 1 > limit) {
        throw ApiException(
            HttpStatusCode.Forbidden,
            "FREE_TAKE_SONG_LIMIT_EXCEEDED",
            "무료 플랜은 ${limit}곡까지 녹음을 저장할 수 있습니다.",
            detail = limitDetail(existingSongIds.size.toLong(), limit, ctx.tier, nextLimitOf(ctx.tier) { it.takeSongs })
        )
    }
}

fun requireDrive(ctx: TierContext) {
    if (!ctx.limits.drive) {
        throw tierUpgradeRequired("drive", ctx.tier, "Google Drive 저장소는 유료 플랜에서 쓸 수 있습니다.")
    }
}

/**
 * 다운그레이드 정리 (§1-3). 실제 티어가 유료 → free가 된 그 트랜잭션에서 부른다.
 * - 학습 기록 공유 끄기(A8)
 * - 저장소를 서버로 되돌림 — Drive 녹음은 재생 유지, 새 업로드는 무료 한도의 서버 저장으로 받는다
 * TODO(stub): M1-4에서 그 사용자의 shared_folders(kind='user')를 is_public=false, auto_sync=false로
 */
fun Transaction.downgradeCleanup(userId: UUID) {
    ProfilesTable.update({ ProfilesTable.id eq userId }) {
        it[sharePracticeLog] = false
        it[storageProvider] = "supabase"
    }
}

@Serializable
data class TierExpireResult(val expired: Int, val downgraded: Int)

class TierService(private val db: Database?) {
    private val log = LoggerFactory.getLogger(TierService::class.java)

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    /**
     * `POST /internal/cron/tier-expire` (매일 00:05 KST). 기한 지난 override를 NULL로 바꾸고,
     * 그 결과 실제 티어가 유료 → free가 된 계정을 정리한다
     */
    suspend fun expireOverrides(now: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)): TierExpireResult {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val rows = ProfilesTable.selectAll()
                .where { ProfilesTable.tierOverride.isNotNull() and (ProfilesTable.tierOverrideUntil lessEq now) }
                .forUpdate(ForUpdateOption.ForUpdate)
                .toList()
            var downgraded = 0
            for (row in rows) {
                val userId = row[ProfilesTable.id]
                // 기한이 지났으므로 지금 실제 티어는 billing_tier. 만료 직전 티어 = override
                val before = row[ProfilesTable.tierOverride]!!
                val after = row[ProfilesTable.billingTier]
                ProfilesTable.update({ ProfilesTable.id eq userId }) {
                    it[tierOverride] = null
                    it[tierOverrideUntil] = null
                }
                if (TierLimits.isPaid(before) && !TierLimits.isPaid(after)) {
                    downgradeCleanup(userId)
                    downgraded++
                }
            }
            if (rows.isNotEmpty()) log.info("tier-expire: expired=${rows.size}, downgraded=$downgraded")
            TierExpireResult(expired = rows.size, downgraded = downgraded)
        }
    }
}
