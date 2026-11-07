package ulevelp.song

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.support.*
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.*

class SongPresetAndPartApiTest {

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

    @BeforeEach
    fun cleanDb() {
        transaction(db) {
            SongPresetsTable.deleteAll()
            TakesTable.deleteAll()
            SessionsTable.deleteAll()
            SongsTable.deleteAll()
            StorageTrashTable.deleteAll()
            ProfilesTable.deleteAll()
            UsersTable.deleteAll()
        }
    }

    private suspend fun ensureUser(client: io.ktor.client.HttpClient, token: String) {
        val res = client.get("/api/v1/me") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, res.status)
    }

    private suspend fun createTestSong(client: io.ktor.client.HttpClient, token: String, durationSec: Int = 213): String {
        val res = client.post("/api/v1/songs") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("""{"videoId":"dQw4w9WgXcQ","title":"Test Song"}""")
        }
        assertEquals(HttpStatusCode.Created, res.status)
        val songObj = Json.parseToJsonElement(res.bodyAsText()).jsonObject["song"]!!.jsonObject
        val songId = songObj["id"]!!.jsonPrimitive.content

        transaction(db) {
            SongsTable.update({ SongsTable.id eq UUID.fromString(songId) }) {
                it[SongsTable.durationSec] = durationSec
            }
        }
        return songId
    }

    @Test
    fun `구간 프리셋 CRUD 및 동일 이름 분할 연습 구간 누적 병합(merge) 검증`() = testApplication {
        configureApiTestApp(dbConfig)
        val userA = UUID.randomUUID()
        val token = TestJwt.token(userA)
        ensureUser(client, token)
        val songId = createTestSong(client, token)

        // 1. 최초 "A" 프리셋 등록 (0.0 ~ 14.0)
        val putRes1 = client.put("/api/v1/songs/$songId/presets") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("name", "A")
                put("a", 0.0)
                put("b", 14.0)
                put("rate", 0.75)
                put("completed", false)
                put("merge", true)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, putRes1.status)
        val body1 = Json.parseToJsonElement(putRes1.bodyAsText()).jsonObject
        val preset1 = body1["preset"]!!.jsonObject
        assertEquals("A", preset1["name"]!!.jsonPrimitive.content)
        assertEquals(0.0, preset1["a"]!!.jsonPrimitive.double)
        assertEquals(14.0, preset1["b"]!!.jsonPrimitive.double)
        assertEquals(false, preset1["completed"]!!.jsonPrimitive.boolean)
        val presetId = preset1["id"]!!.jsonPrimitive.content

        // 2. 동일한 "A" 이름으로 2차 분할 구간 (14.0 ~ 41.0, completed=true) 저장 -> 0.0 ~ 41.0으로 자동 병합 검증
        val putRes2 = client.put("/api/v1/songs/$songId/presets") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("name", "A")
                put("a", 14.0)
                put("b", 41.0)
                put("rate", 1.0)
                put("completed", true)
                put("merge", true)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, putRes2.status)
        val body2 = Json.parseToJsonElement(putRes2.bodyAsText()).jsonObject
        val preset2 = body2["preset"]!!.jsonObject
        assertEquals("A", preset2["name"]!!.jsonPrimitive.content)
        // 병합된 min(0, 14) -> 0.0, max(14, 41) -> 41.0
        assertEquals(0.0, preset2["a"]!!.jsonPrimitive.double)
        assertEquals(41.0, preset2["b"]!!.jsonPrimitive.double)
        assertEquals(1.0, preset2["rate"]!!.jsonPrimitive.double)
        assertEquals(true, preset2["completed"]!!.jsonPrimitive.boolean)

        // 3. 프리셋 목록 조회 검증
        val listRes = client.get("/api/v1/songs/$songId/presets") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, listRes.status)
        val listBody = Json.parseToJsonElement(listRes.bodyAsText()).jsonObject
        val presets = listBody["presets"]!!.jsonArray
        assertEquals(1, presets.size)

        // 4. 프리셋 삭제 검증
        val delRes = client.delete("/api/v1/songs/$songId/presets/$presetId") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, delRes.status)

        val listResAfter = client.get("/api/v1/songs/$songId/presets") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        val emptyPresets = Json.parseToJsonElement(listResAfter.bodyAsText()).jsonObject["presets"]!!.jsonArray
        assertEquals(0, emptyPresets.size)
    }

    @Test
    fun `연습 진행 저장 시 partName 수신 및 영상 전체 대비 세션 진행바(coverage_pct) 연산 검증`() = testApplication {
        configureApiTestApp(dbConfig)
        val userA = UUID.randomUUID()
        val token = TestJwt.token(userA)
        ensureUser(client, token)
        val songId = createTestSong(client, token, durationSec = 213)
        val today = LocalDate.now(ZoneOffset.UTC).toString()

        // 1. A파트 (0.0 ~ 29.0, 29초 길이) 60초 연습 저장 -> 29 / 213 ≈ 14%
        val res1 = client.post("/api/v1/practice/save") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("songId", songId)
                put("pos", 25.0)
                put("a", 0.0)
                put("b", 29.0)
                put("rate", 1.0)
                put("date", today)
                put("addSeconds", 60)
                put("addLoops", 2)
                put("partName", "A파트")
                put("durationSec", 213)
                put("completed", true)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, res1.status)
        val body1 = Json.parseToJsonElement(res1.bodyAsText()).jsonObject
        assertEquals(14, body1["coveragePct"]?.jsonPrimitive?.int)

        // 2. 브릿지 (30.0 ~ 44.0, 14초 길이) 120초 연습 저장 -> (29 + 14) = 43초 / 213 ≈ 20%
        val res2 = client.post("/api/v1/practice/save") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("songId", songId)
                put("pos", 40.0)
                put("a", 30.0)
                put("b", 44.0)
                put("rate", 0.75)
                put("date", today)
                put("addSeconds", 120)
                put("addLoops", 4)
                put("partName", "브릿지")
                put("durationSec", 213)
                put("completed", false)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, res2.status)
        val body2 = Json.parseToJsonElement(res2.bodyAsText()).jsonObject
        assertEquals(20, body2["coveragePct"]?.jsonPrimitive?.int)

        // 3. 코러스 (45.0 ~ 71.0, 26초 길이) 180초 연습 저장 -> (29 + 14 + 26) = 69초 / 213 ≈ 32% (33% 내외)
        val res3 = client.post("/api/v1/practice/save") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("songId", songId)
                put("pos", 60.0)
                put("a", 45.0)
                put("b", 71.0)
                put("rate", 1.0)
                put("date", today)
                put("addSeconds", 180)
                put("addLoops", 5)
                put("partName", "코러스")
                put("durationSec", 213)
                put("completed", true)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, res3.status)
        val body3 = Json.parseToJsonElement(res3.bodyAsText()).jsonObject
        assertEquals(32, body3["coveragePct"]?.jsonPrimitive?.int)

        // 4. 곡 상세 API에서 sessions의 partStats와 coveragePct 검증
        val detailRes = client.get("/api/v1/songs/$songId") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        assertEquals(HttpStatusCode.OK, detailRes.status)
        val detailBody = Json.parseToJsonElement(detailRes.bodyAsText()).jsonObject
        val session0 = detailBody["sessions"]!!.jsonArray[0].jsonObject
        assertEquals(32, session0["coveragePct"]!!.jsonPrimitive.int)
        val partStats = session0["partStats"]!!.jsonArray
        assertEquals(3, partStats.size)
        val partNames = partStats.map { it.jsonObject["name"]!!.jsonPrimitive.content }
        assertTrue(partNames.containsAll(listOf("A파트", "브릿지", "코러스")))
    }

    @Test
    fun `녹음 테이크 완료(PATCH complete) 시 프리셋 및 테이크 상태 동기화 검증`() = testApplication {
        configureApiTestApp(dbConfig)
        val userA = UUID.randomUUID()
        val token = TestJwt.token(userA)
        ensureUser(client, token)
        val songId = createTestSong(client, token)

        // 프리셋 생성
        val putPresetRes = client.put("/api/v1/songs/$songId/presets") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("name", "솔로파트")
                put("a", 60.0)
                put("b", 90.0)
                put("rate", 1.0)
                put("completed", false)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, putPresetRes.status)

        // 테이크 직접 DB 삽입 (partName = "솔로파트", completed = false)
        val takeId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val today = LocalDate.now(ZoneOffset.UTC)
        transaction(db) {
            SessionsTable.insert {
                it[id] = sessionId
                it[userId] = userA
                it[SessionsTable.songId] = UUID.fromString(songId)
                it[date] = today
                it[seconds] = 300
                it[loops] = 5
            }
            TakesTable.insert {
                it[id] = takeId
                it[userId] = userA
                it[TakesTable.sessionId] = sessionId
                it[TakesTable.songId] = UUID.fromString(songId)
                it[recordedAt] = OffsetDateTime.now(ZoneOffset.UTC)
                it[durationSec] = 30
                it[mime] = "audio/webm"
                it[sizeBytes] = 10000L
                it[storage] = "supabase"
                it[storageKey] = "user1/take1.weba"
                it[partName] = "솔로파트"
                it[completed] = false
            }
        }

        // PATCH /takes/{takeId}/complete 호출
        val patchRes = client.patch("/api/v1/takes/$takeId/complete") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("completed", true)
            }.toString())
        }
        assertEquals(HttpStatusCode.OK, patchRes.status)
        val patchBody = Json.parseToJsonElement(patchRes.bodyAsText()).jsonObject
        val takeDto = patchBody["take"]!!.jsonObject
        assertEquals(true, takeDto["completed"]!!.jsonPrimitive.boolean)

        // 연관된 프리셋 "솔로파트"의 completed도 true로 동기화되었는지 검증
        val presetListRes = client.get("/api/v1/songs/$songId/presets") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        val pList = Json.parseToJsonElement(presetListRes.bodyAsText()).jsonObject["presets"]!!.jsonArray
        val soloPreset = pList.first { it.jsonObject["name"]!!.jsonPrimitive.content == "솔로파트" }.jsonObject
        assertEquals(true, soloPreset["completed"]!!.jsonPrimitive.boolean)
    }
}
