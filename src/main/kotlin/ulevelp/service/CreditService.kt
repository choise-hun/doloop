package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import org.slf4j.LoggerFactory
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.db.AnalysisJobsTable
import ulevelp.db.CreditLedgerTable
import ulevelp.db.DatabaseFactory
import ulevelp.db.ProfilesTable
import ulevelp.note.HttpGeminiClient
import java.time.Clock
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * 크레딧 산식 (Q4, `개발산출물/결과/M1-3a_크레딧수치.md` §6). 1크레딧 = 입력 4000토큰 또는 출력 1000토큰.
 * `ceil(a/4000 + b/1000) = ceil((a + 4b)/4000)`로 정수 계산한다
 */
object CreditMath {
    /** 프롬프트 텍스트 토큰(코드 진행 818, 노트 474~698 → 위쪽 경계 하나) */
    const val TEXT_TOKENS = 818
    /** 노트 분석(기본 0.2fps) 초당 영상 토큰 */
    const val TOKENS_PER_SEC_NOTE = 39
    /** 코드 진행 속도별 초당 영상 토큰 (실측 올림: 57.9·91.0·220.1) */
    val TOKENS_PER_SEC_PACE: Map<String, Int> = mapOf("slow" to 58, NoteService.PACE_NORMAL to 92, "fast" to 221)
    /** 예상 소모(배지)에 쓰는 출력 토큰 — 실측 최대 */
    const val EXPECTED_OUTPUT_TOKENS = 2400

    private fun ceilCredits(inputTokens: Long, outputTokens: Long): Int =
        ((inputTokens + 4L * outputTokens + 3999L) / 4000L).toInt()

    fun inputTokens(kind: String, pace: String?, seconds: Int): Long {
        val perSec = if (kind == NoteService.JOB_KIND_PROGRESSION) {
            TOKENS_PER_SEC_PACE[pace ?: NoteService.PACE_NORMAL] ?: TOKENS_PER_SEC_PACE.getValue(NoteService.PACE_NORMAL)
        } else {
            TOKENS_PER_SEC_NOTE
        }
        return TEXT_TOKENS + seconds.toLong() * perSec
    }

    /** 예약액 = `ceil((818 + 초 × 초당)/4000 + 8192/1000)` */
    fun reserve(kind: String, pace: String?, seconds: Int): Int =
        ceilCredits(inputTokens(kind, pace, seconds), HttpGeminiClient.MAX_OUTPUT_TOKENS.toLong())

    /** 예상 소모 = 출력 2400 가정 */
    fun estimate(kind: String, pace: String?, seconds: Int): Int =
        ceilCredits(inputTokens(kind, pace, seconds), EXPECTED_OUTPUT_TOKENS.toLong())

    /** 정산액 = `ceil(prompt/4000 + (output + thoughts)/1000)` */
    fun charge(promptTokens: Int, outputTokens: Int, thoughtsTokens: Int): Int =
        ceilCredits(promptTokens.toLong(), outputTokens.toLong() + thoughtsTokens.toLong())
}

@Serializable
data class CreditsSummaryResponse(
    val monthly: Int,
    val purchased: Int,
    val total: Int,
    /** 실제 티어의 월 지급량(free 0) */
    val monthlyGrant: Int,
    /** 다음 지급 시각(다음 달 1일 0시 KST). 월 지급이 없으면 null */
    val nextGrantAt: String? = null
)

@Serializable
data class CreditLedgerRowDto(
    val id: Long,
    val bucket: String,
    val delta: Int,
    val balanceAfter: Int,
    val reason: String,
    val jobId: String? = null,
    val createdAt: String
)

@Serializable
data class CreditLedgerResponse(
    val rows: List<CreditLedgerRowDto>,
    /** 다음 페이지의 `before` 값. 없으면 null */
    val next: Long? = null
)

@Serializable
data class CreditEstimateResponse(val estimatedCredits: Int, val reserveCredits: Int)

@Serializable
data class MonthlyCreditsResult(val period: String, val users: Int, val expired: Int, val granted: Int)

/** 작업에 예약한 크레딧 (버킷별) */
data class CreditReservation(val monthly: Int, val purchased: Int) {
    val total: Int get() = monthly + purchased
}

const val BUCKET_MONTHLY = "monthly"
const val BUCKET_PURCHASED = "purchased"

private val creditLog = LoggerFactory.getLogger("ulevelp.service.Credits")

private fun bucketColumn(bucket: String): Column<Int> =
    if (bucket == BUCKET_MONTHLY) ProfilesTable.monthlyCredits else ProfilesTable.purchasedCredits

