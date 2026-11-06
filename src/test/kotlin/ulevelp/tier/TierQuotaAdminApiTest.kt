package ulevelp.tier

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.sum
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.processDueCycle
import ulevelp.support.*
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.test.*

/**
 * M1-2a — 티어 쿼터(곡·분류·녹음·Drive), owner 관리 API, tier-expire cron
 * (개발산출물/결과/M1-1_스키마설계.md §1·§5-1·§5-2·§6)
 */
class TierQuotaAdminApiTest {

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
    }

    private lateinit var fake: FakeStorageClient

    @BeforeEach
    fun clean() {
        fake = FakeStorageClient()
        transaction(db) {
            StorageTrashTable.deleteAll()
            AdminAuditTable.deleteAll()
            UsersTable.deleteAll()
        }
    }

    private fun json(res: String): JsonObject = Json.parseToJsonElement(res).jsonObject

    private suspend fun HttpClient.me(token: String): JsonObject {
        val res = get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }
        assertEquals(HttpStatusCode.OK, res.status)
        return json(res.bodyAsText())
    }

    private suspend fun HttpClient.newUser(tier: String? = null, email: String = "u${UUID.randomUUID()}@example.com"): Pair<UUID, String> {
        val id = UUID.randomUUID()
        val token = TestJwt.token(id, email = email)
        me(token)
        if (tier != null) TestTier.set(db, id, tier)
        return id to token
    }

    private fun videoId(i: Int) = "vid" + i.toString().padStart(8, '0')

    private suspend fun HttpClient.addSong(token: String, vid: String, extra: String = ""): HttpResponse =
        post("/api/v1/songs") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("""{"videoId":"$vid","title":"T"$extra}""")
        }

    private suspend fun HttpClient.songId(token: String, vid: String): String {
        val res = addSong(token, vid)
        assertTrue(res.status == HttpStatusCode.Created || res.status == HttpStatusCode.OK, res.bodyAsText())
        return json(res.bodyAsText())["song"]!!.jsonObject["id"]!!.jsonPrimitive.content
    }

    private suspend fun HttpClient.addCategory(token: String, name: String): HttpResponse =
        post("/api/v1/categories") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("""{"name":"$name"}""")
        }

    private suspend fun HttpClient.uploadTake(token: String, songId: String, bytes: Int, durationSec: Int = 18): HttpResponse =
        post("/api/v1/takes") {
            header(HttpHeaders.Authorization, "Bearer $token")
            val meta = buildJsonObject {
                put("songId", songId)
                put("date", LocalDate.now(ZoneOffset.UTC).toString())
                put("recordedAt", DateTimeFormatter.ISO_INSTANT.format(OffsetDateTime.now(ZoneOffset.UTC).toInstant()))
                put("durationSec", durationSec)
                put("mime", "audio/mp4")
            }
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append("metadata", meta.toString(), Headers.build { append(HttpHeaders.ContentType, "application/json") })
                        append("file", ByteArray(bytes) { 1 }, Headers.build {
                            append(HttpHeaders.ContentType, "audio/mp4")
                            append(HttpHeaders.ContentDisposition, "filename=\"take.m4a\"")
                        })
                    }
                )
            )
        }

    private fun detailOf(body: String): JsonObject = json(body)["detail"]!!.jsonObject

    private fun assertLedgerMatchesBalance(userId: UUID) = transaction(db) {
        val profile = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.single()
        for ((bucket, col) in listOf("monthly" to ProfilesTable.monthlyCredits, "purchased" to ProfilesTable.purchasedCredits)) {
            val sumExpr = CreditLedgerTable.delta.sum()
            val sum = CreditLedgerTable.select(sumExpr)
                .where { (CreditLedgerTable.userId eq userId) and (CreditLedgerTable.bucket eq bucket) }
                .singleOrNull()?.get(sumExpr) ?: 0
            assertEquals(profile[col], sum, "원장 합계 = 잔액 ($bucket)")
        }
    }

    // ---------------------------------------------------------------- /me

    @Test
    fun `Q1 me 응답 - 무료 기본 티어·한도·사용량·크레딧`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, token) = client.newUser()
        client.songId(token, videoId(1))
        client.addCategory(token, "A")

        val me = client.me(token)
        assertEquals("free", me["tier"]!!.jsonPrimitive.content)
        assertEquals("free", me["billingTier"]!!.jsonPrimitive.content)
        assertTrue(me["tierOverrideUntil"] is JsonNull)
        assertEquals(5_242_880L, me["takeQuotaBytes"]!!.jsonPrimitive.long)
        val limits = me["limits"]!!.jsonObject
        assertEquals(10, limits["songs"]!!.jsonPrimitive.int)
        assertEquals(2, limits["categories"]!!.jsonPrimitive.int)
        assertEquals(2, limits["takeSongs"]!!.jsonPrimitive.int)
        assertEquals(120, limits["takeDurationSec"]!!.jsonPrimitive.int)
        assertEquals(false, limits["drive"]!!.jsonPrimitive.boolean)
        assertEquals(false, limits["ai"]!!.jsonPrimitive.boolean)
        val usage = me["usage"]!!.jsonObject
        assertEquals(1, usage["songs"]!!.jsonPrimitive.int)
        assertEquals(1, usage["categories"]!!.jsonPrimitive.int)
        assertEquals(0, usage["takeBytes"]!!.jsonPrimitive.int)
        assertEquals(buildJsonObject { put("monthly", 0); put("purchased", 0) }, me["credits"])
        assertEquals(false, me["isCreator"]!!.jsonPrimitive.boolean)
        assertTrue(me["locale"] is JsonNull)

        // pro_plus: 제한 없는 항목은 null
        val (_, tokenP) = client.newUser("pro_plus")
        val meP = client.me(tokenP)
        assertEquals("pro_plus", meP["tier"]!!.jsonPrimitive.content)
        assertEquals("free", meP["billingTier"]!!.jsonPrimitive.content)
        assertEquals(150, meP["limits"]!!.jsonObject["songs"]!!.jsonPrimitive.int)
        assertTrue(meP["limits"]!!.jsonObject["takeSongs"] is JsonNull)
        assertEquals(209_715_200L, meP["takeQuotaBytes"]!!.jsonPrimitive.long)
    }

    // ---------------------------------------------------------------- 곡

    @Test
    fun `Q2 곡 한도 - 무료 10곡, 11번째 403·detail, 같은 영상은 한도 안 씀, pro는 통과`() = testApplication {
        configureApiTestApp(dbConfig)
        val (_, token) = client.newUser()
        for (i in 1..10) assertEquals(HttpStatusCode.Created, client.addSong(token, videoId(i)).status)

        val over = client.addSong(token, videoId(11))
        assertEquals(HttpStatusCode.Forbidden, over.status)
        val body = over.bodyAsText()
        assertStandardError(body, 403, "SONG_LIMIT_EXCEEDED")
        assertEquals(
            buildJsonObject { put("limit", 10); put("used", 10); put("tier", "free"); put("nextTier", "pro"); put("nextLimit", 100) },
            detailOf(body)
        )
        // 이미 있는 영상 = 업서트(200), 한도를 쓰지 않는다
        assertEquals(HttpStatusCode.OK, client.addSong(token, videoId(3)).status)

        // pro: 11번째 통과
        val (_, tokenPro) = client.newUser("pro")
        for (i in 1..11) assertEquals(HttpStatusCode.Created, client.addSong(tokenPro, videoId(i)).status)
    }

    @Test
    fun `Q3 곡 a·b 입력(A6) - 저장, a≥b 400`() = testApplication {
        configureApiTestApp(dbConfig)
        val (_, token) = client.newUser()
        val res = client.addSong(token, videoId(1), ""","a":12.3,"b":45.6""")
        assertEquals(HttpStatusCode.Created, res.status)
        val song = json(res.bodyAsText())["song"]!!.jsonObject
        assertEquals(12.3, song["a"]!!.jsonPrimitive.double)
        assertEquals(45.6, song["b"]!!.jsonPrimitive.double)

        val bad = client.addSong(token, videoId(2), ""","a":50,"b":40""")
        assertEquals(HttpStatusCode.BadRequest, bad.status)
        assertStandardError(bad.bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `Q4 migrate-local - 남은 칸보다 많으면 통째 403, 부분 등록 없음`() = testApplication {
        configureApiTestApp(dbConfig)
        val (userId, token) = client.newUser()
        for (i in 1..9) client.songId(token, videoId(i))

        val items = buildJsonArray {
            for (i in 20..21) addJsonObject { put("videoId", videoId(i)); put("rate", 1.0) }
        }
        val res = client.post("/api/v1/songs/migrate-local") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("items", items); put("markMigrated", true) }.toString())
        }
        assertEquals(HttpStatusCode.Forbidden, res.status)
        assertStandardError(res.bodyAsText(), 403, "SONG_LIMIT_EXCEEDED")
        transaction(db) {
            assertEquals(9, SongsTable.selectAll().where { SongsTable.userId eq userId }.count())
            assertNull(ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.single()[ProfilesTable.migratedLocalAt])
        }

        // 한 곡만이면 통과
        val ok = client.post("/api/v1/songs/migrate-local") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("""{"items":[{"videoId":"${videoId(20)}","rate":1.0}]}""")
        }
        assertEquals(HttpStatusCode.OK, ok.status)
        assertEquals(1, json(ok.bodyAsText())["created"]!!.jsonPrimitive.int)
    }

    // ---------------------------------------------------------------- 분류

    @Test
    fun `Q5 분류 한도 - 무료 2개 403·업그레이드 안내, pro_plus 맨 위는 nextTier null`() = testApplication {
        configureApiTestApp(dbConfig)
        val (_, token) = client.newUser()
        assertEquals(HttpStatusCode.Created, client.addCategory(token, "A").status)
        assertEquals(HttpStatusCode.Created, client.addCategory(token, "B").status)
        val over = client.addCategory(token, "C")
        assertEquals(HttpStatusCode.Forbidden, over.status)
        assertStandardError(over.bodyAsText(), 403, "CATEGORY_LIMIT_EXCEEDED")
        val d = detailOf(over.bodyAsText())
        assertEquals("pro", d["nextTier"]!!.jsonPrimitive.content)
        assertEquals(7, d["nextLimit"]!!.jsonPrimitive.int)

        val (_, tokenTop) = client.newUser("pro_plus")
        for (i in 1..10) assertEquals(HttpStatusCode.Created, client.addCategory(tokenTop, "C$i").status)
        val top = client.addCategory(tokenTop, "C11")
        assertEquals(HttpStatusCode.Forbidden, top.status)
        val dTop = detailOf(top.bodyAsText())
        assertEquals(10, dTop["limit"]!!.jsonPrimitive.int)
        assertTrue(dTop["nextTier"] is JsonNull)
        assertTrue(dTop["nextLimit"] is JsonNull)
    }

    // ---------------------------------------------------------------- 녹음·Drive

    @Test
    fun `Q6 무료 녹음 - 2곡까지, 3번째 곡 403, 2분 초과 403, 5MB 초과 413`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, token) = client.newUser()
        val s1 = client.songId(token, videoId(1))
        val s2 = client.songId(token, videoId(2))
        val s3 = client.songId(token, videoId(3))

        assertEquals(HttpStatusCode.Created, client.uploadTake(token, s1, 1000).status)
        assertEquals(HttpStatusCode.Created, client.uploadTake(token, s2, 1000).status) // 옛 SINGLE_SONG_TAKE_LIMIT 없음(A1)
        assertEquals(HttpStatusCode.Created, client.uploadTake(token, s1, 1000).status) // 같은 곡 추가는 곡 수를 안 늘림

        val third = client.uploadTake(token, s3, 1000)
        assertEquals(HttpStatusCode.Forbidden, third.status)
        assertStandardError(third.bodyAsText(), 403, "FREE_TAKE_SONG_LIMIT_EXCEEDED")
        assertEquals(2, detailOf(third.bodyAsText())["used"]!!.jsonPrimitive.int)

        val long = client.uploadTake(token, s1, 1000, durationSec = 121)
        assertEquals(HttpStatusCode.Forbidden, long.status)
        assertStandardError(long.bodyAsText(), 403, "TAKE_DURATION_LIMIT_EXCEEDED")
        assertEquals(HttpStatusCode.Created, client.uploadTake(token, s1, 1000, durationSec = 120).status)

        val big = client.uploadTake(token, s1, 5_242_880)
        assertEquals(HttpStatusCode.PayloadTooLarge, big.status)
        assertStandardError(big.bodyAsText(), 413, "TAKE_QUOTA_EXCEEDED")
        assertEquals(5_242_880L, detailOf(big.bodyAsText())["limitBytes"]!!.jsonPrimitive.long)
        assertEquals(4, fake.objects.size, "막힌 업로드는 저장소에 남지 않는다")

        // pro: 곡 수·길이 제한 없음
        val (_, tokenPro) = client.newUser("pro")
        for (i in 1..3) {
            val s = client.songId(tokenPro, videoId(i))
            assertEquals(HttpStatusCode.Created, client.uploadTake(tokenPro, s, 1000, durationSec = 600).status)
        }
    }

    @Test
    fun `Q7 Drive - 무료 PATCH me·Drive 등록 403 TIER_UPGRADE_REQUIRED, pro 200`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, token) = client.newUser()
        val patch = client.patch("/api/v1/me") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("""{"storageProvider":"drive"}""")
        }
        assertEquals(HttpStatusCode.Forbidden, patch.status)
        assertStandardError(patch.bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertEquals("drive", detailOf(patch.bodyAsText())["feature"]!!.jsonPrimitive.content)

        val s1 = client.songId(token, videoId(1))
        val reg = client.post("/api/v1/takes") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("songId", s1); put("date", LocalDate.now(ZoneOffset.UTC).toString())
                    put("recordedAt", DateTimeFormatter.ISO_INSTANT.format(OffsetDateTime.now(ZoneOffset.UTC).toInstant()))
                    put("durationSec", 15); put("mime", "audio/mp4"); put("sizeBytes", 1000)
                    put("storage", "drive"); put("storageKey", "drive_file_12345")
                }.toString()
            )
        }
        assertEquals(HttpStatusCode.Forbidden, reg.status)
        assertStandardError(reg.bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")

        val (_, tokenPro) = client.newUser("pro")
        val ok = client.patch("/api/v1/me") {
            header(HttpHeaders.Authorization, "Bearer $tokenPro")
            contentType(ContentType.Application.Json)
            setBody("""{"storageProvider":"drive"}""")
        }
        assertEquals(HttpStatusCode.OK, ok.status)
        assertEquals("drive", json(ok.bodyAsText())["storageProvider"]!!.jsonPrimitive.content)
    }

    // ---------------------------------------------------------------- 관리 API

    @Test
    fun `A1 관리 API 권한 - 토큰 없음 401, 일반 403, owner 200`() = testApplication {
        configureApiTestApp(dbConfig)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/v1/admin/users?email=a@b.c").status)

        val (_, userToken) = client.newUser()
        val forbidden = client.get("/api/v1/admin/users?email=a@b.c") { header(HttpHeaders.Authorization, "Bearer $userToken") }
        assertEquals(HttpStatusCode.Forbidden, forbidden.status)
        assertStandardError(forbidden.bodyAsText(), 403, "FORBIDDEN")

        val (ownerId, ownerToken) = client.newUser()
        TestTier.setRole(db, ownerId, "owner")
        val (targetId, _) = client.newUser(email = "Target@Example.com")
        val ok = client.get("/api/v1/admin/users?email=target@example.com") { header(HttpHeaders.Authorization, "Bearer $ownerToken") }
        assertEquals(HttpStatusCode.OK, ok.status)
        assertEquals("no-store", ok.headers[HttpHeaders.CacheControl])
        val users = json(ok.bodyAsText())["users"]!!.jsonArray
        assertEquals(listOf(targetId.toString()), users.map { it.jsonObject["id"]!!.jsonPrimitive.content })

        // email 없음 400
        val noEmail = client.get("/api/v1/admin/users") { header(HttpHeaders.Authorization, "Bearer $ownerToken") }
        assertEquals(HttpStatusCode.BadRequest, noEmail.status)
    }

    private suspend fun HttpClient.putOverride(ownerToken: String, userId: UUID, body: String): HttpResponse =
        put("/api/v1/admin/users/$userId/tier-override") {
            header(HttpHeaders.Authorization, "Bearer $ownerToken")
            contentType(ContentType.Application.Json)
            setBody(body)
        }

    @Test
    fun `A2 티어 override - pro 지정·해제, 잘못된 입력 400, 없는 사용자 404, 감사 기록`() = testApplication {
        configureApiTestApp(dbConfig)
        val (ownerId, ownerToken) = client.newUser()
        TestTier.setRole(db, ownerId, "owner")
        val (targetId, targetToken) = client.newUser()

        val until = OffsetDateTime.now(ZoneOffset.UTC).plusDays(30)
        val ok = client.putOverride(ownerToken, targetId, """{"tier":"pro","until":"${DateTimeFormatter.ISO_INSTANT.format(until.toInstant())}","reason":"테스트 지정"}""")
        assertEquals(HttpStatusCode.OK, ok.status, ok.bodyAsText())
        assertEquals("pro", json(ok.bodyAsText())["tier"]!!.jsonPrimitive.content)
        val me = client.me(targetToken)
        assertEquals("pro", me["tier"]!!.jsonPrimitive.content)
        assertTrue(me["tierOverrideUntil"] is JsonPrimitive && !(me["tierOverrideUntil"] is JsonNull))
        assertEquals(100, me["limits"]!!.jsonObject["songs"]!!.jsonPrimitive.int)

        for (bad in listOf(
            """{"tier":"gold","reason":"x"}""",
            """{"tier":"pro","reason":"   "}""",
            """{"tier":"pro"}""",
            """{"tier":null,"until":"2030-01-01T00:00:00Z","reason":"x"}""",
            """{"tier":"pro","until":"2020-01-01T00:00:00Z","reason":"x"}""",
            """{"reason":"x"}"""
        )) {
            val res = client.putOverride(ownerToken, targetId, bad)
            assertEquals(HttpStatusCode.BadRequest, res.status, bad)
            assertStandardError(res.bodyAsText(), 400, "INVALID_INPUT")
        }
        val missing = client.putOverride(ownerToken, UUID.randomUUID(), """{"tier":"pro","reason":"x"}""")
        assertEquals(HttpStatusCode.NotFound, missing.status)

        // 해제 → 크레딧 주기 끝까지 유예(M1-3e)로 pro, 주기가 끝나면 free
        val clear = client.putOverride(ownerToken, targetId, """{"tier":null,"until":null,"reason":"해제"}""")
        assertEquals(HttpStatusCode.OK, clear.status)
        assertEquals("pro", client.me(targetToken)["tier"]!!.jsonPrimitive.content)
        endCreditCycle(targetId)
        assertEquals("free", client.me(targetToken)["tier"]!!.jsonPrimitive.content)

        val audit = client.get("/api/v1/admin/audit?targetUserId=$targetId") { header(HttpHeaders.Authorization, "Bearer $ownerToken") }
        assertEquals(HttpStatusCode.OK, audit.status)
        val rows = json(audit.bodyAsText())["rows"]!!.jsonArray
        assertEquals(2, rows.size, "성공한 쓰기만 기록(실패는 롤백)")
        val last = rows[0].jsonObject
        assertEquals("tier_override", last["action"]!!.jsonPrimitive.content)
        assertEquals("해제", last["reason"]!!.jsonPrimitive.content)
        assertEquals(ownerId.toString(), last["actorId"]!!.jsonPrimitive.content)
        assertEquals("pro", last["before"]!!.jsonObject["tier"]!!.jsonPrimitive.content)
        assertEquals("pro", last["after"]!!.jsonObject["tier"]!!.jsonPrimitive.content, "해제 직후는 유예 중")
    }

    /** 크레딧 주기 끝(M1-3e 유예 끝)을 지금으로 당기고 monthly-credits가 하는 처리를 한다 */
    private fun endCreditCycle(userId: UUID) = transaction(db) {
        val now = Instant.now()
        ProfilesTable.update({ ProfilesTable.id eq userId }) { it[creditCycleNextAt] = now.minusSeconds(1).atOffset(ZoneOffset.UTC) }
        processDueCycle(userId, "free", now)
    }

    @Test
    fun `A3 다운그레이드 정리 - 무료 전환 뒤 크레딧 주기 끝에 학습 기록 공유 끄기·저장소 서버로, 데이터는 유지`() = testApplication {
        configureApiTestApp(dbConfig)
        val (ownerId, ownerToken) = client.newUser()
        TestTier.setRole(db, ownerId, "owner")
        val (targetId, targetToken) = client.newUser()
        assertEquals(HttpStatusCode.OK, client.putOverride(ownerToken, targetId, """{"tier":"pro","reason":"지정"}""").status)
        for (i in 1..12) client.songId(targetToken, videoId(i))
        transaction(db) {
            ProfilesTable.update({ ProfilesTable.id eq targetId }) {
                it[sharePracticeLog] = true
                it[storageProvider] = "drive"
            }
        }

        assertEquals(HttpStatusCode.OK, client.putOverride(ownerToken, targetId, """{"tier":"free","reason":"강등 시험"}""").status)
        // 주기 끝까지는 유료와 같다(M1-3e) — 정리 없음, 추가 가능
        val grace = client.me(targetToken)
        assertEquals("pro", grace["tier"]!!.jsonPrimitive.content)
        assertEquals(true, grace["sharePracticeLog"]!!.jsonPrimitive.boolean)
        assertEquals("drive", grace["storageProvider"]!!.jsonPrimitive.content)

        endCreditCycle(targetId)
        val me = client.me(targetToken)
        assertEquals("free", me["tier"]!!.jsonPrimitive.content)
        assertEquals(false, me["sharePracticeLog"]!!.jsonPrimitive.boolean)
        assertEquals("supabase", me["storageProvider"]!!.jsonPrimitive.content)
        assertEquals(12, me["usage"]!!.jsonObject["songs"]!!.jsonPrimitive.int, "곡은 지우지 않는다(Q8)")
        // 새 추가만 잠김
        assertEquals(HttpStatusCode.Forbidden, client.addSong(targetToken, videoId(30)).status)
    }

    @Test
    fun `A4 크레딧 지급·차감 - 기본 구매분, 상한 400, 음수 409, 원장 합계 = 잔액`() = testApplication {
        configureApiTestApp(dbConfig)
        val (ownerId, ownerToken) = client.newUser()
        TestTier.setRole(db, ownerId, "owner")
        val (targetId, targetToken) = client.newUser()

        suspend fun credit(body: String) = client.post("/api/v1/admin/users/$targetId/credits") {
            header(HttpHeaders.Authorization, "Bearer $ownerToken")
            contentType(ContentType.Application.Json)
            setBody(body)
        }

        val grant = credit("""{"delta":500,"reason":"보상"}""")
        assertEquals(HttpStatusCode.OK, grant.status, grant.bodyAsText())
        val g = json(grant.bodyAsText())
        assertEquals(500, g["credits"]!!.jsonObject["purchased"]!!.jsonPrimitive.int)
        assertEquals(0, g["credits"]!!.jsonObject["monthly"]!!.jsonPrimitive.int)
        assertTrue(g["ledgerId"]!!.jsonPrimitive.long > 0)

        assertEquals(HttpStatusCode.OK, credit("""{"delta":30,"bucket":"monthly","reason":"월 시험"}""").status)
        assertEquals(HttpStatusCode.OK, credit("""{"delta":-200,"reason":"회수"}""").status)

        val tooBig = credit("""{"delta":1001,"reason":"x"}""")
        assertEquals(HttpStatusCode.BadRequest, tooBig.status)
        assertStandardError(tooBig.bodyAsText(), 400, "ADMIN_GRANT_LIMIT_EXCEEDED")
        assertEquals(1000, detailOf(tooBig.bodyAsText())["max"]!!.jsonPrimitive.int)

        val negative = credit("""{"delta":-301,"reason":"x"}""")
        assertEquals(HttpStatusCode.Conflict, negative.status)
        assertStandardError(negative.bodyAsText(), 409, "CREDIT_BALANCE_NEGATIVE")
        assertEquals(300, detailOf(negative.bodyAsText())["balance"]!!.jsonPrimitive.int)

        for (bad in listOf("""{"delta":0,"reason":"x"}""", """{"delta":"5","reason":"x"}""", """{"delta":5,"bucket":"gift","reason":"x"}""", """{"delta":5}""")) {
            assertEquals(HttpStatusCode.BadRequest, credit(bad).status, bad)
        }

        val me = client.me(targetToken)
        assertEquals(buildJsonObject { put("monthly", 30); put("purchased", 300) }, me["credits"])
        assertLedgerMatchesBalance(targetId)
        transaction(db) {
            val ledger = CreditLedgerTable.selectAll().where { CreditLedgerTable.userId eq targetId }.toList()
            assertEquals(3, ledger.size)
            assertTrue(ledger.all { it[CreditLedgerTable.reason] == "admin_adjust" && it[CreditLedgerTable.auditId] != null })
            val auditIds = AdminAuditTable.selectAll().where { AdminAuditTable.action eq "credit_adjust" }.map { it[AdminAuditTable.id] }.toSet()
            assertEquals(auditIds, ledger.map { it[CreditLedgerTable.auditId]!! }.toSet())
        }
    }

    @Test
    fun `A5 크리에이터 지정 - 배지·소개, 잘못된 배지 400`() = testApplication {
        configureApiTestApp(dbConfig)
        val (ownerId, ownerToken) = client.newUser()
        TestTier.setRole(db, ownerId, "owner")
        val (targetId, targetToken) = client.newUser()

        suspend fun creator(body: String) = client.put("/api/v1/admin/users/$targetId/creator") {
            header(HttpHeaders.Authorization, "Bearer $ownerToken")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val ok = creator("""{"isCreator":true,"creatorBadge":"네오소울","creatorBio":"매일 연습","reason":"지정"}""")
        assertEquals(HttpStatusCode.OK, ok.status, ok.bodyAsText())
        val me = client.me(targetToken)
        assertEquals(true, me["isCreator"]!!.jsonPrimitive.boolean)
        assertEquals("네오소울", me["creatorBadge"]!!.jsonPrimitive.content)
        assertEquals("매일 연습", me["creatorBio"]!!.jsonPrimitive.content)

        assertEquals(HttpStatusCode.BadRequest, creator("""{"isCreator":true,"creatorBadge":"${"가".repeat(21)}","reason":"x"}""").status)
        assertEquals(HttpStatusCode.BadRequest, creator("""{"creatorBadge":"a","reason":"x"}""").status)

        // 배지 키 없음 = 그대로, null = 지움
        assertEquals(HttpStatusCode.OK, creator("""{"isCreator":false,"reason":"해제"}""").status)
        assertEquals("네오소울", client.me(targetToken)["creatorBadge"]!!.jsonPrimitive.content)
        assertEquals(HttpStatusCode.OK, creator("""{"isCreator":false,"creatorBadge":null,"reason":"배지 삭제"}""").status)
        assertTrue(client.me(targetToken)["creatorBadge"] is JsonNull)
    }

    // ---------------------------------------------------------------- cron

    @Test
    fun `C1 tier-expire cron - 기한 지난 override 해제·정리, OIDC 없으면 401`() = testApplication {
        configureApiTestApp(dbConfig)
        val (expiredId, expiredToken) = client.newUser()
        val (activeId, activeToken) = client.newUser()
        transaction(db) {
            ProfilesTable.update({ ProfilesTable.id eq expiredId }) {
                it[tierOverride] = "pro"
                it[tierOverrideUntil] = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1)
                it[sharePracticeLog] = true
            }
            ProfilesTable.update({ ProfilesTable.id eq activeId }) {
                it[tierOverride] = "pro"
                it[tierOverrideUntil] = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1)
            }
        }
        // 만료 ~ cron 사이에도 실제 티어는 이미 free
        assertEquals("free", client.me(expiredToken)["tier"]!!.jsonPrimitive.content)

        assertEquals(HttpStatusCode.Unauthorized, client.post("/internal/cron/tier-expire").status)
        val res = client.post("/internal/cron/tier-expire") {
            header(HttpHeaders.Authorization, "Bearer ${TestCronJwt.token()}")
        }
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        assertEquals(buildJsonObject { put("expired", 1); put("downgraded", 1) }, json(res.bodyAsText()))

        val me = client.me(expiredToken)
        assertEquals(false, me["sharePracticeLog"]!!.jsonPrimitive.boolean)
        transaction(db) {
            val row = ProfilesTable.selectAll().where { ProfilesTable.id eq expiredId }.single()
            assertNull(row[ProfilesTable.tierOverride])
            assertNull(row[ProfilesTable.tierOverrideUntil])
        }
        assertEquals("pro", client.me(activeToken)["tier"]!!.jsonPrimitive.content)

        // 다시 돌려도 바뀌는 것 없음
        val again = client.post("/internal/cron/tier-expire") { header(HttpHeaders.Authorization, "Bearer ${TestCronJwt.token()}") }
        assertEquals(buildJsonObject { put("expired", 0); put("downgraded", 0) }, json(again.bodyAsText()))
    }
}
