package ulevelp.credit

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.note.GeminiApiException
import ulevelp.note.GeminiGenerateResult
import ulevelp.service.*
import ulevelp.support.*
import org.jetbrains.exposed.sql.update
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.util.UUID
import kotlin.test.*

/**
 * M1-3b — 크레딧 서버: 무료 403·사전 402, 예약→정산·실패 반환, `/credits*`
 * (개발산출물/결과/M1-1_스키마설계.md §3·§5-4·§5-6, 결과/M1-3a_크레딧수치.md §6).
 * M1-3d — 크레딧 주기: 유료 전환 즉시 지급 + 30일 충전, Pro → Pro+ 차액, 무료 전환 시 주기 끝 소멸(결과/M1-3d_크레딧주기.md).
 * 테스트마다 "원장 합계 = 잔액"
 */
class CreditApiTest {

    companion object {
        private lateinit var dataSource: HikariDataSource
        private lateinit var db: Database
        private lateinit var dbConfig: DatabaseConfig

        @JvmStatic
        @BeforeAll
        fun setUp() {
            dbConfig = PostgresTestContainer.getConfig()
            dataSource = DatabaseFactory.createDataSource(dbConfig)
            DatabaseFactory.migrate(dataSource)
            db = DatabaseFactory.connect(dataSource)
        }

        @JvmStatic
        @AfterAll
        fun tearDown() {
            if (::dataSource.isInitialized) {
                runCatching {
                    dataSource.connection.use { conn ->
                        conn.createStatement().use { stmt ->
                            stmt.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
                        }
                        conn.commit()
                    }
                }
                dataSource.close()
            }
        }

        const val VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    }

    private lateinit var gemini: FakeGeminiClient
    private lateinit var duration: FakeVideoDurationClient

    @BeforeEach
    fun clean() {
        gemini = FakeGeminiClient()
        duration = FakeVideoDurationClient(durationSec = 240)
        transaction(db) {
            CreditLedgerTable.deleteAll()
            AnalysisJobsTable.deleteAll()
            StorageTrashTable.deleteAll()
            UsersTable.deleteAll()
        }
    }

    private fun json(text: String): JsonObject = Json.parseToJsonElement(text).jsonObject

    private fun noteService(key: String? = TestCredits.SYSTEM_GEMINI_KEY) =
        NoteService(db, CreditService(db, duration), FakeVideoMetaClient(), gemini, key)

    /** 요청 안에서 곧바로 작업을 실행하는 디스패처(정산까지 한 번에 확인) */
    private fun ApplicationTestBuilder.app(
        autoRun: Boolean = true,
        dispatcher: FakeAnalyzeJobDispatcher = FakeAnalyzeJobDispatcher(autoExecute = autoRun, runner = { noteService().executeJob(it) }),
        geminiApiKey: String? = TestCredits.SYSTEM_GEMINI_KEY
    ) = configureApiTestApp(
        dbConfig = dbConfig,
        geminiClient = gemini,
        analyzeJobDispatcher = dispatcher,
        videoDurationClient = duration,
        geminiApiKey = geminiApiKey
    )