fun insufficientCredits(required: Int, balance: Int): ApiException = ApiException(
    HttpStatusCode.PaymentRequired,
    "INSUFFICIENT_CREDITS",
    "크레딧이 부족합니다. 이 분석에는 ${required}크레딧이 필요하고 지금 ${balance}크레딧이 있습니다.",
    detail = buildJsonObject {
        put("required", required)
        put("balance", balance)
    }
)

/**
 * 크레딧은 이 함수로만 바뀐다: 프로필 버킷 잔액 + 원장 한 행(balance_after). 불변식 = 버킷별 SUM(delta) = 잔액.
 * 호출하는 쪽이 같은 트랜잭션에서 프로필 행을 FOR UPDATE로 잠가 둔다
 */
internal fun Transaction.applyCredit(
    userId: UUID,
    bucket: String,
    delta: Int,
    reason: String,
    jobId: UUID? = null,
    period: String? = null
): Int {
    require(delta != 0) { "delta must not be 0" }
    val column = bucketColumn(bucket)
    val balance = ProfilesTable.select(column).where { ProfilesTable.id eq userId }.single()[column]
    val after = balance + delta
    check(after >= 0) { "credit balance would be negative: bucket=$bucket balance=$balance delta=$delta" }
    ProfilesTable.update({ ProfilesTable.id eq userId }) { it[column] = after }
    CreditLedgerTable.insert {
        it[CreditLedgerTable.userId] = userId
        it[CreditLedgerTable.bucket] = bucket
        it[CreditLedgerTable.delta] = delta
        it[balanceAfter] = after
        it[CreditLedgerTable.reason] = reason
        it[CreditLedgerTable.period] = period
        it[CreditLedgerTable.jobId] = jobId
    }
    return after
}

private fun Transaction.lockProfileBalances(userId: UUID): Pair<Int, Int> {
    val row = ProfilesTable.select(ProfilesTable.monthlyCredits, ProfilesTable.purchasedCredits)
        .where { ProfilesTable.id eq userId }
        .forUpdate(ForUpdateOption.ForUpdate)
        .single()
    return row[ProfilesTable.monthlyCredits] to row[ProfilesTable.purchasedCredits]
}

/**
 * 작업 생성 때 예약(M1-1 §3): 잔액(월+구매) < [amount]면 402, 아니면 **월 지급분부터** 뺀다.
 * 작업 행([jobId])이 같은 트랜잭션에 이미 있어야 한다(원장 FK). 402는 트랜잭션 전체를 되돌린다
 */
fun Transaction.reserveCredits(userId: UUID, jobId: UUID, amount: Int): CreditReservation {
    val (monthly, purchased) = lockProfileBalances(userId)
    val balance = monthly + purchased
    if (balance < amount) throw insufficientCredits(amount, balance)
    val fromMonthly = minOf(monthly, amount)
    val fromPurchased = amount - fromMonthly
    if (fromMonthly > 0) applyCredit(userId, BUCKET_MONTHLY, -fromMonthly, "reserve", jobId = jobId)
    if (fromPurchased > 0) applyCredit(userId, BUCKET_PURCHASED, -fromPurchased, "reserve", jobId = jobId)
    AnalysisJobsTable.update({ AnalysisJobsTable.id eq jobId }) {
        it[reservedMonthly] = fromMonthly
        it[reservedPurchased] = fromPurchased
    }
    return CreditReservation(fromMonthly, fromPurchased)
}

private fun Transaction.jobReservation(jobId: UUID): Triple<UUID, CreditReservation, Int?>? =
    AnalysisJobsTable.select(
        AnalysisJobsTable.userId, AnalysisJobsTable.reservedMonthly, AnalysisJobsTable.reservedPurchased, AnalysisJobsTable.chargedCredits
    ).where { AnalysisJobsTable.id eq jobId }.singleOrNull()?.let {
        Triple(
            it[AnalysisJobsTable.userId],
            CreditReservation(it[AnalysisJobsTable.reservedMonthly], it[AnalysisJobsTable.reservedPurchased]),
            it[AnalysisJobsTable.chargedCredits]
        )
    }

/**
 * 완료 정산(M1-1 §3): 실제 < 예약이면 차액을 **구매분부터** 되돌리고, 실제 > 예약이면 잔액 안에서만 더 뺀다
 * (모자라는 만큼은 받지 않고 로그). 이미 정산했으면 그 값을 돌려준다. 예약 0/0(옛 작업)은 과금하지 않는다
 */
