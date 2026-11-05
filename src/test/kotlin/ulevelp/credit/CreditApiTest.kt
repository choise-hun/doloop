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
import java.time.Instant
import java.time.YearMonth
import java.util.UUID
import kotlin.test.*

/**
 * M1-3b — 크레딧 서버: 무료 403·사전 402, 예약→정산·실패 반환, `/credits*`, 월 지급 cron
 * (개발산출물/결과/M1-1_스키마설계.md §3·§5-4·§5-6, 결과/M1-3a_크레딧수치.md §6). 테스트마다 "원장 합계 = 잔액"
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
            buildJsonObject { put("monthly", 0); put("purchased", 0); put("total", 0); put("monthlyGrant", 0); put("nextGrantAt", JsonNull) },
            json(freeRes.bodyAsText())
        )

        val (id, token) = client.newUser("pro_plus")
        TestCredits.grant(db, id, 7, BUCKET_MONTHLY)
        TestCredits.grant(db, id, 20)
        TestCredits.grant(db, id, 1)
        val sum = json(client.get("/api/v1/credits") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
        assertEquals(7, sum["monthly"]!!.jsonPrimitive.int)
        assertEquals(21, sum["purchased"]!!.jsonPrimitive.int)
        assertEquals(28, sum["total"]!!.jsonPrimitive.int)
        assertEquals(350, sum["monthlyGrant"]!!.jsonPrimitive.int)
        val next = Instant.parse(sum["nextGrantAt"]!!.jsonPrimitive.content)
        val expectedNext = YearMonth.now(CreditService.KST).plusMonths(1).atDay(1).atStartOfDay(CreditService.KST).toInstant()
        assertEquals(expectedNext, next, "다음 달 1일 0시 KST")

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

    // ---------------- 월 지급 cron ----------------

    @Test
    fun `C1 monthly-credits - OIDC 없으면 401, 유료만 지급, 다시 돌려도 한 번`() = testApplication {
        app()
        assertEquals(HttpStatusCode.Unauthorized, client.post("/internal/cron/monthly-credits").status)
        val bad = client.post("/internal/cron/monthly-credits") { header(HttpHeaders.Authorization, "Bearer ${TestCronJwt.token(aud = "https://wrong")}") }
        assertEquals(HttpStatusCode.Unauthorized, bad.status)

        val (freeId, _) = client.newUser()
        val (proId, _) = client.newUser("pro")
        val (plusId, _) = client.newUser("pro_plus")
        TestCredits.grant(db, proId, 3) // 구매분은 소멸·지급과 무관

        val r1 = client.post("/internal/cron/monthly-credits") { header(HttpHeaders.Authorization, "Bearer ${TestCronJwt.token()}") }
        assertEquals(HttpStatusCode.OK, r1.status, r1.bodyAsText())
        val period = CreditService.period(YearMonth.now(CreditService.KST))
        assertEquals(buildJsonObject { put("period", period); put("users", 3); put("expired", 0); put("granted", 2) }, json(r1.bodyAsText()))
        assertEquals(0 to 0, TestCredits.balances(db, freeId))
        assertEquals(170 to 3, TestCredits.balances(db, proId))
        assertEquals(350 to 0, TestCredits.balances(db, plusId))

        val r2 = client.post("/internal/cron/monthly-credits") { header(HttpHeaders.Authorization, "Bearer ${TestCronJwt.token()}") }
        assertEquals(buildJsonObject { put("period", period); put("users", 3); put("expired", 0); put("granted", 0) }, json(r2.bodyAsText()))
        assertEquals(170 to 3, TestCredits.balances(db, proId))
        transaction(db) {
            assertEquals(2, CreditLedgerTable.selectAll().where { CreditLedgerTable.reason eq "monthly_grant" }.count())
        }
        listOf(freeId, proId, plusId).forEach { TestCredits.assertInvariant(db, it) }
    }

    @Test
    fun `C2 다음 달 - 남은 월 지급분 소멸 후 지급, 무료가 된 계정은 소멸만, 재시도 중복 없음`() = testApplication {
        app()
        val (proId, _) = client.newUser("pro")
        val (downId, _) = client.newUser("pro")
        val service = CreditService(db, duration)
        val nov = YearMonth.of(2026, 11)
        val novStart = nov.atDay(1).atStartOfDay(CreditService.KST).toInstant()
        val decStart = nov.plusMonths(1).atDay(1).atStartOfDay(CreditService.KST).toInstant()

        assertEquals(MonthlyCreditsResult("2026-11", 2, 0, 2), service.runMonthlyGrant(novStart))
        TestCredits.grant(db, proId, 40) // 구매분
        TestTier.set(db, downId, null)   // 다운그레이드 → 다음 지급 없음

        // 30일 23:59:59 KST는 아직 11월 → 중복 없음
        assertEquals(MonthlyCreditsResult("2026-11", 2, 0, 0), service.runMonthlyGrant(decStart.minusSeconds(1)))

        val dec = service.runMonthlyGrant(decStart)
        assertEquals(MonthlyCreditsResult("2026-12", 2, 2, 1), dec)
        assertEquals(170 to 40, TestCredits.balances(db, proId))
        assertEquals(0 to 0, TestCredits.balances(db, downId))
        assertEquals(MonthlyCreditsResult("2026-12", 2, 0, 0), service.runMonthlyGrant(decStart.plusSeconds(3600)))

        transaction(db) {
            val rows = CreditLedgerTable.selectAll().where { CreditLedgerTable.userId eq proId }.orderBy(CreditLedgerTable.id).map {
                Triple(it[CreditLedgerTable.reason], it[CreditLedgerTable.period], it[CreditLedgerTable.delta])
            }
            assertEquals(
                listOf(
                    Triple("monthly_grant", "2026-11", 170),
                    Triple("admin_adjust", null, 40),
                    Triple("monthly_expire", "2026-11", -170),
                    Triple("monthly_grant", "2026-12", 170)
                ),
                rows
            )
        }
        TestCredits.assertInvariant(db, proId)
        TestCredits.assertInvariant(db, downId)
    }
}
