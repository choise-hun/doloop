package ulevelp.integration

import com.sun.net.httpserver.HttpServer
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.api.ApiException
import ulevelp.db.*
import ulevelp.service.HttpIntegrationCheckClient
import ulevelp.support.*
import java.io.OutputStream
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.*

class IntegrationApiTest {

    companion object {
        private lateinit var dataSource: HikariDataSource
        private lateinit var db: Database
        private lateinit var dbConfig: DatabaseConfig

        @JvmStatic
        @BeforeAll
        fun setUpAll() {
            dbConfig = PostgresTestContainer.getConfig()
            dataSource = DatabaseFactory.createDataSource(dbConfig)
            DatabaseFactory.migrate(dataSource)
            db = DatabaseFactory.connect(dataSource)
        }

        @JvmStatic
        @AfterAll
        fun tearDownAll() {
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

    private val userA = UUID.fromString("00000000-0000-4000-8000-000000000001")
    private val userB = UUID.fromString("00000000-0000-4000-8000-000000000002")
    private lateinit var tokenA: String
    private lateinit var tokenB: String
    private lateinit var fakeCheckClient: FakeIntegrationCheckClient

    @BeforeEach
    fun setUp() {
        tokenA = TestJwt.token(sub = userA, email = "usera@example.com")
        tokenB = TestJwt.token(sub = userB, email = "userb@example.com")
        fakeCheckClient = FakeIntegrationCheckClient()

        transaction(db) {
            IntegrationsTable.deleteAll()
            NotionSyncTable.deleteAll()
            ProfilesTable.deleteAll()
            UsersTable.deleteAll()

            UsersTable.insert {
                it[id] = userA
                it[email] = "usera@example.com"
            }
            ProfilesTable.insert {
                it[id] = userA
                it[displayName] = "사용자A"
                it[takeQuotaBytes] = 209_715_200L
            }

            UsersTable.insert {
                it[id] = userB
                it[email] = "userb@example.com"
            }
            ProfilesTable.insert {
                it[id] = userB
                it[displayName] = "사용자B"
                it[takeQuotaBytes] = 209_715_200L
            }
        }
    }

    private fun testApp(block: suspend (client: HttpClient) -> Unit) {
        testApplication {
            configureApiTestApp(
                dbConfig = dbConfig,
                cryptoService = TestCrypto.service,
                integrationCheckClient = fakeCheckClient
            )
            val client = createClient {
                expectSuccess = false
            }
            runBlocking {
                block(client)
            }
        }
    }

    @Test
    fun `K1 빈 키 목록 조회`() = testApp { client ->
        val resp = client.get("/api/v1/integrations") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.OK, resp.status)
        val json = Json.parseToJsonElement(resp.bodyAsText()).jsonObject
        val arr = json["integrations"]?.jsonArray
        assertNotNull(arr)
        assertEquals(0, arr.size)
    }

    @Test
    fun `K2 노션 키 등록·마스킹·GET me 연동`() = testApp { client ->
        val rawToken = "ntn_1234567890abcdefghijABCDEFGHIJ9a8b"
        val rawDbId = "959CBE51-7E22-4419-B48C-A3313895A427"
        val normDbId = "959cbe517e224419b48ca3313895a427"

        // ① PUT /api/v1/integrations/notion
        val putResp = client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", rawToken)
                put("songsDb", rawDbId)
                put("sessionsDb", rawDbId)
                put("notesDb", null as String?)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, putResp.status)
        val putBody = putResp.bodyAsText()
        assertFalse(putBody.contains("ntn_1234567890"), "응답 본문에 토큰 원문이 노출되면 안 됩니다")
        val putJson = Json.parseToJsonElement(putBody).jsonObject
        assertEquals("notion", putJson["provider"]?.jsonPrimitive?.content)
        assertEquals("9a8b", putJson["hint"]?.jsonPrimitive?.content)
        val cfg = putJson["config"]?.jsonObject
        assertNotNull(cfg)
        assertEquals(normDbId, cfg["songsDb"]?.jsonPrimitive?.content)
        assertEquals(normDbId, cfg["sessionsDb"]?.jsonPrimitive?.content)

        // ② GET /api/v1/integrations
        val listResp = client.get("/api/v1/integrations") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.OK, listResp.status)
        val listBody = listResp.bodyAsText()
        assertFalse(listBody.contains("ntn_1234567890"), "목록 응답 본문에 토큰 원문이 노출되면 안 됩니다")
        val listJson = Json.parseToJsonElement(listBody).jsonObject
        val listArr = listJson["integrations"]?.jsonArray
        assertNotNull(listArr)
        assertEquals(1, listArr.size)
        val first = listArr[0].jsonObject
        assertEquals("9a8b", first["hint"]?.jsonPrimitive?.content)
        assertEquals(normDbId, first["config"]?.jsonObject?.get("songsDb")?.jsonPrimitive?.content)