fun Transaction.settleCredits(jobId: UUID, actual: Int): Int {
    val (userId, reserved, charged) = jobReservation(jobId) ?: return 0
    if (charged != null) return charged
    val result: Int = if (reserved.total == 0) {
        0
    } else if (actual <= reserved.total) {
        lockProfileBalances(userId)
        var back = reserved.total - actual
        val toPurchased = minOf(back, reserved.purchased)
        back -= toPurchased
        if (toPurchased > 0) applyCredit(userId, BUCKET_PURCHASED, toPurchased, "settle", jobId = jobId)
        if (back > 0) applyCredit(userId, BUCKET_MONTHLY, back, "settle", jobId = jobId)
        actual
    } else {
        val (monthly, purchased) = lockProfileBalances(userId)
        val extra = actual - reserved.total
        val fromMonthly = minOf(monthly, extra)
        val fromPurchased = minOf(purchased, extra - fromMonthly)
        if (fromMonthly > 0) applyCredit(userId, BUCKET_MONTHLY, -fromMonthly, "settle", jobId = jobId)
        if (fromPurchased > 0) applyCredit(userId, BUCKET_PURCHASED, -fromPurchased, "settle", jobId = jobId)
        val collected = fromMonthly + fromPurchased
        if (collected < extra) {
            creditLog.warn("정산 초과분 일부 미수 jobId={} reserved={} actual={} uncollected={}", jobId, reserved.total, actual, extra - collected)
        }
        reserved.total + collected
    }
    AnalysisJobsTable.update({ AnalysisJobsTable.id eq jobId }) { it[chargedCredits] = result }
    return result
}

/** 실패(Gemini 오류·시간 초과·디스패치 실패): 예약 전액 반환, charged = 0. 이미 정산·반환했으면 아무것도 안 한다 */
fun Transaction.refundCredits(jobId: UUID) {
    val (userId, reserved, charged) = jobReservation(jobId) ?: return
    if (charged != null) return
    if (reserved.total > 0) {
        lockProfileBalances(userId)
        if (reserved.purchased > 0) applyCredit(userId, BUCKET_PURCHASED, reserved.purchased, "refund", jobId = jobId)
        if (reserved.monthly > 0) applyCredit(userId, BUCKET_MONTHLY, reserved.monthly, "refund", jobId = jobId)
    }
    AnalysisJobsTable.update({ AnalysisJobsTable.id eq jobId }) { it[chargedCredits] = 0 }
}

/**
 * `/credits*` API·분석 길이 계산·월 지급 cron (M1-1 §3·§5-4·§5-6)
 */
