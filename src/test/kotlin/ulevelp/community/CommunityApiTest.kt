package ulevelp.community

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.BannedWords
import ulevelp.service.PlaylistItem
import ulevelp.service.YoutubePlaylist
import ulevelp.support.*
import java.util.UUID
import kotlin.test.*

/**
 * M1-4a — 내 폴더 게시·자동 연동·복제·좋아요·팔로우·신고 (개발산출물/결과/M1-1_스키마설계.md §2-2·§4·§5-5 + N1~N3).
 * 핵심 확인: 공개 응답에 사용자가 쓴 곡 제목·메모·이메일·display_name이 없다(공개 제목·공개 이름만)
 */
class CommunityApiTest {

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

        private const val SECRET_MEMO = "비밀메모-절대공개금지"
        private const val USER_TITLE = "내가붙인제목"
    }

    @BeforeEach
    fun clean() {
        transaction(db) {
            StorageTrashTable.deleteAll()
            VideoTitlesTable.deleteAll()
            UsersTable.deleteAll()
        }
    }

    private fun json(res: String): JsonObject = Json.parseToJsonElement(res).jsonObject
    private fun vid(i: Int) = "vid" + i.toString().padStart(8, '0')

    private class U(val id: UUID, val token: String, val displayName: String?)

    private suspend fun HttpClient.newUser(tier: String? = "pro", displayName: String? = "기타맨"): U {
        val id = UUID.randomUUID()
        val token = TestJwt.token(id, email = "u$id@example.com")
        assertEquals(HttpStatusCode.OK, get("/api/v1/me") { auth(token) }.status)
        if (tier != null) TestTier.set(db, id, tier)
        if (displayName != null) patchMe(token, """{"displayName":"$displayName"}""")
        return U(id, token, displayName)
    }

    private fun HttpRequestBuilder.auth(token: String?) {
        token?.let { header(HttpHeaders.Authorization, "Bearer $it") }
    }

    private suspend fun HttpClient.send(method: HttpMethod, path: String, token: String?, body: String? = null): HttpResponse =
        request(path) {
            this.method = method
            auth(token)
            if (body != null) {
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }

    private suspend fun HttpClient.patchMe(token: String, body: String): HttpResponse {
        val res = send(HttpMethod.Patch, "/api/v1/me", token, body)
        return res
    }

    /** 곡 추가 + 사용자 제목·메모(공개되면 안 되는 값) */
    private suspend fun HttpClient.addSong(token: String, i: Int, categoryIds: List<String> = emptyList()): String {
        val res = send(HttpMethod.Post, "/api/v1/songs", token, """{"videoId":"${vid(i)}","title":"$USER_TITLE $i"}""")
        assertTrue(res.status == HttpStatusCode.Created || res.status == HttpStatusCode.OK, res.bodyAsText())
        val id = json(res.bodyAsText())["song"]!!.jsonObject["id"]!!.jsonPrimitive.content
        val cats = categoryIds.joinToString(",") { "\"$it\"" }
        val upd = send(HttpMethod.Patch, "/api/v1/songs/$id", token, """{"memo":"$SECRET_MEMO","categoryIds":[$cats]}""")
        assertEquals(HttpStatusCode.OK, upd.status, upd.bodyAsText())
        return id
    }

    private suspend fun HttpClient.addCategory(token: String, name: String): String {
        val res = send(HttpMethod.Post, "/api/v1/categories", token, """{"name":"$name"}""")
        assertEquals(HttpStatusCode.Created, res.status, res.bodyAsText())
        return json(res.bodyAsText())["category"]!!.jsonObject["id"]!!.jsonPrimitive.content
    }

    private suspend fun HttpClient.share(token: String, categoryId: String, body: String): HttpResponse =
        send(HttpMethod.Put, "/api/v1/categories/$categoryId/share", token, body)

    /** 분류 하나 + 곡 [songs]개를 만들어 공개 → folderId */
    private fun firstPublish(owner: U, extra: String = "") = """{"isPublic":true,"publicName":"${owner.displayName}"$extra}"""

    private suspend fun HttpClient.publishedFolder(owner: U, name: String = "네오소울", songs: IntRange = 1..2, body: String = firstPublish(owner)): Pair<String, String> {
        val cat = addCategory(owner.token, name)
        for (i in songs) addSong(owner.token, i, listOf(cat))
        val res = share(owner.token, cat, body)
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        return cat to json(res.bodyAsText())["share"]!!.jsonObject["folderId"]!!.jsonPrimitive.content
    }

    private suspend fun HttpClient.detail(token: String, folderId: String): HttpResponse =
        send(HttpMethod.Get, "/api/v1/community/folders/$folderId", token)

    private suspend fun HttpClient.items(token: String, folderId: String): List<JsonObject> {
        val res = detail(token, folderId)
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        return json(res.bodyAsText())["items"]!!.jsonArray.map { it.jsonObject }
    }

    private suspend fun HttpClient.listIds(token: String, sort: String = "recent"): List<String> {
        val res = send(HttpMethod.Get, "/api/v1/community/folders?sort=$sort", token)
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        return json(res.bodyAsText())["folders"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }
    }

    /** 공개 응답에 나오면 안 되는 사용자 글자 */
    private fun assertNoPrivateText(body: String, vararg extra: String) {
        assertFalse(body.contains(USER_TITLE), "사용자 곡 제목이 공개됨: $body")
        assertFalse(body.contains(SECRET_MEMO), "메모가 공개됨: $body")
        assertFalse(body.contains("@example.com"), "이메일이 공개됨: $body")
        assertFalse(body.contains("\"displayName\""), "display_name 키가 공개됨: $body")
        assertFalse(body.contains("\"memo\""), "memo 키가 공개됨: $body")
        for (e in extra) assertFalse(body.contains(e), "'$e'가 공개됨: $body")
    }

    // ---------------------------------------------------------------------------------------------

    @Test
    fun `G1 게시 - 공개본은 YouTube 제목·공개 이름만, 사용자 제목·메모·이메일 없음, 공개 이름은 고정`() = testApplication {
        configureApiTestApp(dbConfig, videoMetaClient = FakeVideoMetaClient())
        val a = client.newUser(displayName = "기타맨")
        val viewer = client.newUser(tier = null, displayName = "구경꾼")
        val (cat, folderId) = client.publishedFolder(a)

        val mine = json(client.send(HttpMethod.Get, "/api/v1/categories/$cat/share", a.token).bodyAsText())["share"]!!.jsonObject
        assertEquals("네오소울", mine["title"]!!.jsonPrimitive.content)
        assertEquals(true, mine["isPublic"]!!.jsonPrimitive.boolean)
        assertEquals(2, mine["itemCount"]!!.jsonPrimitive.int)
        assertEquals("기타맨", mine["publicName"]!!.jsonPrimitive.content)

        // 무료 사용자도 열람
        assertEquals(listOf(folderId), client.listIds(viewer.token))
        val res = client.detail(viewer.token, folderId)
        val text = res.bodyAsText()
        assertEquals(HttpStatusCode.OK, res.status, text)
        assertNoPrivateText(text)
        val body = json(text)
        assertEquals("기타맨", body["folder"]!!.jsonObject["owner"]!!.jsonObject["publicName"]!!.jsonPrimitive.content)
        val items = body["items"]!!.jsonArray.map { it.jsonObject }
        assertEquals(listOf(vid(2), vid(1)).toSet(), items.map { it["videoId"]!!.jsonPrimitive.content }.toSet())
        assertTrue(items.all { it["title"]!!.jsonPrimitive.content == "Fake Title" && it["artist"]!!.jsonPrimitive.content == "Fake Channel" })

        // 목록 응답도 같은 원칙
        assertNoPrivateText(client.send(HttpMethod.Get, "/api/v1/community/folders", viewer.token).bodyAsText())

        // N2: 닉네임을 바꿔도 공개 이름은 그대로
        assertEquals(HttpStatusCode.OK, client.patchMe(a.token, """{"displayName":"새닉네임"}""").status)
        val after = client.detail(viewer.token, folderId).bodyAsText()
        assertTrue(after.contains("기타맨"))
        assertNoPrivateText(after, "새닉네임")
        val me = json(client.send(HttpMethod.Get, "/api/v1/me", a.token).bodyAsText())
        assertEquals("기타맨", me["publicName"]!!.jsonPrimitive.content)

        // 토큰 없음 401
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/folders", null).bodyAsText(), 401, "UNAUTHORIZED")
    }

    @Test
    fun `G2 게시 거부 - 무료 403, 금칙어 400, 닉네임 없음 409, 남의 분류 404, 잘못된 입력 400`() = testApplication {
        configureApiTestApp(dbConfig)
        val free = client.newUser(tier = null)
        val freeCat = client.addCategory(free.token, "연습")
        val r1 = client.share(free.token, freeCat, """{"isPublic":true}""")
        val e1 = assertStandardError(r1.bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertEquals("community", e1["detail"]!!.jsonObject["feature"]!!.jsonPrimitive.content)

        val pro = client.newUser()
        val cat = client.addCategory(pro.token, "연습")
        // N1 금칙어: 띄어쓰기·기호로 돌려도 걸린다
        val r2 = client.share(pro.token, cat, """{"isPublic":true,"title":"씨 발.연습"}""")
        assertEquals("title", assertStandardError(r2.bodyAsText(), 400, "BANNED_WORD")["detail"]!!.jsonObject["field"]!!.jsonPrimitive.content)
        val r3 = client.share(pro.token, cat, """{"isPublic":true,"title":"F.u.C.k jazz"}""")
        assertStandardError(r3.bodyAsText(), 400, "BANNED_WORD")
        // 음악 용어는 통과(오탐 방지): bass, class, 색소폰
        assertFalse(BannedWords.contains("Bass class 색소폰 입문"))

        // 닉네임 없음 409 / 닉네임 금칙어 400(field displayName)
        val noName = client.newUser(displayName = "")
        val c2 = client.addCategory(noName.token, "연습")
        assertStandardError(client.share(noName.token, c2, """{"isPublic":true}""").bodyAsText(), 409, "DISPLAY_NAME_REQUIRED")
        client.patchMe(noName.token, """{"displayName":"병 신"}""")
        val r4 = client.share(noName.token, c2, """{"isPublic":true}""")
        assertEquals("displayName", assertStandardError(r4.bodyAsText(), 400, "BANNED_WORD")["detail"]!!.jsonObject["field"]!!.jsonPrimitive.content)
        transaction(db) { assertNull(ProfilesTable.selectAll().where { ProfilesTable.id eq noName.id }.single()[ProfilesTable.publicName]) }

        // 남의 분류 404, isPublic 없음 400, 제목 21자 400, 공개한 적 없는데 비공개 404
        assertStandardError(client.share(pro.token, freeCat, """{"isPublic":true}""").bodyAsText(), 404, "NOT_FOUND")
        assertStandardError(client.share(pro.token, cat, """{}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.share(pro.token, cat, """{"isPublic":true,"title":"${"가".repeat(21)}"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.share(pro.token, cat, """{"isPublic":false}""").bodyAsText(), 404, "NOT_FOUND")
        assertTrue(transaction(db) { SharedFoldersTable.selectAll().count() } == 0L)

        // 첫 게시: 공개 이름 확인 없음·다름 → 409, detail에 지금 닉네임(가입 때 Google 이름·이메일 앞부분이 자동으로 들어가 있다)
        val auto = client.newUser(displayName = null)
        val c3 = client.addCategory(auto.token, "연습")
        val r5 = assertStandardError(client.share(auto.token, c3, """{"isPublic":true}""").bodyAsText(), 409, "PUBLIC_NAME_CONFIRM_REQUIRED")
        val hinted = r5["detail"]!!.jsonObject["displayName"]!!.jsonPrimitive.content
        assertEquals("u${auto.id}", hinted) // 테스트 JWT 이메일 앞부분
        assertStandardError(client.share(auto.token, c3, """{"isPublic":true,"publicName":"다른이름"}""").bodyAsText(), 409, "PUBLIC_NAME_CONFIRM_REQUIRED")
        assertTrue(transaction(db) { SharedFoldersTable.selectAll().count() } == 0L)
        assertEquals(HttpStatusCode.OK, client.share(auto.token, c3, """{"isPublic":true,"publicName":"$hinted"}""").status)
    }

    @Test
    fun `G3 자동 연동 - 설정 꺼짐 409, 켜면 원본 변경 직후 반영, 끄면 중단, 수동 게시는 다시 게시 때만`() = testApplication {
        configureApiTestApp(dbConfig)
        val a = client.newUser()
        val viewer = client.newUser(tier = null)
        val cat = client.addCategory(a.token, "자동")
        client.addSong(a.token, 1, listOf(cat))

        assertStandardError(client.share(a.token, cat, """{"isPublic":true,"autoSync":true}""").bodyAsText(), 409, "SHARE_AUTOSYNC_OFF")
        // 무료는 설정 켜기 403
        assertStandardError(client.patchMe(viewer.token, """{"shareAutosync":true}""").bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertStandardError(client.patchMe(a.token, """{"shareAutosync":"yes"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertEquals(HttpStatusCode.OK, client.patchMe(a.token, """{"shareAutosync":true}""").status)
        val res = client.share(a.token, cat, firstPublish(a, ",\"autoSync\":true"))
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val folderId = json(res.bodyAsText())["share"]!!.jsonObject["folderId"]!!.jsonPrimitive.content
        assertEquals(1, client.items(viewer.token, folderId).size)

        // 곡을 분류에 넣으면 바로 반영
        val s2 = client.addSong(a.token, 2, listOf(cat))
        assertEquals(setOf(vid(1), vid(2)), client.items(viewer.token, folderId).map { it["videoId"]!!.jsonPrimitive.content }.toSet())
        // 연습 저장(구간·배속) → 공개본 a·b·rate 반영
        val save = client.send(HttpMethod.Post, "/api/v1/practice/save", a.token,
            """{"songId":"$s2","pos":10,"a":12.5,"b":30,"rate":0.75,"date":"2026-11-06"}""")
        assertEquals(HttpStatusCode.OK, save.status, save.bodyAsText())
        val it2 = client.items(viewer.token, folderId).single { it["videoId"]!!.jsonPrimitive.content == vid(2) }
        assertEquals(12.5, it2["a"]!!.jsonPrimitive.double)
        assertEquals(30.0, it2["b"]!!.jsonPrimitive.double)
        assertEquals(0.75, it2["rate"]!!.jsonPrimitive.double)
        // 곡 삭제 → 빠짐
        assertEquals(HttpStatusCode.OK, client.send(HttpMethod.Delete, "/api/v1/songs/$s2", a.token).status)
        assertEquals(listOf(vid(1)), client.items(viewer.token, folderId).map { it["videoId"]!!.jsonPrimitive.content })
        // 재생목록 가져오기로 넣은 곡도 반영(+ YouTube 제목 캐시)
        // (아래 G3b에서 따로)

        // 설정 끄기 → 모든 폴더 자동 연동 정지, 마지막 공개본은 남음
        assertEquals(HttpStatusCode.OK, client.patchMe(a.token, """{"shareAutosync":false}""").status)
        client.addSong(a.token, 3, listOf(cat))
        assertEquals(listOf(vid(1)), client.items(viewer.token, folderId).map { it["videoId"]!!.jsonPrimitive.content })
        val mine = json(client.send(HttpMethod.Get, "/api/v1/categories/$cat/share", a.token).bodyAsText())["share"]!!.jsonObject
        assertEquals(false, mine["autoSync"]!!.jsonPrimitive.boolean)
        assertEquals(true, mine["isPublic"]!!.jsonPrimitive.boolean)

        // 수동: 다시 게시하면 반영
        val rep = client.send(HttpMethod.Post, "/api/v1/categories/$cat/share/republish", a.token, """{}""")
        assertEquals(HttpStatusCode.OK, rep.status, rep.bodyAsText())
        assertEquals(setOf(vid(1), vid(3)), client.items(viewer.token, folderId).map { it["videoId"]!!.jsonPrimitive.content }.toSet())
        // 다시 게시 무료 403, 공개본 없는 분류 404
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/categories/$cat/share/republish", viewer.token, """{}""").bodyAsText(), 404, "NOT_FOUND")
        val other = client.addCategory(a.token, "없음")
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/categories/$other/share/republish", a.token, """{}""").bodyAsText(), 404, "NOT_FOUND")
    }

    @Test
    fun `G3b 재생목록 가져오기 - 자동 연동 반영, YouTube 제목 캐시`() = testApplication {
        val pl = "PLtest_0123456789"
        val fake = FakePlaylistClient(mutableMapOf(pl to YoutubePlaylist(pl, "PL", 2, listOf(
            PlaylistItem(vid(40), "YT Title 40", "YT Ch", true),
            PlaylistItem(vid(41), "YT Title 41", "YT Ch", true)
        ))))
        configureApiTestApp(dbConfig, playlistClient = fake)
        val a = client.newUser()
        val viewer = client.newUser(tier = null)
        client.patchMe(a.token, """{"shareAutosync":true}""")
        val (cat, folderId) = client.publishedFolder(a, songs = 1..1, body = firstPublish(a, ",\"autoSync\":true"))
        val imp = client.send(HttpMethod.Post, "/api/v1/songs/import-playlist", a.token,
            """{"url":"https://www.youtube.com/playlist?list=$pl","categoryId":"$cat"}""")
        assertEquals(HttpStatusCode.OK, imp.status, imp.bodyAsText())
        val items = client.items(viewer.token, folderId)
        assertEquals(3, items.size)
        assertEquals("YT Title 40", items.single { it["videoId"]!!.jsonPrimitive.content == vid(40) }["title"]!!.jsonPrimitive.content)
    }

    @Test
    fun `G4 비공개·다운그레이드 - 비공개는 404, 무료 소유자 폴더는 숨김, 관리 API 다운그레이드는 비공개로`() = testApplication {
        configureApiTestApp(dbConfig)
        val a = client.newUser()
        val viewer = client.newUser(tier = null)
        val (cat, folderId) = client.publishedFolder(a)

        // 비공개 → 404, 목록에서 빠짐. 무료도 비공개는 할 수 있다
        assertEquals(HttpStatusCode.OK, client.share(a.token, cat, """{"isPublic":false}""").status)
        assertStandardError(client.detail(viewer.token, folderId).bodyAsText(), 404, "NOT_FOUND")
        assertEquals(emptyList(), client.listIds(viewer.token))
        assertEquals(HttpStatusCode.OK, client.share(a.token, cat, """{"isPublic":true}""").status)
        assertEquals(listOf(folderId), client.listIds(viewer.token))

        // 정리 전이라도 소유자가 무료면 안 보인다
        TestTier.set(db, a.id, null)
        assertEquals(emptyList(), client.listIds(viewer.token))
        assertStandardError(client.detail(viewer.token, folderId).bodyAsText(), 404, "NOT_FOUND")
        TestTier.set(db, a.id, "pro")

        // owner가 override 해제 → 실제 티어 free → 같은 트랜잭션에서 비공개·자동 연동 정지(Q8)
        val owner = client.newUser(tier = null, displayName = "운영자")
        TestTier.setRole(db, owner.id, "owner")
        val res = client.send(HttpMethod.Put, "/api/v1/admin/users/${a.id}/tier-override", owner.token,
            """{"tier":null,"until":null,"reason":"다운그레이드 시험"}""")
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val row = transaction(db) { SharedFoldersTable.selectAll().where { SharedFoldersTable.id eq UUID.fromString(folderId) }.single() }
        assertEquals(false, row[SharedFoldersTable.isPublic])
        assertEquals(false, row[SharedFoldersTable.autoSync])
        TestTier.set(db, a.id, "pro")
        assertEquals(emptyList(), client.listIds(viewer.token)) // 재구독해도 "다시 게시" 전엔 비공개

        // 분류 삭제 → 공개본 삭제(A9)
        assertEquals(HttpStatusCode.OK, client.send(HttpMethod.Delete, "/api/v1/categories/$cat", a.token).status)
        assertEquals(0L, transaction(db) { SharedFoldersTable.selectAll().count() })
    }

    @Test
    fun `G5 좋아요 - 무료도 가능, 멱등, 자기 폴더 400, 정렬`() = testApplication {
        configureApiTestApp(dbConfig)
        val a = client.newUser()
        val viewer = client.newUser(tier = null)
        val (_, f1) = client.publishedFolder(a, name = "하나", songs = 1..1)
        val (_, f2) = client.publishedFolder(a, name = "둘", songs = 2..2)

        repeat(2) {
            val r = client.send(HttpMethod.Put, "/api/v1/community/folders/$f1/like", viewer.token)
            assertEquals(HttpStatusCode.OK, r.status, r.bodyAsText())
            assertEquals(1, json(r.bodyAsText())["likeCount"]!!.jsonPrimitive.int)
        }
        val list = json(client.send(HttpMethod.Get, "/api/v1/community/folders?sort=likes", viewer.token).bodyAsText())["folders"]!!.jsonArray
        assertEquals(f1, list[0].jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals(true, list[0].jsonObject["likedByMe"]!!.jsonPrimitive.boolean)
        assertEquals(false, list[1].jsonObject["likedByMe"]!!.jsonPrimitive.boolean)
        assertEquals(f2, list[1].jsonObject["id"]!!.jsonPrimitive.content)

        repeat(2) {
            val r = client.send(HttpMethod.Delete, "/api/v1/community/folders/$f1/like", viewer.token)
            assertEquals(0, json(r.bodyAsText())["likeCount"]!!.jsonPrimitive.int)
        }
        assertStandardError(client.send(HttpMethod.Put, "/api/v1/community/folders/$f1/like", a.token).bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Put, "/api/v1/community/folders/${UUID.randomUUID()}/like", viewer.token).bodyAsText(), 404, "NOT_FOUND")
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/folders?sort=hot", viewer.token).bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `G6 복제 - 새 분류에 YouTube 제목으로, 이미 있는 곡은 분류에만, 이름 겹침, 무료 403, 분류 칸 없음 403`() = testApplication {
        configureApiTestApp(dbConfig)
        val a = client.newUser()
        val (_, folderId) = client.publishedFolder(a, songs = 1..3)
        val b = client.newUser(displayName = "복제자")
        client.addSong(b.token, 2)                 // 이미 있는 곡
        client.addCategory(b.token, "네오소울")     // 이름 겹침

        val res = client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/clone", b.token)
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val body = json(res.bodyAsText())
        assertEquals(2, body["imported"]!!.jsonPrimitive.int)
        assertEquals(1, body["alreadyInLibrary"]!!.jsonPrimitive.int)
        assertEquals(0, body["skippedLimit"]!!.jsonPrimitive.int)
        val newCat = body["categoryId"]!!.jsonPrimitive.content
        val cats = json(client.send(HttpMethod.Get, "/api/v1/categories", b.token).bodyAsText())["categories"]!!.jsonArray
        assertEquals("네오소울 (2)", cats.single { it.jsonObject["id"]!!.jsonPrimitive.content == newCat }.jsonObject["name"]!!.jsonPrimitive.content)
        val songs = json(client.send(HttpMethod.Get, "/api/v1/songs", b.token).bodyAsText())["songs"]!!.jsonArray.map { it.jsonObject }
        val cloned = songs.filter { it["videoId"]!!.jsonPrimitive.content in setOf(vid(1), vid(3)) }
        assertEquals(2, cloned.size)
        assertTrue(cloned.all { it["title"]!!.jsonPrimitive.content == "Fake Title" && it["memo"]!!.jsonPrimitive.content == "" })
        assertTrue(songs.filter { it["categoryIds"]!!.jsonArray.any { c -> c.jsonPrimitive.content == newCat } }.size == 3)
        transaction(db) {
            assertEquals(1, SharedFoldersTable.selectAll().where { SharedFoldersTable.id eq UUID.fromString(folderId) }.single()[SharedFoldersTable.cloneCount])
        }

        // 무료 403 / 내 폴더 400 / 분류 칸 없음 403(아무것도 안 만듦)
        val free = client.newUser(tier = null)
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/clone", free.token).bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/clone", a.token).bodyAsText(), 400, "INVALID_INPUT")
        val full = client.newUser()
        repeat(7) { client.addCategory(full.token, "분류$it") } // pro 분류 7개
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/clone", full.token).bodyAsText(), 403, "CATEGORY_LIMIT_EXCEEDED")
        assertEquals(0, json(client.send(HttpMethod.Get, "/api/v1/songs", full.token).bodyAsText())["songs"]!!.jsonArray.size)
    }

    @Test
    fun `G7 팔로우·사용자 페이지 - 무료도 팔로우, 멱등, 자기 400, 게시 안 한 사람 404, 이메일·닉네임 없음`() = testApplication {
        configureApiTestApp(dbConfig)
        val a = client.newUser(displayName = "기타맨")
        client.publishedFolder(a)
        val viewer = client.newUser(tier = null, displayName = "구경꾼")

        repeat(2) {
            val r = client.send(HttpMethod.Put, "/api/v1/community/follows/${a.id}", viewer.token)
            assertEquals(HttpStatusCode.OK, r.status, r.bodyAsText())
            assertEquals(1L, json(r.bodyAsText())["followerCount"]!!.jsonPrimitive.long)
        }
        val follows = client.send(HttpMethod.Get, "/api/v1/community/follows", viewer.token).bodyAsText()
        val users = json(follows)["users"]!!.jsonArray
        assertEquals("기타맨", users.single().jsonObject["publicName"]!!.jsonPrimitive.content)
        assertEquals(1, users.single().jsonObject["folderCount"]!!.jsonPrimitive.int)
        assertNoPrivateText(follows)

        val page = client.send(HttpMethod.Get, "/api/v1/community/users/${a.id}", viewer.token)
        val pageText = page.bodyAsText()
        assertEquals(HttpStatusCode.OK, page.status, pageText)
        assertNoPrivateText(pageText)
        val pj = json(pageText)
        assertEquals(true, pj["followingByMe"]!!.jsonPrimitive.boolean)
        assertEquals(1, pj["folders"]!!.jsonArray.size)
        assertFalse(pj.containsKey("email"))

        assertStandardError(client.send(HttpMethod.Put, "/api/v1/community/follows/${viewer.id}", viewer.token).bodyAsText(), 400, "INVALID_INPUT")
        // 게시한 적 없는 사람(공개 이름 없음) 404
        assertStandardError(client.send(HttpMethod.Put, "/api/v1/community/follows/${viewer.id}", a.token).bodyAsText(), 404, "NOT_FOUND")
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/users/${viewer.id}", a.token).bodyAsText(), 404, "NOT_FOUND")

        val un = client.send(HttpMethod.Delete, "/api/v1/community/follows/${a.id}", viewer.token)
        assertEquals(0L, json(un.bodyAsText())["followerCount"]!!.jsonPrimitive.long)
    }

    @Test
    fun `G8 신고·owner 처리 - 중복 409, owner 숨김·처리·공개 이름 초기화, 감사 행`() = testApplication {
        configureApiTestApp(dbConfig)
        val a = client.newUser(displayName = "기타맨")
        val (cat, folderId) = client.publishedFolder(a)
        val viewer = client.newUser(tier = null)
        val owner = client.newUser(tier = null, displayName = "운영자")
        TestTier.setRole(db, owner.id, "owner")

        val r1 = client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/reports", viewer.token, """{"reason":"spam","detail":"광고 같아요"}""")
        assertEquals(HttpStatusCode.Created, r1.status, r1.bodyAsText())
        val reportId = json(r1.bodyAsText())["reportId"]!!.jsonPrimitive.long
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/reports", viewer.token, """{"reason":"other"}""").bodyAsText(), 409, "ALREADY_REPORTED")
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/reports", viewer.token, """{"reason":"boring"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/reports", a.token, """{"reason":"spam"}""").bodyAsText(), 400, "INVALID_INPUT")

        // 관리 API: owner 아님 403
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/admin/reports", viewer.token).bodyAsText(), 403, "FORBIDDEN")
        val list = json(client.send(HttpMethod.Get, "/api/v1/admin/reports", owner.token).bodyAsText())["rows"]!!.jsonArray
        assertEquals("광고 같아요", list.single().jsonObject["detail"]!!.jsonPrimitive.content)
        assertEquals("기타맨", list.single().jsonObject["ownerPublicName"]!!.jsonPrimitive.content)

        // 숨김 → 목록·상세에서 빠짐, 소유자는 hidden=true로 본다
        val hide = client.send(HttpMethod.Patch, "/api/v1/admin/shared-folders/$folderId", owner.token, """{"hidden":true,"hiddenReason":"스팸","reason":"신고 확인"}""")
        assertEquals(HttpStatusCode.OK, hide.status, hide.bodyAsText())
        assertStandardError(client.detail(viewer.token, folderId).bodyAsText(), 404, "NOT_FOUND")
        assertEquals(emptyList(), client.listIds(viewer.token))
        assertEquals(true, json(client.send(HttpMethod.Get, "/api/v1/categories/$cat/share", a.token).bodyAsText())["share"]!!.jsonObject["hidden"]!!.jsonPrimitive.boolean)
        assertStandardError(client.send(HttpMethod.Patch, "/api/v1/admin/shared-folders/$folderId", owner.token, """{"reason":"x"}""").bodyAsText(), 400, "INVALID_INPUT")

        // 신고 처리 → 다시 처리 409
        val done = client.send(HttpMethod.Patch, "/api/v1/admin/reports/$reportId", owner.token, """{"status":"resolved","reason":"숨김 처리"}""")
        assertEquals(HttpStatusCode.OK, done.status, done.bodyAsText())
        assertStandardError(client.send(HttpMethod.Patch, "/api/v1/admin/reports/$reportId", owner.token, """{"status":"dismissed","reason":"x"}""").bodyAsText(), 409, "CONFLICT")
        assertStandardError(client.send(HttpMethod.Patch, "/api/v1/admin/reports/$reportId", owner.token, """{"status":"open","reason":"x"}""").bodyAsText(), 400, "INVALID_INPUT")

        // 공개 이름 초기화 → 사용자 페이지 404 → 다음 게시 때 그때 닉네임으로
        val reset = client.send(HttpMethod.Delete, "/api/v1/admin/users/${a.id}/public-name", owner.token, """{"reason":"부적절한 이름"}""")
        assertEquals(HttpStatusCode.OK, reset.status, reset.bodyAsText())
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/users/${a.id}", viewer.token).bodyAsText(), 404, "NOT_FOUND")
        client.patchMe(a.token, """{"displayName":"새이름"}""")
        assertStandardError(client.share(a.token, cat, """{"isPublic":true}""").bodyAsText(), 409, "PUBLIC_NAME_CONFIRM_REQUIRED")
        val again = client.share(a.token, cat, """{"isPublic":true,"publicName":"새이름"}""")
        assertEquals("새이름", json(again.bodyAsText())["share"]!!.jsonObject["publicName"]!!.jsonPrimitive.content)

        val actions = json(client.send(HttpMethod.Get, "/api/v1/admin/audit?targetUserId=${a.id}", owner.token).bodyAsText())["rows"]!!.jsonArray
            .map { it.jsonObject["action"]!!.jsonPrimitive.content }
        assertEquals(listOf("public_name_reset", "report_resolve", "folder_hide"), actions)
    }
}