        // ③ GET /api/v1/me
        val meResp = client.get("/api/v1/me") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.OK, meResp.status)
        val meJson = Json.parseToJsonElement(meResp.bodyAsText()).jsonObject
        val keysObj = meJson["keys"]?.jsonObject
        assertNotNull(keysObj)
        val notionKey = keysObj["notion"]?.jsonObject
        assertNotNull(notionKey)
        assertEquals("9a8b", notionKey["hint"]?.jsonPrimitive?.content)
    }

    @Test
    fun `K3 노션 키 비우고 DB ID만 수정 (FR-KEY-2)`() = testApp { client ->
        val rawToken = "ntn_1234567890abcdefghijABCDEFGHIJ9a8b"
        val songsDb = "959cbe517e224419b48ca3313895a427"
        val sessionsDb = "959cbe517e224419b48ca3313895a428"

        // 최초 등록
        val put1 = client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", rawToken)
                put("songsDb", songsDb)
                put("sessionsDb", sessionsDb)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, put1.status)

        // token: null로 수정 (notesDb 추가)
        val newNotesDb = "d708a561eb574175a8bb979642b3a76a"
        val put2 = client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", null as String?)
                put("songsDb", songsDb)
                put("sessionsDb", sessionsDb)
                put("notesDb", newNotesDb)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, put2.status)
        val put2Json = Json.parseToJsonElement(put2.bodyAsText()).jsonObject
        assertEquals("9a8b", put2Json["hint"]?.jsonPrimitive?.content)
        assertEquals(newNotesDb, put2Json["config"]?.jsonObject?.get("notesDb")?.jsonPrimitive?.content)

        // DB에 저장된 암호문을 복호화하면 원래 토큰과 일치
        transaction(db) {
            val row = IntegrationsTable
                .selectAll()
                .where { (IntegrationsTable.userId eq userA) and (IntegrationsTable.provider eq "notion") }
                .single()
            val decrypted = TestCrypto.service.decryptProviderKey(
                userId = userA,
                provider = "notion",
                encryptedSecret = row[IntegrationsTable.encryptedSecret],
                iv = row[IntegrationsTable.iv]
            )
            assertEquals(rawToken, decrypted)
        }
    }

    @Test
    fun `K4 Gemini 연동 경로 삭제 (M1-3b — 서버 키 + 크레딧)`() = testApp { client ->
        val putResp = client.put("/api/v1/integrations/gemini") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("apiKey", "AIza" + "SyFakeKeyForIntegrationTest1234X9zQ")
            }.toString())
        }
        assertEquals(HttpStatusCode.BadRequest, putResp.status)
        assertStandardError(putResp.bodyAsText(), 400, "INVALID_INPUT")

        val chk = client.post("/api/v1/integrations/gemini/check") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.BadRequest, chk.status)
        assertStandardError(chk.bodyAsText(), 400, "INVALID_INPUT")

        val del = client.delete("/api/v1/integrations/gemini") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.BadRequest, del.status)
        assertStandardError(del.bodyAsText(), 400, "INVALID_INPUT")

        // 모르는 공급자는 지금처럼 404
        val unknown = client.delete("/api/v1/integrations/slack") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.NotFound, unknown.status)

        // 401은 그대로
        assertEquals(HttpStatusCode.Unauthorized, client.put("/api/v1/integrations/gemini").status)
    }

    @Test
    fun `K5 잘못된 키·DB ID 형식 거부`() = testApp { client ->
        val validDb = "959cbe517e224419b48ca3313895a427"

        // ① 최초 등록 시 token 누락
        val r1 = client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("songsDb", validDb)
                put("sessionsDb", validDb)
            }.toString())
        }
        assertEquals(HttpStatusCode.BadRequest, r1.status)
        assertStandardError(r1.bodyAsText(), 400, "INVALID_INPUT")

        // ② 잘못된 노션 토큰 "ntn_short"
        val r2 = client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", "ntn_short")
                put("songsDb", validDb)
                put("sessionsDb", validDb)
            }.toString())
        }
        assertEquals(HttpStatusCode.BadRequest, r2.status)
        assertStandardError(r2.bodyAsText(), 400, "INVALID_INPUT")

        // ③ 잘못된 songsDb "bad-id" -> message에 songsDb 포함
        val r3 = client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", "ntn_1234567890abcdefghijABCDEFGHIJ9a8b")
                put("songsDb", "bad-id")
                put("sessionsDb", validDb)
            }.toString())
        }
        assertEquals(HttpStatusCode.BadRequest, r3.status)
        val err3 = assertStandardError(r3.bodyAsText(), 400, "INVALID_INPUT")
        assertTrue(err3["message"]?.jsonPrimitive?.content?.contains("songsDb") == true)

        // ⑥ 잘못된 appId "other"
        val r6 = client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("appId", "other")
                put("token", "ntn_1234567890abcdefghijABCDEFGHIJ9a8b")
                put("songsDb", validDb)
                put("sessionsDb", validDb)
            }.toString())
        }
        assertEquals(HttpStatusCode.BadRequest, r6.status)
        assertStandardError(r6.bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `K6 연결 점검 성공 (check)`() = testApp { client ->
        val rawToken = "ntn_1234567890abcdefghijABCDEFGHIJ9a8b"
        val dbId = "959cbe517e224419b48ca3313895a427"
        // 키 등록
        client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", rawToken)
                put("songsDb", dbId)
                put("sessionsDb", dbId)
            }.toString())
        }

        // ① POST /api/v1/integrations/notion/check
        val chkNotion = client.post("/api/v1/integrations/notion/check") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.OK, chkNotion.status)
        val notionJson = Json.parseToJsonElement(chkNotion.bodyAsText()).jsonObject
        assertEquals("notion", notionJson["provider"]?.jsonPrimitive?.content)
        assertEquals("연습 곡", notionJson["songsTitle"]?.jsonPrimitive?.content)
        assertEquals("연습 기록", notionJson["sessionsTitle"]?.jsonPrimitive?.content)
        assertEquals(5, notionJson["maxUploadMB"]?.jsonPrimitive?.int)
    }

    @Test
    fun `K7 미등록 상태 연결 점검 (412 NO_KEY)`() = testApp { client ->
        val chkNotion = client.post("/api/v1/integrations/notion/check") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        assertEquals(HttpStatusCode.PreconditionFailed, chkNotion.status)
        assertStandardError(chkNotion.bodyAsText(), 412, "NO_KEY")

        // gemini는 경로 자체를 지웠다(M1-3b) → 400
        val chkGemini = client.post("/api/v1/integrations/gemini/check") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        assertEquals(HttpStatusCode.BadRequest, chkGemini.status)
        assertStandardError(chkGemini.bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `K8 연결 점검 실패 (누락 속성·401·404)`() = testApp { client ->
        val rawToken = "ntn_1234567890abcdefghijABCDEFGHIJ9a8b"
        val dbId = "959cbe517e224419b48ca3313895a427"

        client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", rawToken)
                put("songsDb", dbId)
                put("sessionsDb", dbId)
            }.toString())
        }

        // ① 노션 필수 속성 마지막 위치(초) 누락
        fakeCheckClient.notionHandler = { _, _, _, _ ->
            throw ApiException(
                HttpStatusCode.BadRequest,
                "NOTION_SCHEMA_MISMATCH",
                "노션 데이터베이스에 필수 속성이 없습니다: 마지막 위치(초)",
                source = "notion"
            )
        }
        val r1 = client.post("/api/v1/integrations/notion/check") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.BadRequest, r1.status)
        val err1 = assertStandardError(r1.bodyAsText(), 400, "NOTION_SCHEMA_MISMATCH", expectedSource = "notion")
        assertTrue(err1["message"]?.jsonPrimitive?.content?.contains("마지막 위치(초)") == true)

        // ② 노션 401
        fakeCheckClient.notionHandler = { _, _, _, _ ->
            throw ApiException(
                HttpStatusCode.BadRequest,
                "PROVIDER_KEY_INVALID",
                "노션 통합 토큰이 유효하지 않습니다. 토큰을 다시 확인해 주세요.",
                source = "notion"
            )
        }
        val r2 = client.post("/api/v1/integrations/notion/check") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.BadRequest, r2.status)
        assertStandardError(r2.bodyAsText(), 400, "PROVIDER_KEY_INVALID", expectedSource = "notion")

        // ③ 노션 404
        fakeCheckClient.notionHandler = { _, _, _, _ ->
            throw ApiException(
                HttpStatusCode.NotFound,
                "NOTION_OBJECT_NOT_FOUND",
                "노션 데이터베이스를 찾을 수 없습니다. 노션 페이지에 통합(Connections)을 연결했는지 확인해 주세요.",
                source = "notion"
            )
        }
        val r3 = client.post("/api/v1/integrations/notion/check") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.NotFound, r3.status)
        assertStandardError(r3.bodyAsText(), 404, "NOTION_OBJECT_NOT_FOUND", expectedSource = "notion")
    }

    @Test
    fun `K9 노션 키 연결 해제 시 notion_sync enabled=false 자동 전환 (FR-KEY-4)`() = testApp { client ->
        val rawToken = "ntn_1234567890abcdefghijABCDEFGHIJ9a8b"
        val dbId = "959cbe517e224419b48ca3313895a427"

        client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", rawToken)
                put("songsDb", dbId)
                put("sessionsDb", dbId)
            }.toString())
        }

        // NotionSyncTable에 활성 동기화 레코드 INSERT
        transaction(db) {
            NotionSyncTable.insert {
                it[userId] = userA
                it[enabled] = true
                it[leaseOwner] = "w1"
                it[leaseUntil] = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5)
            }
        }

        val delResp = client.delete("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.OK, delResp.status)
        val delJson = Json.parseToJsonElement(delResp.bodyAsText()).jsonObject
        assertEquals(true, delJson["ok"]?.jsonPrimitive?.boolean)

        // GET /integrations에 notion 없음
        val listResp = client.get("/api/v1/integrations") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        val listJson = Json.parseToJsonElement(listResp.bodyAsText()).jsonObject
        val arr = listJson["integrations"]?.jsonArray
        assertNotNull(arr)
        assertEquals(0, arr.size)

        // NotionSyncTable의 enabled == false 및 leaseOwner == null 확인
        transaction(db) {
            val syncRow = NotionSyncTable
                .selectAll()
                .where { NotionSyncTable.userId eq userA }
                .single()
            assertEquals(false, syncRow[NotionSyncTable.enabled])
            assertNull(syncRow[NotionSyncTable.leaseOwner])
            assertNull(syncRow[NotionSyncTable.leaseUntil])
        }
    }

    @Test
    fun `K10 ulevelp 외 appId(guitar-practice)는 400이고 아무것도 저장되지 않는다`() = testApp { client ->
        val rawToken = "ntn_1234567890abcdefghijABCDEFGHIJ9a8b"
        val dbId = "959cbe517e224419b48ca3313895a427"

        // A가 appId="guitar-practice"로 등록 시도 -> 400
        val putResp = client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("appId", "guitar-practice")
                put("token", rawToken)
                put("songsDb", dbId)
                put("sessionsDb", dbId)
            }.toString())
        }
        assertStandardError(putResp.bodyAsText(), 400, "INVALID_INPUT")

        // ① GET /api/v1/integrations?appId=ulevelp -> 빈 배열 [] (사전 차단이라 행이 생기지 않음)
        val r1 = client.get("/api/v1/integrations?appId=ulevelp") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.OK, r1.status)
        val j1 = Json.parseToJsonElement(r1.bodyAsText()).jsonObject
        assertEquals(0, j1["integrations"]?.jsonArray?.size)

        // ② GET /api/v1/integrations?appId=guitar-practice -> 400
        val r2 = client.get("/api/v1/integrations?appId=guitar-practice") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertStandardError(r2.bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `K11 사용자 A·B 교차 접근 차단`() = testApp { client ->
        val rawToken = "ntn_1234567890abcdefghijABCDEFGHIJ9a8b"
        val dbId = "959cbe517e224419b48ca3313895a427"
        // A가 노션 키 등록
        client.put("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
            header(HttpHeaders.ContentType, "application/json")
            setBody(buildJsonObject {
                put("token", rawToken)
                put("songsDb", dbId)
                put("sessionsDb", dbId)
            }.toString())
        }

        // B 토큰으로 GET /integrations
        val r1 = client.get("/api/v1/integrations") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        assertEquals(HttpStatusCode.OK, r1.status)
        val j1 = Json.parseToJsonElement(r1.bodyAsText()).jsonObject
        assertEquals(0, j1["integrations"]?.jsonArray?.size)

        // B 토큰으로 POST /notion/check -> 412 NO_KEY
        val r2 = client.post("/api/v1/integrations/notion/check") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        assertEquals(HttpStatusCode.PreconditionFailed, r2.status)

        // B 토큰으로 DELETE /notion -> B 것 삭제 시도 (A 것은 그대로 보존)
        val r3 = client.delete("/api/v1/integrations/notion") {
            header(HttpHeaders.Authorization, "Bearer $tokenB")
        }
        assertEquals(HttpStatusCode.OK, r3.status)

        // A 키가 그대로 보존되어 있는지 확인
        val r4 = client.get("/api/v1/integrations") {
            header(HttpHeaders.Authorization, "Bearer $tokenA")
        }
        assertEquals(HttpStatusCode.OK, r4.status)
        val j4 = Json.parseToJsonElement(r4.bodyAsText()).jsonObject
        assertEquals(1, j4["integrations"]?.jsonArray?.size)
    }

    @Test
    fun `K12 HttpIntegrationCheckClient 로컬 Mock HTTP 서버 검증`() = runBlocking {
        var server: HttpServer? = null
        try {
            server = HttpServer.create(InetSocketAddress(0), 0)
            val port = server.address.port

            val normalSongsDbJson = buildJsonObject {
                putJsonArray("title") {
                    addJsonObject { put("plain_text", "연습 곡") }
                }
                putJsonObject("properties") {
                    for (prop in HttpIntegrationCheckClient.REQUIRED_SONGS_PROPS) {
                        putJsonObject(prop) {}
                    }
                }
            }.toString()

            val normalSessionsDbJson = buildJsonObject {
                putJsonArray("title") {
                    addJsonObject { put("plain_text", "연습 기록") }
                }
                putJsonObject("properties") {
                    for (prop in HttpIntegrationCheckClient.REQUIRED_SESSIONS_PROPS) {
                        putJsonObject(prop) {}
                    }
                }
            }.toString()

            val missingSongsDbJson = buildJsonObject {
                putJsonArray("title") {
                    addJsonObject { put("plain_text", "연습 곡") }
                }
                putJsonObject("properties") {
                    // "곡명" 빠짐
                    for (prop in HttpIntegrationCheckClient.REQUIRED_SONGS_PROPS.drop(1)) {
                        putJsonObject(prop) {}
                    }
                }
            }.toString()

            val usersMeJson = buildJsonObject {
                putJsonObject("bot") {
                    putJsonObject("workspace_limits") {
                        put("max_file_upload_size_in_bytes", 20971520L) // 20MB
                    }
                }
            }.toString()

            server.createContext("/v1/databases/songs-ok") { exchange ->
                val bytes = normalSongsDbJson.toByteArray(StandardCharsets.UTF_8)
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }

            server.createContext("/v1/databases/sessions-ok") { exchange ->
                val bytes = normalSessionsDbJson.toByteArray(StandardCharsets.UTF_8)
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }

            server.createContext("/v1/databases/songs-missing") { exchange ->
                val bytes = missingSongsDbJson.toByteArray(StandardCharsets.UTF_8)
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }

            server.createContext("/v1/databases/db-not-found") { exchange ->
                val bytes = """{"object":"error","status":404,"message":"Not found"}""".toByteArray(StandardCharsets.UTF_8)
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(404, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }

            server.createContext("/v1/users/me") { exchange ->
                val bytes = usersMeJson.toByteArray(StandardCharsets.UTF_8)
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }

            server.start()

            val client = HttpIntegrationCheckClient(
                notionBaseUrl = "http://localhost:$port/v1"
            )

            // ① 정상 DB 스키마 JSON
            val notionRes = client.checkNotion(
                token = "ntn_testtoken",
                songsDb = "songs-ok",
                sessionsDb = "sessions-ok",
                notesDb = null
            )
            assertTrue(notionRes.ok)
            assertEquals("연습 곡", notionRes.songsTitle)
            assertEquals("연습 기록", notionRes.sessionsTitle)
            assertEquals(20, notionRes.maxUploadMB)

            // ② 곡명 빠진 DB JSON -> NOTION_SCHEMA_MISMATCH 예외
            val e2 = assertFailsWith<ApiException> {
                client.checkNotion(
                    token = "ntn_testtoken",
                    songsDb = "songs-missing",
                    sessionsDb = "sessions-ok",
                    notesDb = null
                )
            }
            assertEquals("NOTION_SCHEMA_MISMATCH", e2.code)
            assertEquals(HttpStatusCode.BadRequest, e2.status)
            assertTrue(e2.message.contains("곡명"))

            // ③ 노션 404 응답 -> NOTION_OBJECT_NOT_FOUND 예외
            val e3 = assertFailsWith<ApiException> {
                client.checkNotion(
                    token = "ntn_testtoken",
                    songsDb = "db-not-found",
                    sessionsDb = "sessions-ok",
                    notesDb = null
                )
            }
            assertEquals("NOTION_OBJECT_NOT_FOUND", e3.code)
            assertEquals(HttpStatusCode.NotFound, e3.status)

        } finally {
            server?.stop(0)
        }
    }
}
