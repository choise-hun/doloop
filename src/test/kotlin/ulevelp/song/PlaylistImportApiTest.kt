package ulevelp.song

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.PlaylistItem
import ulevelp.service.YoutubeDataPlaylistClient
import ulevelp.service.YoutubePlaylist
import ulevelp.support.*
import java.net.URLEncoder
import java.util.UUID
import kotlin.test.*

/**
 * M1-2b — 재생목록 가져오기 (개발산출물/결과/M1-1_스키마설계.md §5-3). YouTube는 FakePlaylistClient
 */
class PlaylistImportApiTest {

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

        private const val PL = "PLtest_0123456789"
        private const val PL_URL = "https://www.youtube.com/playlist?list=$PL"
    }

    @BeforeEach
    fun clean() {
        transaction(db) {
            StorageTrashTable.deleteAll()
            UsersTable.deleteAll()
        }
    }

    private fun json(res: String): JsonObject = Json.parseToJsonElement(res).jsonObject
    private fun vid(i: Int) = "vid" + i.toString().padStart(8, '0')
    private fun item(i: Int, available: Boolean = true) =
        PlaylistItem(vid(i), if (available) "Song $i" else "Private video", if (available) "Ch $i" else "", available)

    private suspend fun HttpClient.newUser(tier: String? = null): Pair<UUID, String> {
        val id = UUID.randomUUID()
        val token = TestJwt.token(id, email = "u$id@example.com")
        assertEquals(HttpStatusCode.OK, get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }.status)
        if (tier != null) TestTier.set(db, id, tier)
        return id to token
    }

    private suspend fun HttpClient.addSong(token: String, i: Int) {
        val res = post("/api/v1/songs") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("""{"videoId":"${vid(i)}","title":"Mine $i"}""")
        }
        assertEquals(HttpStatusCode.Created, res.status, res.bodyAsText())
    }

    private suspend fun HttpClient.addCategory(token: String, name: String): String {
        val res = post("/api/v1/categories") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("""{"name":"$name"}""")
        }
        assertEquals(HttpStatusCode.Created, res.status, res.bodyAsText())
        return json(res.bodyAsText())["category"]!!.jsonObject["id"]!!.jsonPrimitive.content
    }

    private suspend fun HttpClient.importPlaylist(token: String?, body: String): HttpResponse =
        post("/api/v1/songs/import-playlist") {
            token?.let { header(HttpHeaders.Authorization, "Bearer $it") }
            contentType(ContentType.Application.Json)
            setBody(body)
        }

    private suspend fun HttpClient.preview(token: String, url: String): HttpResponse =
        get("/api/v1/songs/import-playlist/preview?url=" + URLEncoder.encode(url, Charsets.UTF_8)) {
            header(HttpHeaders.Authorization, "Bearer $token")
        }

    private suspend fun HttpClient.songs(token: String): List<JsonObject> {
        val res = get("/api/v1/songs") { header(HttpHeaders.Authorization, "Bearer $token") }
        return json(res.bodyAsText())["songs"]!!.jsonArray.map { it.jsonObject }
    }

    private suspend fun HttpClient.categories(token: String): List<JsonObject> {
        val res = get("/api/v1/categories") { header(HttpHeaders.Authorization, "Bearer $token") }
        return json(res.bodyAsText())["categories"]!!.jsonArray.map { it.jsonObject }
    }

    @Test
    fun `P1 무료 10곡 한도 - 남은 칸까지만 등록, 이미 있는 곡은 분류에만, 비공개·중복은 건너뜀`() = testApplication {
        // 재생목록: 이미 있는 vid7, 새 곡 vid20~29(10개), 비공개 1, vid20 중복 → 13항목
        val items = listOf(item(7)) + (20..29).map { item(it) } + item(90, available = false) + item(20)
        val fake = FakePlaylistClient(mutableMapOf(PL to YoutubePlaylist(PL, "My Neo Soul Practice Playlist 2026", 13, items)))
        configureApiTestApp(dbConfig, playlistClient = fake)
        val (_, token) = client.newUser()
        for (i in 1..7) client.addSong(token, i)

        val res = client.importPlaylist(token, """{"url":"$PL_URL","newCategory":true}""")
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val body = json(res.bodyAsText())
        assertEquals(true, body["categoryCreated"]!!.jsonPrimitive.boolean)
        assertEquals("My Neo Soul Practice Playlist 2026", body["playlistTitle"]!!.jsonPrimitive.content)
        assertEquals(3, body["imported"]!!.jsonPrimitive.int)
        assertEquals(1, body["alreadyInLibrary"]!!.jsonPrimitive.int)
        assertEquals(7, body["skippedLimit"]!!.jsonPrimitive.int)
        assertEquals(1, body["skippedUnavailable"]!!.jsonPrimitive.int)
        assertEquals(PL to 500, fake.calls.single())

        val songs = client.songs(token)
        assertEquals(10, songs.size)
        val byVid = songs.associateBy { it["videoId"]!!.jsonPrimitive.content }
        assertEquals(setOf(20, 21, 22).map { vid(it) }.toSet() + (1..7).map { vid(it) }, byVid.keys)
        assertEquals("Song 20", byVid[vid(20)]!!["title"]!!.jsonPrimitive.content)
        assertEquals("Ch 20", byVid[vid(20)]!!["artist"]!!.jsonPrimitive.content)
        assertEquals("Mine 7", byVid[vid(7)]!!["title"]!!.jsonPrimitive.content, "이미 있는 곡은 그대로")

        val categoryId = body["categoryId"]!!.jsonPrimitive.content
        val category = client.categories(token).single { it["id"]!!.jsonPrimitive.content == categoryId }
        assertEquals("My Neo Soul Practice", category["name"]!!.jsonPrimitive.content, "제목 앞 20자")
        assertEquals(4, category["songCount"]!!.jsonPrimitive.int)
        for (v in listOf(7, 20, 21, 22)) {
            assertEquals(listOf(categoryId), byVid[vid(v)]!!["categoryIds"]!!.jsonArray.map { it.jsonPrimitive.content })
        }

        // 칸이 다 찬 뒤 다시: 새 곡 0, 있는 곡 4는 분류에만(이미 들어 있어 그대로)
        val again = json(client.importPlaylist(token, """{"url":"$PL_URL","categoryId":"$categoryId"}""").bodyAsText())
        assertEquals(false, again["categoryCreated"]!!.jsonPrimitive.boolean)
        assertEquals(0, again["imported"]!!.jsonPrimitive.int)
        assertEquals(4, again["alreadyInLibrary"]!!.jsonPrimitive.int)
        assertEquals(7, again["skippedLimit"]!!.jsonPrimitive.int)
        assertEquals(10, client.songs(token).size)
    }

    @Test
    fun `P2 기존 분류에 넣기 - 이름 지정 새 분류·중복 이름 409·남의 분류 404`() = testApplication {
        val fake = FakePlaylistClient(mutableMapOf(PL to YoutubePlaylist(PL, "PL", 2, listOf(item(1), item(2)))))
        configureApiTestApp(dbConfig, playlistClient = fake)
        val (_, token) = client.newUser(tier = "pro")
        val (_, other) = client.newUser()
        val otherCat = client.addCategory(other, "남의 것")
        val mine = client.addCategory(token, "기존")

        val res = client.importPlaylist(token, """{"url":"$PL_URL","categoryId":"$mine"}""")
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        assertEquals(mine, json(res.bodyAsText())["categoryId"]!!.jsonPrimitive.content)
        assertEquals(2, json(res.bodyAsText())["imported"]!!.jsonPrimitive.int)

        val named = client.importPlaylist(token, """{"url":"$PL_URL","newCategory":true,"categoryName":"  재즈 입문 "}""")
        assertEquals(HttpStatusCode.OK, named.status, named.bodyAsText())
        val namedId = json(named.bodyAsText())["categoryId"]!!.jsonPrimitive.content
        assertEquals("재즈 입문", client.categories(token).single { it["id"]!!.jsonPrimitive.content == namedId }["name"]!!.jsonPrimitive.content)
        assertEquals(2, json(named.bodyAsText())["alreadyInLibrary"]!!.jsonPrimitive.int)

        val dup = client.importPlaylist(token, """{"url":"$PL_URL","newCategory":true,"categoryName":"기존"}""")
        assertStandardError(dup.bodyAsText(), 409, "CONFLICT")

        val notMine = client.importPlaylist(token, """{"url":"$PL_URL","categoryId":"$otherCat"}""")
        assertStandardError(notMine.bodyAsText(), 404, "NOT_FOUND")
        assertEquals(2, client.categories(token).size, "409·404 요청은 분류를 만들지 않는다")
    }

    @Test
    fun `P3 새 분류인데 분류 칸 없음 - 403 CATEGORY_LIMIT_EXCEEDED, 아무것도 등록 안 함(A4)`() = testApplication {
        val fake = FakePlaylistClient(mutableMapOf(PL to YoutubePlaylist(PL, "PL", 1, listOf(item(1)))))
        configureApiTestApp(dbConfig, playlistClient = fake)
        val (_, token) = client.newUser()
        client.addCategory(token, "A")
        client.addCategory(token, "B")

        val res = client.importPlaylist(token, """{"url":"$PL_URL","newCategory":true}""")
        val err = assertStandardError(res.bodyAsText(), 403, "CATEGORY_LIMIT_EXCEEDED")
        assertEquals("pro", err["detail"]!!.jsonObject["nextTier"]!!.jsonPrimitive.content)
        assertEquals(0, client.songs(token).size)
        assertEquals(2, client.categories(token).size)
    }

    @Test
    fun `P4 잘못된 입력·YouTube 오류`() = testApplication {
        val fake = FakePlaylistClient(mutableMapOf(PL to YoutubePlaylist(PL, "PL", 1, listOf(item(1)))))
        configureApiTestApp(dbConfig, playlistClient = fake)
        val (_, token) = client.newUser()
        val cat = client.addCategory(token, "A")

        assertEquals(HttpStatusCode.Unauthorized, client.importPlaylist(null, """{"url":"$PL_URL","newCategory":true}""").status)
        val badBodies = listOf(
            """{"url":"https://www.youtube.com/watch?v=${vid(1)}","newCategory":true}""",   // list 없음
            """{"url":"https://example.com/playlist?list=$PL","newCategory":true}""",          // YouTube 아님
            """{"url":"javascript:alert(1)","newCategory":true}""",
            """{"url":"$PL_URL"}""",                                                           // 대상 없음
            """{"url":"$PL_URL","newCategory":false}""",
            """{"url":"$PL_URL","categoryId":"$cat","newCategory":true}""",                   // 둘 다
            """{"url":"$PL_URL","categoryId":"$cat","categoryName":"X"}""",                   // 이름은 새 분류와만
            """{"url":"$PL_URL","newCategory":true,"categoryName":"   "}""",
            """{"url":"$PL_URL","categoryId":"not-a-uuid"}""",
            """{"newCategory":true}"""
        )
        for (b in badBodies) {
            assertStandardError(client.importPlaylist(token, b).bodyAsText(), 400, "INVALID_INPUT")
        }
        assertTrue(fake.calls.isEmpty(), "입력 오류는 YouTube를 부르지 않는다")

        val missing = client.importPlaylist(token, """{"url":"https://youtube.com/playlist?list=PLnone","newCategory":true}""")
        assertStandardError(missing.bodyAsText(), 404, "PLAYLIST_NOT_FOUND")
        assertEquals(1, client.categories(token).size, "404면 새 분류도 안 생긴다")

        fake.error = YoutubeDataPlaylistClient.youtubeUnavailable()
        assertStandardError(client.importPlaylist(token, """{"url":"$PL_URL","categoryId":"$cat"}""").bodyAsText(), 503, "YOUTUBE_UNAVAILABLE")
        fake.error = YoutubeDataPlaylistClient.youtubeApiError()
        assertStandardError(client.preview(token, PL_URL).bodyAsText(), 502, "YOUTUBE_API_ERROR")
        assertEquals(0, client.songs(token).size)

        fake.error = null
        // watch?v=…&list=…, youtu.be, music.youtube.com 도 받는다
        for (u in listOf(
            "https://www.youtube.com/watch?v=${vid(1)}&list=$PL&index=2",
            "https://youtu.be/${vid(1)}?list=$PL",
            "https://music.youtube.com/playlist?list=$PL"
        )) {
            assertEquals(HttpStatusCode.OK, client.preview(token, u).status, u)
        }
        assertStandardError(client.preview(token, "https://www.youtube.com/").bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `P5 미리보기 - 남은 곡·분류 칸, 항목은 안 가져옴`() = testApplication {
        val fake = FakePlaylistClient(mutableMapOf(PL to YoutubePlaylist(PL, "Title", 42, (1..3).map { item(it) })))
        configureApiTestApp(dbConfig, playlistClient = fake)
        val (userId, token) = client.newUser()
        client.addSong(token, 1)
        client.addCategory(token, "A")

        val res = client.preview(token, PL_URL)
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        assertEquals(
            buildJsonObject {
                put("playlistId", PL); put("title", "Title"); put("itemCount", 42)
                put("remainingSongSlots", 9); put("remainingCategorySlots", 1)
            },
            json(res.bodyAsText())
        )
        assertEquals(PL to 0, fake.calls.single())

        TestTier.set(db, userId, "pro_plus")
        val pp = json(client.preview(token, PL_URL).bodyAsText())
        assertEquals(149, pp["remainingSongSlots"]!!.jsonPrimitive.int)
        assertEquals(9, pp["remainingCategorySlots"]!!.jsonPrimitive.int)
    }

    @Test
    fun `P6 가져오기 상한 뒤 항목은 skippedLimit에 센다`() = testApplication {
        val fake = FakePlaylistClient(mutableMapOf(PL to YoutubePlaylist(PL, "Big", 600, (1..2).map { item(it) })))
        configureApiTestApp(dbConfig, playlistClient = fake)
        val (_, token) = client.newUser(tier = "pro")
        val body = json(client.importPlaylist(token, """{"url":"$PL_URL","newCategory":true}""").bodyAsText())
        assertEquals(2, body["imported"]!!.jsonPrimitive.int)
        assertEquals(598, body["skippedLimit"]!!.jsonPrimitive.int)
    }
}