class CreditService(
    private val db: Database?,
    private val videoDurationClient: VideoDurationClient,
    private val clock: Clock = Clock.systemUTC()
) {
    private val log = LoggerFactory.getLogger(CreditService::class.java)

    companion object {
        val KST: ZoneId = ZoneId.of("Asia/Seoul")
        const val DEFAULT_LEDGER_LIMIT = 50
        const val MAX_LEDGER_LIMIT = 200
        private val PERIOD_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM")

        fun period(month: YearMonth): String = month.format(PERIOD_FORMAT)

        private fun ts(instant: Instant): String = DateTimeFormatter.ISO_INSTANT.format(instant)
    }

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    /**
     * 분석할 길이(초): 구간 끝이 있으면 `끝 − 시작`, 없으면 YouTube 영상 길이 − 시작(A12).
     * 라이브(길이 0)·시작이 영상 길이 이상이면 400
     */
    suspend fun analysisSeconds(videoId: String, startSec: Int?, endSec: Int?): Int {
        val start = startSec ?: 0
        if (endSec != null) return (endSec - start).coerceAtLeast(1)
        val duration = videoDurationClient.durationSec(videoId)
        if (duration <= 0) {
            throw InvalidInputException("길이를 알 수 없는 영상(라이브 등)은 분석할 수 없습니다.")
        }
        if (start >= duration) {
            throw InvalidInputException("startSec가 영상 길이(${duration}초)보다 같거나 깁니다.")
        }
        return duration - start
    }

    /** `POST /credits/estimate` — 입력 검증은 라우트에서 끝난 값 */
    suspend fun estimate(kind: String, videoId: String, options: AnalysisJobOptions?): CreditEstimateResponse {
        val pace = if (kind == NoteService.JOB_KIND_PROGRESSION) options?.pace else null
        val seconds = analysisSeconds(videoId, options?.startSec, options?.endSec)
        return CreditEstimateResponse(
            estimatedCredits = CreditMath.estimate(kind, pace, seconds),
            reserveCredits = CreditMath.reserve(kind, pace, seconds)
        )
    }

    /** `GET /credits` */
    suspend fun summary(userId: UUID): CreditsSummaryResponse = DatabaseFactory.dbQuery(requireDb()) {
        val row = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.singleOrNull()
            ?: throw ulevelp.api.NotFoundException("사용자 프로필을 찾을 수 없습니다.")
        val now = clock.instant()
        val grant = TierLimits.of(effectiveTier(row, now.atOffset(ZoneOffset.UTC))).monthlyCredits
        val monthly = row[ProfilesTable.monthlyCredits]
        val purchased = row[ProfilesTable.purchasedCredits]
        val nextGrant = YearMonth.from(now.atZone(KST)).plusMonths(1).atDay(1).atStartOfDay(KST).toInstant()
        CreditsSummaryResponse(
            monthly = monthly,
            purchased = purchased,
            total = monthly + purchased,
            monthlyGrant = grant,
            nextGrantAt = if (grant > 0) ts(nextGrant) else null
        )
    }

    /** `GET /credits/ledger?before=&limit=` — 최근 순, memo·audit은 보이지 않음 */
    suspend fun ledger(userId: UUID, before: Long?, limit: Int): CreditLedgerResponse = DatabaseFactory.dbQuery(requireDb()) {
        val query = CreditLedgerTable.selectAll().where { CreditLedgerTable.userId eq userId }
        if (before != null) query.andWhere { CreditLedgerTable.id less before }
        val rows = query.orderBy(CreditLedgerTable.id to SortOrder.DESC).limit(limit + 1).toList()
        val page = rows.take(limit).map {
            CreditLedgerRowDto(
                id = it[CreditLedgerTable.id],
                bucket = it[CreditLedgerTable.bucket],
                delta = it[CreditLedgerTable.delta],
                balanceAfter = it[CreditLedgerTable.balanceAfter],
                reason = it[CreditLedgerTable.reason],
                jobId = it[CreditLedgerTable.jobId]?.toString(),
                createdAt = ts(it[CreditLedgerTable.createdAt].toInstant())
            )
        }
        CreditLedgerResponse(page, next = if (rows.size > limit) page.last().id else null)
    }

    /**
     * `POST /internal/cron/monthly-credits` (매월 1일 0시 KST, Q5). 계정마다 한 트랜잭션:
     * 남은 월 지급분 소멸(period = 지난달) → 실제 티어가 유료면 지급(period = 이번 달).
     * 같은 달에 다시 돌려도 원장에 그 period 행이 있으면 건너뛴다(유니크 인덱스가 마지막 방어)
     */
    suspend fun runMonthlyGrant(now: Instant = clock.instant()): MonthlyCreditsResult {
        val database = requireDb()
        val month = YearMonth.from(now.atZone(KST))
        val thisPeriod = period(month)
        val prevPeriod = period(month.minusMonths(1))
        val nowUtc = now.atOffset(ZoneOffset.UTC)

        val userIds = DatabaseFactory.dbQuery(database) {
            ProfilesTable.select(ProfilesTable.id).orderBy(ProfilesTable.id).map { it[ProfilesTable.id] }
        }
        var expired = 0
        var granted = 0
        for (userId in userIds) {
            DatabaseFactory.dbQuery(database) {
                val row = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }
                    .forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: return@dbQuery
                fun done(reason: String, period: String): Boolean = CreditLedgerTable.selectAll().where {
                    (CreditLedgerTable.userId eq userId) and (CreditLedgerTable.bucket eq BUCKET_MONTHLY) and
                        (CreditLedgerTable.reason eq reason) and (CreditLedgerTable.period eq period)
                }.limit(1).count() > 0

                // 이번 달 지급이 이미 있으면 남은 월 지급분은 이번 달 것이다(같은 달 재실행) → 소멸하지 않는다
                val remaining = row[ProfilesTable.monthlyCredits]
                if (remaining > 0 && !done("monthly_grant", thisPeriod) && !done("monthly_expire", prevPeriod)) {
                    applyCredit(userId, BUCKET_MONTHLY, -remaining, "monthly_expire", period = prevPeriod)
                    expired++
                }
                val grant = TierLimits.of(effectiveTier(row, nowUtc)).monthlyCredits
                if (grant > 0 && !done("monthly_grant", thisPeriod)) {
                    applyCredit(userId, BUCKET_MONTHLY, grant, "monthly_grant", period = thisPeriod)
                    granted++
                }
            }
        }
        log.info("monthly-credits: period={} users={} expired={} granted={}", thisPeriod, userIds.size, expired, granted)
        return MonthlyCreditsResult(period = thisPeriod, users = userIds.size, expired = expired, granted = granted)
    }
}