    private suspend fun HttpClient.newUser(tier: String? = null): Pair<UUID, String> {
        val id = UUID.randomUUID()
        val token = TestJwt.token(id, email = "c${id.toString().take(8)}@example.com")
        assertEquals(HttpStatusCode.OK, get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }.status)
        if (tier != null) TestTier.set(db, id, tier)
        return id to token
    }

    private suspend fun HttpClient.analyzeNote(token: String): HttpResponse = post("/api/v1/notes/analyze") {
        header(HttpHeaders.Authorization, "Bearer $token")
        contentType(ContentType.Application.Json)
        setBody(buildJsonObject {
            put("url", VIDEO)
            putJsonArray("tags") { add(JsonPrimitive("화성")) }
        }.toString())
    }

    private suspend fun HttpClient.analyzeProgression(token: String, body: JsonObject): HttpResponse = post("/api/v1/progressions/analyze") {
        header(HttpHeaders.Authorization, "Bearer $token")
        contentType(ContentType.Application.Json)
        setBody(body.toString())
    }

    private suspend fun HttpClient.job(token: String, jobId: String): JsonObject {
        val res = get("/api/v1/notes/jobs/$jobId") { header(HttpHeaders.Authorization, "Bearer $token") }
        assertEquals(HttpStatusCode.OK, res.status)
        return json(res.bodyAsText())
    }

    private fun usage(prompt: Int, output: Int, thoughts: Int = 0) = GeminiGenerateResult(
        analysis = FakeGeminiClient.defaultSuccessResult().analysis,
        usageSummary = "{}",
        promptTokens = prompt,
        outputTokens = output,
        thoughtsTokens = thoughts,
        modelVersion = "gemini-3.8-flash"
    )

    private fun ledgerReasons(userId: UUID): List<Triple<String, String, Int>> = transaction(db) {
        CreditLedgerTable.selectAll().where { CreditLedgerTable.userId eq userId }.orderBy(CreditLedgerTable.id).map {
            Triple(it[CreditLedgerTable.reason], it[CreditLedgerTable.bucket], it[CreditLedgerTable.delta])
        }
    }

    // ---------------- 산식 (M1-3a §6 표) ----------------

    @Test
    fun `M1 산식 - M1-3a 예약·정산 예와 같다`() {
        assertEquals(15, CreditMath.reserve("note", null, 600))            // 노트 10분
        assertEquals(9, CreditMath.estimate("note", null, 600))
        assertEquals(19, CreditMath.reserve("note", null, 1028))           // 노트 17분
        assertEquals(14, CreditMath.reserve("progression", "normal", 240)) // 코드 진행 보통 4분
        assertEquals(22, CreditMath.reserve("progression", "fast", 240))
        assertEquals(16, CreditMath.estimate("progression", "fast", 240))
        assertEquals(12, CreditMath.reserve("progression", "slow", 240))
        assertEquals(9, CreditMath.reserve("progression", "normal", 24))
        // 정산: GA-3 실측 1건 = 4, P2(45501·1327) = 13, N2(39687·2400) = 13
        assertEquals(4, CreditMath.charge(2999, 2319, 0))
        assertEquals(13, CreditMath.charge(45501, 1327, 0))
        assertEquals(13, CreditMath.charge(39687, 2400, 0))
        assertEquals(1, CreditMath.charge(1, 0, 0))
        assertEquals(0, CreditMath.charge(0, 0, 0))
    }

    // ---------------- 분석 요청 ----------------

    @Test
    fun `A1 무료 403·키 없음 503·잔액 부족 402 - 작업·원장 행 없음`() = testApplication {
        app(geminiApiKey = null)
        val (freeId, freeToken) = client.newUser()
        val free = client.analyzeNote(freeToken)
        assertEquals(HttpStatusCode.Forbidden, free.status)
        val freeErr = assertStandardError(free.bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertEquals(buildJsonObject { put("feature", "ai"); put("tier", "free"); put("nextTier", "pro") }, freeErr["detail"])
        assertTrue(duration.calls.isEmpty(), "무료는 YouTube 길이 조회 전에 막는다")

        // 서버 키 없음 → 503 (유료여도)
        val (proId, proToken) = client.newUser("pro")
        TestCredits.grant(db, proId, 5)
        val noKey = client.analyzeNote(proToken)
        assertEquals(HttpStatusCode.ServiceUnavailable, noKey.status)
        assertStandardError(noKey.bodyAsText(), 503, "GEMINI_UNAVAILABLE")

        transaction(db) { assertEquals(0, AnalysisJobsTable.selectAll().count()) }
        TestCredits.assertInvariant(db, freeId)
        TestCredits.assertInvariant(db, proId)
    }

    @Test
    fun `A2 잔액 부족 402 detail - 작업 행까지 되돌린다`() = testApplication {
        app()
        val (id, token) = client.newUser("pro")
        TestCredits.grant(db, id, 3, BUCKET_MONTHLY)
        TestCredits.grant(db, id, 2)
        val res = client.analyzeNote(token) // 240초 노트 → 예약 11
        assertEquals(HttpStatusCode.PaymentRequired, res.status)
        val err = assertStandardError(res.bodyAsText(), 402, "INSUFFICIENT_CREDITS")
        assertEquals(buildJsonObject { put("required", 11); put("balance", 5) }, err["detail"])
        transaction(db) { assertEquals(0, AnalysisJobsTable.selectAll().count()) }
        assertEquals(3 to 2, TestCredits.balances(db, id))
        assertEquals(2, ledgerReasons(id).size)
        TestCredits.assertInvariant(db, id)
    }

    @Test
    fun `A3 예약은 월 지급분부터, 정산 반환은 구매분부터 - 토큰·확정액 기록`() = testApplication {
        app()
        val (id, token) = client.newUser("pro")
        TestCredits.grant(db, id, 10, BUCKET_MONTHLY)
        TestCredits.grant(db, id, 100)
        gemini.defaultResult = usage(prompt = 9000, output = 2000) // 정산 = ceil(9000/4000 + 2000/1000) = 5

        val res = client.analyzeNote(token)
        assertEquals(HttpStatusCode.Accepted, res.status, res.bodyAsText())
        val body = json(res.bodyAsText())
        assertEquals(11, body["reservedCredits"]!!.jsonPrimitive.int)
        assertEquals(listOf("dQw4w9WgXcQ"), duration.calls, "구간 없는 요청은 영상 길이로 예약")

        val job = client.job(token, body["jobId"]!!.jsonPrimitive.content)
        assertEquals("done", job["status"]!!.jsonPrimitive.content, job.toString())
        assertEquals(11, job["reservedCredits"]!!.jsonPrimitive.int)
        assertEquals(5, job["chargedCredits"]!!.jsonPrimitive.int)
        assertEquals(9000, job["promptTokens"]!!.jsonPrimitive.int)
        assertEquals(2000, job["outputTokens"]!!.jsonPrimitive.int)
        assertEquals(0, job["thoughtsTokens"]!!.jsonPrimitive.int)

        // 예약: 월 10 + 구매 1 → 반환 6: 구매 1 먼저, 남은 5는 월 지급분 → 월 5 · 구매 100
        assertEquals(5 to 100, TestCredits.balances(db, id))
        assertEquals(
            listOf(
                Triple("admin_adjust", "monthly", 10), Triple("admin_adjust", "purchased", 100),
                Triple("reserve", "monthly", -10), Triple("reserve", "purchased", -1),
                Triple("settle", "purchased", 1), Triple("settle", "monthly", 5)
            ),
            ledgerReasons(id)
        )
        transaction(db) {
            val row = AnalysisJobsTable.selectAll().single()
            assertEquals("gemini-3.8-flash", row[AnalysisJobsTable.modelVersion])
            assertEquals("gemini-3.8-flash", NotesTable.selectAll().single()[NotesTable.model])
        }
        assertEquals("gemini-3.8-flash", gemini.calls.single().second, "고정 모델로 호출")
        assertEquals(TestCredits.SYSTEM_GEMINI_KEY, gemini.calls.single().first, "서버 키로 호출")
        TestCredits.assertInvariant(db, id)

        // 이미 정산한 작업을 다시 정산·반환해도 바뀌지 않는다
        val jobId = UUID.fromString(body["jobId"]!!.jsonPrimitive.content)
        transaction(db) {
            assertEquals(5, settleCredits(jobId, 99))
            refundCredits(jobId)
        }
        assertEquals(5 to 100, TestCredits.balances(db, id))
        TestCredits.assertInvariant(db, id)
    }

    @Test
    fun `A4 실패하면 예약 전액 반환 - charged 0, 다시 실행해도 한 번`() = testApplication {
        app()
        val (id, token) = client.newUser("pro_plus")
        TestCredits.grant(db, id, 4, BUCKET_MONTHLY)
        TestCredits.grant(db, id, 50)
        gemini.handler = { _, _, _, _, _ -> throw GeminiApiException(503, "GEMINI_OVERLOADED", "GEMINI_OVERLOADED: 테스트") }

        val res = client.analyzeNote(token)
        assertEquals(HttpStatusCode.Accepted, res.status)
        val jobId = json(res.bodyAsText())["jobId"]!!.jsonPrimitive.content
        val job = client.job(token, jobId)
        assertEquals("failed", job["status"]!!.jsonPrimitive.content)
        assertTrue(job["error"]!!.jsonPrimitive.content.startsWith("GEMINI_OVERLOADED"))
        assertEquals(11, job["reservedCredits"]!!.jsonPrimitive.int)
        assertEquals(0, job["chargedCredits"]!!.jsonPrimitive.int)
        assertTrue(job["promptTokens"] is JsonNull)
        assertEquals(4 to 50, TestCredits.balances(db, id))

        noteService().executeJob(UUID.fromString(jobId)) // queued가 아니라 아무것도 안 함
        val reasons = ledgerReasons(id).map { it.first }
        assertEquals(listOf("admin_adjust", "admin_adjust", "reserve", "reserve", "refund", "refund"), reasons)
        TestCredits.assertInvariant(db, id)
    }

    @Test
    fun `A5 실제가 예약보다 크면 잔액 안에서만 더 뺀다`() = testApplication {
        app()
        val (id, token) = client.newUser("pro")
        TestCredits.grant(db, id, 15)

        // 코드 진행 보통 0~24초 → 예약 9. 정산 = ceil(3000/4000 + 12000/1000) = 13 → 4 더 뺀다
        gemini.defaultResult = usage(prompt = 3000, output = 12000)
        val r1 = client.analyzeProgression(token, buildJsonObject { put("url", VIDEO); put("startSec", 0); put("endSec", 24) })
        assertEquals(HttpStatusCode.Accepted, r1.status, r1.bodyAsText())
        assertEquals(9, json(r1.bodyAsText())["reservedCredits"]!!.jsonPrimitive.int)
        assertTrue(duration.calls.isEmpty(), "구간 끝이 있으면 YouTube를 부르지 않는다")
        val j1 = client.job(token, json(r1.bodyAsText())["jobId"]!!.jsonPrimitive.content)
        assertEquals(13, j1["chargedCredits"]!!.jsonPrimitive.int)
        assertEquals(0 to 2, TestCredits.balances(db, id))

        // 남은 2로는 다음 예약(9)이 402
        val r2 = client.analyzeProgression(token, buildJsonObject { put("url", VIDEO); put("startSec", 0); put("endSec", 25) })
        assertEquals(HttpStatusCode.PaymentRequired, r2.status)

        // 잔액 9 더 받고, 정산 41(출력 40000)인데 추가로 낼 수 있는 건 2뿐 → 9 + 2 = 11만 받는다
        TestCredits.grant(db, id, 9)
        gemini.defaultResult = usage(prompt = 3000, output = 40000)
        val r3 = client.analyzeProgression(token, buildJsonObject { put("url", VIDEO); put("startSec", 0); put("endSec", 25) })
        assertEquals(HttpStatusCode.Accepted, r3.status, r3.bodyAsText())
        val j3 = client.job(token, json(r3.bodyAsText())["jobId"]!!.jsonPrimitive.content)
        assertEquals(11, j3["chargedCredits"]!!.jsonPrimitive.int)
        assertEquals(0 to 0, TestCredits.balances(db, id))
        TestCredits.assertInvariant(db, id)
    }

    @Test
    fun `A6 디스패치 실패도 전액 반환, YouTube 오류면 예약 없음`() = testApplication {
        val failing = FakeAnalyzeJobDispatcher().apply { handler = { throw RuntimeException("boom") } }
        app(dispatcher = failing)
        val (id, token) = client.newUser("pro")
        TestCredits.grant(db, id, 30)

        val res = client.analyzeNote(token)
        assertEquals(HttpStatusCode.BadGateway, res.status)
        assertStandardError(res.bodyAsText(), 502, "JOB_DISPATCH_ERROR")
        assertEquals(0 to 30, TestCredits.balances(db, id))
        assertEquals(listOf("admin_adjust", "reserve", "refund"), ledgerReasons(id).map { it.first })

        // 영상 없음 → 404, 라이브(길이 0) → 400 — 둘 다 작업·예약 없음
        duration.error = YoutubeDataVideoClient.videoNotFound()
        val notFound = client.analyzeNote(token)
        assertEquals(HttpStatusCode.NotFound, notFound.status)
        assertStandardError(notFound.bodyAsText(), 404, "VIDEO_NOT_FOUND")
        duration.error = null
        duration.durationSec = 0
        val live = client.analyzeNote(token)
        assertEquals(HttpStatusCode.BadRequest, live.status)
        assertStandardError(live.bodyAsText(), 400, "INVALID_INPUT")
        transaction(db) { assertEquals(1, AnalysisJobsTable.selectAll().count()) }
        TestCredits.assertInvariant(db, id)
    }

    // ---------------- /credits ----------------

    @Test
    fun `B1 GET credits·ledger 페이지·잘못된 입력 400·토큰 없음 401`() = testApplication {
        app()
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/v1/credits").status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/v1/credits/ledger").status)

        val (freeId, freeToken) = client.newUser()
        val freeRes = client.get("/api/v1/credits") { header(HttpHeaders.Authorization, "Bearer $freeToken") }
        assertEquals(HttpStatusCode.OK, freeRes.status)
        assertEquals(
            buildJsonObject { put("monthly", 0); put("purchased", 0); put("total", 0); put("monthlyGrant", 0); put("nextGrantAt", JsonNull); put("monthlyExpiresAt", JsonNull) },
            json(freeRes.bodyAsText())
        )

        val (id, token) = client.newUser("pro_plus")
        val cycleNext = Instant.parse("2026-12-06T05:03:20Z")
        setCycleColumns(id, cycleNext, "pro_plus")
        TestCredits.grant(db, id, 7, BUCKET_MONTHLY)
        TestCredits.grant(db, id, 20)
        TestCredits.grant(db, id, 1)
        val sum = json(client.get("/api/v1/credits") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
        assertEquals(7, sum["monthly"]!!.jsonPrimitive.int)
        assertEquals(21, sum["purchased"]!!.jsonPrimitive.int)
        assertEquals(28, sum["total"]!!.jsonPrimitive.int)
        assertEquals(350, sum["monthlyGrant"]!!.jsonPrimitive.int)
        assertEquals(cycleNext, Instant.parse(sum["nextGrantAt"]!!.jsonPrimitive.content), "다음 충전 = credit_cycle_next_at")

        assertTrue(sum["monthlyExpiresAt"] is JsonNull, "유료 계정은 유예 아님")

        val p1 = json(client.get("/api/v1/credits/ledger?limit=2") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
        val rows1 = p1["rows"]!!.jsonArray
        assertEquals(listOf(1, 20), rows1.map { it.jsonObject["delta"]!!.jsonPrimitive.int })
        assertEquals(setOf("id", "bucket", "delta", "balanceAfter", "reason", "jobId", "createdAt"), rows1[0].jsonObject.keys, "memo·audit 비노출")
        val before = p1["next"]!!.jsonPrimitive.long
        val p2 = json(client.get("/api/v1/credits/ledger?limit=2&before=$before") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
        assertEquals(listOf(7), p2["rows"]!!.jsonArray.map { it.jsonObject["delta"]!!.jsonPrimitive.int })
        assertTrue(p2["next"] is JsonNull)

        // 남의 원장은 안 보인다
        val other = json(client.get("/api/v1/credits/ledger") { header(HttpHeaders.Authorization, "Bearer $freeToken") }.bodyAsText())
        assertEquals(0, other["rows"]!!.jsonArray.size)

        for (q in listOf("limit=0", "limit=201", "limit=x", "before=-1", "before=abc")) {
            val bad = client.get("/api/v1/credits/ledger?$q") { header(HttpHeaders.Authorization, "Bearer $token") }
            assertEquals(HttpStatusCode.BadRequest, bad.status, q)
            assertStandardError(bad.bodyAsText(), 400, "INVALID_INPUT")
        }
        TestCredits.assertInvariant(db, id)
        TestCredits.assertInvariant(db, freeId)
    }

    @Test
    fun `B2 estimate - 노트는 영상 길이, 코드 진행은 구간·속도 + 잘못된 입력`() = testApplication {
        app()
        assertEquals(HttpStatusCode.Unauthorized, client.post("/api/v1/credits/estimate").status)
        val (_, token) = client.newUser()
        suspend fun est(body: JsonObject) = client.post("/api/v1/credits/estimate") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(body.toString())
        }

        duration.durationSec = 600
        val note = est(buildJsonObject { put("kind", "note"); put("url", VIDEO); put("pace", "fast"); put("endSec", 10) })
        assertEquals(HttpStatusCode.OK, note.status, note.bodyAsText())
        assertEquals(buildJsonObject { put("estimatedCredits", 9); put("reserveCredits", 15) }, json(note.bodyAsText()), "노트는 구간·속도 무시")

        val fast = est(buildJsonObject { put("kind", "progression"); put("url", VIDEO); put("pace", "fast"); put("startSec", 60); put("endSec", 300) })
        assertEquals(buildJsonObject { put("estimatedCredits", 16); put("reserveCredits", 22) }, json(fast.bodyAsText()))

        // 구간 시작만 → 영상 길이 − 시작 (600 − 360 = 240초, 보통)
        val tail = est(buildJsonObject { put("kind", "progression"); put("url", VIDEO); put("startSec", 360) })
        assertEquals(14, json(tail.bodyAsText())["reserveCredits"]!!.jsonPrimitive.int)

        val bad = listOf(
            buildJsonObject { put("kind", "x"); put("url", VIDEO) },
            buildJsonObject { put("url", VIDEO) },
            buildJsonObject { put("kind", "note"); put("url", "https://example.com/x") },
            buildJsonObject { put("kind", "progression"); put("url", VIDEO); put("pace", "warp") },
            buildJsonObject { put("kind", "progression"); put("url", VIDEO); put("startSec", 600) },
            buildJsonObject { put("kind", "progression"); put("url", VIDEO); put("startSec", 30); put("endSec", 30) }
        )
        for (b in bad) {
            val r = est(b)
            assertEquals(HttpStatusCode.BadRequest, r.status, "$b → ${r.bodyAsText()}")
            assertStandardError(r.bodyAsText(), 400, "INVALID_INPUT")
        }
        duration.error = YoutubeDataPlaylistClient.youtubeUnavailable()
        val unavailable = est(buildJsonObject { put("kind", "note"); put("url", VIDEO) })
        assertEquals(HttpStatusCode.ServiceUnavailable, unavailable.status)
        assertStandardError(unavailable.bodyAsText(), 503, "YOUTUBE_UNAVAILABLE")
    }

    // ---------------- 크레딧 주기 (M1-3d) ----------------

    /** 2026-11-06 14:03:20 KST — 주기 키 "2026-11-06T14:03" */
    private val t0: Instant = ZonedDateTime.of(2026, 11, 6, 14, 3, 20, 0, CreditService.KST).toInstant()
    private fun at(days: Long, seconds: Long = 0): Instant = t0.plus(Duration.ofDays(days)).plusSeconds(seconds)
    private val actor = UUID(0, 1)

    private suspend fun setTier(userId: UUID, tier: String?, now: Instant, until: Instant? = null): AdminUserDto =
        AdminService(db).setTierOverride(actor, userId, tier, until?.atOffset(ZoneOffset.UTC), "주기 시험", now.atOffset(ZoneOffset.UTC))

    private fun setCycleColumns(userId: UUID, next: Instant?, tier: String?) = transaction(db) {
        ProfilesTable.update({ ProfilesTable.id eq userId }) {
            it[creditCycleNextAt] = next?.atOffset(ZoneOffset.UTC)
            it[creditCycleTier] = tier
        }
    }

    /** (다음 충전 시각, 주기 티어) */
    private fun cycle(userId: UUID): Pair<Instant?, String?> = transaction(db) {
        val row = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.single()
        row[ProfilesTable.creditCycleNextAt]?.toInstant() to row[ProfilesTable.creditCycleTier]
    }

    /** 그 시각의 실제 티어(유예 반영, M1-3e) */
    private fun tierAt(userId: UUID, now: Instant): String = transaction(db) {
        effectiveTier(ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.single(), now.atOffset(ZoneOffset.UTC))
    }

    private fun setProfileFlags(userId: UUID, share: Boolean, storage: String) = transaction(db) {
        ProfilesTable.update({ ProfilesTable.id eq userId }) {
            it[sharePracticeLog] = share
            it[storageProvider] = storage
        }
    }

    /** (학습 기록 공유, 저장소) */
    private fun profileFlags(userId: UUID): Pair<Boolean, String> = transaction(db) {
        val row = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.single()
        row[ProfilesTable.sharePracticeLog] to row[ProfilesTable.storageProvider]
    }

    /** 월 지급 버킷의 주기 행 (reason, period, delta) */
    private fun cycleRows(userId: UUID): List<Triple<String, String?, Int>> = transaction(db) {
        CreditLedgerTable.selectAll().where { CreditLedgerTable.userId eq userId }.orderBy(CreditLedgerTable.id)
            .filter { it[CreditLedgerTable.reason].startsWith("monthly_") }
            .map { Triple(it[CreditLedgerTable.reason], it[CreditLedgerTable.period], it[CreditLedgerTable.delta]) }
    }

    @Test
    fun `C1 monthly-credits - OIDC 없으면 401, 주기 없는 유료 계정은 그 실행 시각에 주기 시작, 다시 돌려도 한 번`() = testApplication {
        app()
        assertEquals(HttpStatusCode.Unauthorized, client.post("/internal/cron/monthly-credits").status)
        val bad = client.post("/internal/cron/monthly-credits") { header(HttpHeaders.Authorization, "Bearer ${TestCronJwt.token(aud = "https://wrong")}") }
        assertEquals(HttpStatusCode.Unauthorized, bad.status)

        // DB로 바로 유료가 된 계정(V7 배포 시점 유료 계정과 같은 상태 — 주기 없음)
        val (freeId, _) = client.newUser()
        val (proId, proToken) = client.newUser("pro")
        val (plusId, _) = client.newUser("pro_plus")
        TestCredits.grant(db, proId, 3) // 구매분은 소멸·지급과 무관

        val before = Instant.now()
        val r1 = client.post("/internal/cron/monthly-credits") { header(HttpHeaders.Authorization, "Bearer ${TestCronJwt.token()}") }
        assertEquals(HttpStatusCode.OK, r1.status, r1.bodyAsText())
        val body1 = json(r1.bodyAsText())
        assertTrue(Regex("""\d{4}-\d{2}-\d{2}T\d{2}:\d{2}""").matches(body1["period"]!!.jsonPrimitive.content), "period = 실행 시각 키")
        assertEquals(listOf(2, 0, 2), listOf("users", "expired", "granted").map { body1[it]!!.jsonPrimitive.int }, "무료 계정은 대상 아님")
        assertEquals(0 to 0, TestCredits.balances(db, freeId))
        assertEquals(170 to 3, TestCredits.balances(db, proId))
        assertEquals(350 to 0, TestCredits.balances(db, plusId))
        val (proNext, proTier) = cycle(proId)
        assertEquals("pro", proTier)
        assertTrue(!proNext!!.isBefore(before.plus(CREDIT_CYCLE).minusSeconds(1)) && !proNext.isAfter(Instant.now().plus(CREDIT_CYCLE)), "다음 = 실행 시각 + 30일")
        val sum = json(client.get("/api/v1/credits") { header(HttpHeaders.Authorization, "Bearer $proToken") }.bodyAsText())
        assertEquals(proNext, Instant.parse(sum["nextGrantAt"]!!.jsonPrimitive.content))

        val r2 = client.post("/internal/cron/monthly-credits") { header(HttpHeaders.Authorization, "Bearer ${TestCronJwt.token()}") }
        assertEquals(listOf(0, 0, 0), listOf("users", "expired", "granted").map { json(r2.bodyAsText())[it]!!.jsonPrimitive.int })
        assertEquals(170 to 3, TestCredits.balances(db, proId))
        transaction(db) {
            assertEquals(2, CreditLedgerTable.selectAll().where { CreditLedgerTable.reason eq "monthly_grant" }.count())
        }
        listOf(freeId, proId, plusId).forEach { TestCredits.assertInvariant(db, it) }
    }

    @Test
    fun `C2 유료 전환 즉시 지급 - 30일 경계 전 그대로, 30일에 소멸 후 충전, 재실행 중복 없음, cron이 늦어도 경계 그대로`() = testApplication {
        app()
        val (id, _) = client.newUser()
        val service = CreditService(db, duration)

        val dto = setTier(id, "pro", t0)
        assertEquals(170, dto.credits.monthly, "전환 즉시 지급")
        assertEquals(at(30) to "pro", cycle(id))
        TestCredits.grant(db, id, 40)              // 구매분
        TestCredits.grant(db, id, -20, BUCKET_MONTHLY) // 쓴 셈(150 남음)

        // 29일 23:59:59 — 아직 주기 안
        assertEquals(MonthlyCreditsResult(cycleKey(at(30, -1)), 0, 0, 0), service.runMonthlyGrant(at(30, -1)))
        assertEquals(150 to 40, TestCredits.balances(db, id))

        // 정확히 30일 = 720시간
        assertEquals(MonthlyCreditsResult(cycleKey(at(30)), 1, 1, 1), service.runMonthlyGrant(at(30)))
        assertEquals(170 to 40, TestCredits.balances(db, id))
        assertEquals(at(60) to "pro", cycle(id))
        assertEquals(MonthlyCreditsResult(cycleKey(at(30, 3600)), 0, 0, 0), service.runMonthlyGrant(at(30, 3600)), "재실행")

        // cron이 5시간 늦어도 다음 경계는 t0 + 90일(밀림 없음)
        assertEquals(MonthlyCreditsResult(cycleKey(at(60, 5 * 3600)), 1, 1, 1), service.runMonthlyGrant(at(60, 5 * 3600)))
        assertEquals(at(90) to "pro", cycle(id))

        assertEquals(
            listOf(
                Triple("monthly_grant", "2026-11-06T14:03", 170),
                Triple("monthly_expire", "2026-11-06T14:03", -150),
                Triple("monthly_grant", "2026-12-06T14:03", 170),
                Triple("monthly_expire", "2026-12-06T14:03", -170),
                Triple("monthly_grant", "2027-01-05T14:03", 170)
            ),
            cycleRows(id)
        )
        assertEquals(170 to 40, TestCredits.balances(db, id))
        TestCredits.assertInvariant(db, id)
    }

    @Test
    fun `C3 Pro → Pro+ 차액만 즉시·주기 유지, 내렸다 다시 올려도 한 번, 충전 시각 지난 뒤 업그레이드는 충전 먼저`() = testApplication {
        app()
        val (id, _) = client.newUser()
        val service = CreditService(db, duration)
        setTier(id, "pro", t0)
        TestCredits.grant(db, id, -100, BUCKET_MONTHLY) // 70 남음

        assertEquals(250, setTier(id, "pro_plus", at(10)).credits.monthly, "70 + 차액 180")
        assertEquals(at(30) to "pro_plus", cycle(id), "주기 그대로")
        assertEquals(250, setTier(id, "pro", at(11)).credits.monthly, "내려도 회수 없음")
        assertEquals(at(30) to "pro_plus", cycle(id), "주기 티어는 높은 쪽을 기억")
        assertEquals(250, setTier(id, "pro_plus", at(12)).credits.monthly, "같은 주기에 차액은 한 번")

        // 29일에 Pro로 내리고, 30일 10분(충전 시각이 지났지만 cron은 아직)에 다시 Pro+
        setTier(id, "pro", at(29))
        val up = setTier(id, "pro_plus", at(30, 600))
        // 바꾸기 전 티어(pro)로 30일 충전(소멸 250 → 170) → 그 주기에서 차액 180
        assertEquals(350, up.credits.monthly)
        assertEquals(at(60) to "pro_plus", cycle(id))
        assertEquals(MonthlyCreditsResult(cycleKey(at(30, 3600)), 0, 0, 0), service.runMonthlyGrant(at(30, 3600)))

        assertEquals(
            listOf(
                Triple("monthly_grant", "2026-11-06T14:03", 170),
                Triple("monthly_topup", "2026-11-06T14:03", 180),
                Triple("monthly_expire", "2026-11-06T14:03", -250),
                Triple("monthly_grant", "2026-12-06T14:03", 170),
                Triple("monthly_topup", "2026-12-06T14:03", 180)
            ),
            cycleRows(id)
        )
        // 무료 → Pro+ 는 바로 350
        val (direct, _) = client.newUser()
        assertEquals(350, setTier(direct, "pro_plus", t0).credits.monthly)
        TestCredits.assertInvariant(db, id)
        TestCredits.assertInvariant(db, direct)
    }

    @Test
    fun `C4 유료 → 무료 - 주기 끝까지 유료와 같게(유예), 끝에 소멸·충전 없음·주기 종료·다운그레이드 정리, override 기한 만료도 같다`() = testApplication {
        app()
        val (id, _) = client.newUser()
        val service = CreditService(db, duration)
        setTier(id, "pro", t0)
        TestCredits.grant(db, id, 40)
        setProfileFlags(id, share = true, storage = "drive")

        val down = setTier(id, null, at(5))
        assertEquals(170, down.credits.monthly, "전환 때 소멸하지 않는다")
        assertEquals(at(30) to "pro", cycle(id))
        assertEquals("pro", tierAt(id, at(5)), "유예 — 주기 끝까지 실제 티어 pro")
        assertEquals("pro", tierAt(id, at(30, -1)))
        assertEquals("free", tierAt(id, at(30)), "충전 시각부터 무료(cron 전이어도)")
        assertEquals(true to "drive", profileFlags(id), "다운그레이드 정리는 주기 끝으로 미룬다")

        assertEquals(MonthlyCreditsResult(cycleKey(at(30, -1)), 0, 0, 0), service.runMonthlyGrant(at(30, -1)))
        assertEquals(170 to 40, TestCredits.balances(db, id))
        assertEquals(MonthlyCreditsResult(cycleKey(at(30)), 1, 1, 0), service.runMonthlyGrant(at(30)))
        assertEquals(0 to 40, TestCredits.balances(db, id), "구매분은 남는다")
        assertEquals(null to null, cycle(id), "주기 종료")
        assertEquals(false to "supabase", profileFlags(id), "주기 끝에 다운그레이드 정리")
        assertEquals(MonthlyCreditsResult(cycleKey(at(30, 3600)), 0, 0, 0), service.runMonthlyGrant(at(30, 3600)), "무료·주기 없음은 대상 아님")
        assertEquals(
            listOf(Triple("monthly_grant", "2026-11-06T14:03", 170), Triple("monthly_expire", "2026-11-06T14:03", -170)),
            cycleRows(id)
        )

        // override 기한(10일)이 지나고 tier-expire cron이 아직이어도 충전 시각의 실제 티어(free)로 판정
        val (temp, _) = client.newUser()
        setTier(temp, "pro_plus", t0, until = at(10))
        assertEquals(MonthlyCreditsResult(cycleKey(at(30)), 1, 1, 0), service.runMonthlyGrant(at(30)))
        assertEquals(0 to 0, TestCredits.balances(db, temp))
        assertEquals(null to null, cycle(temp))
        TestCredits.assertInvariant(db, id)
        TestCredits.assertInvariant(db, temp)
    }

    @Test
    fun `C5 유예 중 재가입은 주기를 잇고 추가 지급 없음, 주기 끝난 뒤 재가입은 새 주기, 같은 분 재가입도 추가 지급 없음`() = testApplication {
        app()
        val (id, _) = client.newUser()
        val service = CreditService(db, duration)
        setTier(id, "pro", t0)
        TestCredits.grant(db, id, -30, BUCKET_MONTHLY) // 140 남음
        setTier(id, null, at(5))
        val again = setTier(id, "pro", at(10))
        assertEquals(140, again.credits.monthly, "유예 중 재가입 = 해지 취소 — 남은 140 그대로")
        assertEquals(at(30) to "pro", cycle(id), "충전 시각도 그대로")
        assertEquals(MonthlyCreditsResult(cycleKey(at(30)), 1, 1, 1), service.runMonthlyGrant(at(30)), "30일에 평소처럼 소멸 후 충전")
        assertEquals(at(60) to "pro", cycle(id))
        assertEquals(
            listOf(
                Triple("monthly_grant", "2026-11-06T14:03", 170),
                Triple("monthly_expire", "2026-11-06T14:03", -140),
                Triple("monthly_grant", "2026-12-06T14:03", 170)
            ),
            cycleRows(id)
        )

        // 주기가 끝난 뒤(무료) 재가입은 그 시각에 새 주기
        val (late, _) = client.newUser()
        setTier(late, "pro", t0)
        setTier(late, null, at(5))
        assertEquals(MonthlyCreditsResult(cycleKey(at(30, 60)), 1, 1, 0), service.runMonthlyGrant(at(30, 60)), "소멸만")
        assertEquals(null to null, cycle(late))
        assertEquals(170, setTier(late, "pro", at(35)).credits.monthly)
        assertEquals(at(65) to "pro", cycle(late))
        TestCredits.assertInvariant(db, late)

        // 같은 분(14:03:20 → :30 → :40) 해지·재가입 — 지급 키가 같으므로 새로 주지 않는다
        val (same, _) = client.newUser()
        setTier(same, "pro", t0)
        setTier(same, null, t0.plusSeconds(10))
        assertEquals(170, setTier(same, "pro", t0.plusSeconds(20)).credits.monthly)
        assertEquals(at(30) to "pro", cycle(same))
        assertEquals(1, cycleRows(same).size)
        TestCredits.assertInvariant(db, id)
        TestCredits.assertInvariant(db, same)
    }

    @Test
    fun `C6 관리 API로 pro 지정하면 응답에 즉시 지급, credits nextGrantAt = 지금 + 30일`() = testApplication {
        app()
        val (ownerId, ownerToken) = client.newUser()
        TestTier.setRole(db, ownerId, "owner")
        val (id, token) = client.newUser()
        val before = Instant.now()
        val res = client.put("/api/v1/admin/users/$id/tier-override") {
            header(HttpHeaders.Authorization, "Bearer $ownerToken")
            contentType(ContentType.Application.Json)
            setBody("""{"tier":"pro","reason":"주기 시험"}""")
        }
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        assertEquals(buildJsonObject { put("monthly", 170); put("purchased", 0) }, json(res.bodyAsText())["credits"])
        val sum = json(client.get("/api/v1/credits") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
        val next = Instant.parse(sum["nextGrantAt"]!!.jsonPrimitive.content)
        assertTrue(!next.isBefore(before.plus(CREDIT_CYCLE).minusSeconds(1)) && !next.isAfter(Instant.now().plus(CREDIT_CYCLE)))
        assertEquals(170, sum["monthlyGrant"]!!.jsonPrimitive.int)

        // 잘못된 입력은 지급 없이 400
        val bad = client.put("/api/v1/admin/users/$ownerId/tier-override") {
            header(HttpHeaders.Authorization, "Bearer $ownerToken")
            contentType(ContentType.Application.Json)
            setBody("""{"tier":"gold","reason":"x"}""")
        }
        assertEquals(HttpStatusCode.BadRequest, bad.status)
        assertEquals(0 to 0, TestCredits.balances(db, ownerId))
        TestCredits.assertInvariant(db, id)
    }

    @Test
    fun `C7 유예(M1-3e) - 무료로 내려도 주기 끝까지 me tier pro·AI 분석 가능, credits monthlyExpiresAt, 끝나면 403`() = testApplication {
        app()
        val (ownerId, ownerToken) = client.newUser()
        TestTier.setRole(db, ownerId, "owner")
        val (id, token) = client.newUser()
        suspend fun override(tier: String?) = client.put("/api/v1/admin/users/$id/tier-override") {
            header(HttpHeaders.Authorization, "Bearer $ownerToken")
            contentType(ContentType.Application.Json)
            setBody(if (tier == null) """{"tier":null,"reason":"유예 시험"}""" else """{"tier":"$tier","reason":"유예 시험"}""")
        }
        assertEquals(HttpStatusCode.OK, override("pro").status)
        val down = override(null)
        assertEquals(HttpStatusCode.OK, down.status, down.bodyAsText())
        assertEquals("pro", json(down.bodyAsText())["tier"]!!.jsonPrimitive.content, "관리 응답도 실제 티어 pro")
        val (next, cycleTier) = cycle(id)
        assertEquals("pro", cycleTier)

        val me = json(client.get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
        assertEquals("pro", me["tier"]!!.jsonPrimitive.content)
        assertEquals(true, me["limits"]!!.jsonObject["ai"]!!.jsonPrimitive.boolean)
        val sum = json(client.get("/api/v1/credits") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
        assertEquals(0, sum["monthlyGrant"]!!.jsonPrimitive.int, "다음 충전 없음")
        assertTrue(sum["nextGrantAt"] is JsonNull)
        assertEquals(next, Instant.parse(sum["monthlyExpiresAt"]!!.jsonPrimitive.content))
        assertEquals(HttpStatusCode.Accepted, client.analyzeNote(token).status, "유예 중 AI 분석 가능")

        // 충전 시각이 지나면(cron 전이어도) 무료 — 403, monthlyExpiresAt 없음
        setCycleColumns(id, Instant.now().minusSeconds(1), "pro")
        val after = client.analyzeNote(token)
        assertEquals(HttpStatusCode.Forbidden, after.status)
        assertStandardError(after.bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        val sum2 = json(client.get("/api/v1/credits") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
        assertTrue(sum2["monthlyExpiresAt"] is JsonNull)
        CreditService(db, duration).runMonthlyGrant()
        assertEquals(0, TestCredits.balances(db, id).first, "cron이 남은 월 지급분 소멸")
        assertEquals(null to null, cycle(id))
        TestCredits.assertInvariant(db, id)
    }
}
