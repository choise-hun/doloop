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
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.CurationPolicy
import ulevelp.support.*
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters
import java.util.UUID
import kotlin.test.*

/**
 * M1-4b — 운영자 폴더 관리 API·이달의 곡·쇼케이스·팔로잉·학습 기록 공유·`/curation/home`
 * (개발산출물/결과/M1-1_스키마설계.md §5-2·§5-5 + 완료/진행_티어크레딧.md §3-3 E1~E9).
 * 핵심 확인: 운영자 쓰기마다 감사 행, monthly_pick 6개 400, 학습 기록은 동의한 유료만 + 사용자 글자(곡 제목·메모·이메일·닉네임) 없음
 */
class CurationApiTest {

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
        private const val PRIVATE_NICK = "비공개닉네임"
        private val KST: ZoneId = ZoneId.of("Asia/Seoul")
        private val MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM")
    }

    @BeforeEach
    fun clean() {
        transaction(db) {
            StorageTrashTable.deleteAll()
            VideoTitlesTable.deleteAll()
            SharedFoldersTable.deleteAll() // 운영자 폴더는 users CASCADE로 지워지지 않는다
            UsersTable.deleteAll()
        }
    }

    private fun json(res: String): JsonObject = Json.parseToJsonElement(res).jsonObject
    private fun vid(i: Int) = "vid" + i.toString().padStart(8, '0')
    private fun JsonObject.str(key: String) = this[key]!!.jsonPrimitive.content
    private fun JsonObject.arr(key: String) = this[key]!!.jsonArray.map { it.jsonObject }

    private class U(val id: UUID, val token: String)

    private suspend fun HttpClient.newUser(tier: String? = "pro", name: String? = ""): U {
        val id = UUID.randomUUID()
        val token = TestJwt.token(id, email = "u$id@example.com")
        assertEquals(HttpStatusCode.OK, get("/api/v1/me") { auth(token) }.status)
        if (tier != null) TestTier.set(db, id, tier)
        send(HttpMethod.Patch, "/api/v1/me", token, """{"displayName":"$PRIVATE_NICK"}""")
        val finalName = if (name == "") "u" + id.toString().take(8) else name
        if (finalName != null) {
            val r = send(HttpMethod.Put, "/api/v1/community/me/public-name", token, """{"publicName":"$finalName"}""")
            assertEquals(HttpStatusCode.OK, r.status, r.bodyAsText())
        }
        return U(id, token)
    }

    private suspend fun HttpClient.owner(): U = newUser(tier = null, name = null).also { TestTier.setRole(db, it.id, "owner") }

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

    private suspend fun HttpClient.ok(method: HttpMethod, path: String, token: String?, body: String? = null, status: HttpStatusCode = HttpStatusCode.OK): JsonObject {
        val res = send(method, path, token, body)
        val text = res.bodyAsText()
        assertEquals(status, res.status, text)
        return json(text)
    }

    /** 곡 추가 + 사용자 제목·메모(공개되면 안 되는 값) → songId */
    private suspend fun HttpClient.addSong(token: String, i: Int, categoryIds: List<String> = emptyList()): String {
        val res = send(HttpMethod.Post, "/api/v1/songs", token, """{"videoId":"${vid(i)}","title":"$USER_TITLE $i"}""")
        assertTrue(res.status == HttpStatusCode.Created || res.status == HttpStatusCode.OK, res.bodyAsText())
        val id = json(res.bodyAsText())["song"]!!.jsonObject.str("id")
        val cats = categoryIds.joinToString(",") { "\"$it\"" }
        assertEquals(HttpStatusCode.OK, send(HttpMethod.Patch, "/api/v1/songs/$id", token, """{"memo":"$SECRET_MEMO","categoryIds":[$cats]}""").status)
        return id
    }

    /** 자동 연동 공개 폴더 하나 → folderId */
    private suspend fun HttpClient.autoSyncFolder(u: U, name: String, songs: IntRange): String {
        assertEquals(HttpStatusCode.OK, send(HttpMethod.Patch, "/api/v1/me", u.token, """{"shareAutosync":true}""").status)
        val cat = ok(HttpMethod.Post, "/api/v1/categories", u.token, """{"name":"$name"}""", HttpStatusCode.Created)["category"]!!.jsonObject.str("id")
        for (i in songs) addSong(u.token, i, listOf(cat))
        return ok(HttpMethod.Put, "/api/v1/categories/$cat/share", u.token, """{"isPublic":true,"autoSync":true}""")["share"]!!.jsonObject.str("folderId")
    }

    private suspend fun HttpClient.home(token: String): JsonObject = ok(HttpMethod.Get, "/api/v1/curation/home", token)

    private suspend fun HttpClient.auditActions(owner: U): List<String> =
        ok(HttpMethod.Get, "/api/v1/admin/audit?limit=200", owner.token).arr("rows")
            .filter { it.str("actorId") == owner.id.toString() } // admin_audit은 사용자 삭제와 무관하게 남는다
            .map { it.str("action") }

    private fun assertNoPrivateText(body: String) {
        assertFalse(body.contains(USER_TITLE), "사용자 곡 제목이 공개됨: $body")
        assertFalse(body.contains(SECRET_MEMO), "메모가 공개됨: $body")
        assertFalse(body.contains("@example.com"), "이메일이 공개됨: $body")
        assertFalse(body.contains("\"displayName\""), "display_name 키가 공개됨: $body")
        assertFalse(body.contains(PRIVATE_NICK), "닉네임이 공개됨: $body")
        assertFalse(body.contains("\"memo\""), "memo 키가 공개됨: $body")
    }

    // ---------------------------------------------------------------------------------------------

    @Test
    fun `C1 운영자 큐레이션 폴더 - 초안·항목·공개·삭제, 쓰기마다 감사 행, owner 아님 403`() = testApplication {
        configureApiTestApp(dbConfig, videoMetaClient = FakeVideoMetaClient())
        val owner = client.owner()
        val pro = client.newUser()
        val free = client.newUser(tier = null)

        // owner 아님 403, 토큰 없음 401
        val createBody = """{"kind":"curated","titleI18n":{"ko":"네오소울 입문","en":"Neo-soul basics"},"descriptionI18n":{"ko":"처음 듣기 좋은 곡"},"sortOrder":2,"reason":"첫 큐레이션"}"""
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/admin/shared-folders", pro.token, createBody).bodyAsText(), 403, "FORBIDDEN")
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/admin/shared-folders", null, createBody).bodyAsText(), 401, "UNAUTHORIZED")

        // 잘못된 입력 400 — ko 없음, 모르는 언어 키, 101자, 이유 없음, curated에 month
        for (bad in listOf(
            """{"kind":"curated","titleI18n":{"en":"x"},"reason":"r"}""",
            """{"kind":"curated","titleI18n":{"ko":"x","fr":"y"},"reason":"r"}""",
            """{"kind":"curated","titleI18n":{"ko":"${"가".repeat(101)}"},"reason":"r"}""",
            """{"kind":"curated","titleI18n":{"ko":"x"}}""",
            """{"kind":"curated","titleI18n":{"ko":"x"},"month":"2026-11","reason":"r"}""",
            """{"kind":"user","titleI18n":{"ko":"x"},"reason":"r"}"""
        )) {
            assertStandardError(client.send(HttpMethod.Post, "/api/v1/admin/shared-folders", owner.token, bad).bodyAsText(), 400, "INVALID_INPUT")
        }

        // 만들기 = 비공개 초안
        val created = client.ok(HttpMethod.Post, "/api/v1/admin/shared-folders", owner.token, createBody, HttpStatusCode.Created)
        val folderId = created.str("id")
        assertEquals(false, created["isPublic"]!!.jsonPrimitive.boolean)
        assertEquals("네오소울 입문", created.str("title"))
        assertEquals("Neo-soul basics", created["titleI18n"]!!.jsonObject.str("en"))
        assertTrue(client.home(free.token).arr("curated").isEmpty(), "초안은 홈에 안 보인다")
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/folders/$folderId", free.token).bodyAsText(), 404, "NOT_FOUND")

        // 항목 교체 — 제목·아티스트는 YouTube 값(E1), 운영자 곡 설명 noteI18n
        val itemsBody = """{"items":[
            {"videoId":"${vid(1)}","a":10,"b":40.5,"rate":0.75,"noteI18n":{"ko":"인트로 코드 보이싱"}},
            {"videoId":"${vid(2)}"},
            {"videoId":"${vid(3)}","noteI18n":{"en":"Listen to the bass"}}
        ],"reason":"곡 선정"}"""
        val replaced = client.ok(HttpMethod.Put, "/api/v1/admin/shared-folders/$folderId/items", owner.token, itemsBody)
        assertEquals(3, replaced["folder"]!!.jsonObject["itemCount"]!!.jsonPrimitive.int)
        val firstItem = replaced.arr("items").first()
        assertEquals("Fake Title", firstItem.str("title"))
        assertEquals("인트로 코드 보이싱", firstItem["noteI18n"]!!.jsonObject.str("ko"))
        assertEquals(0.75, firstItem["rate"]!!.jsonPrimitive.double)
        // 항목 입력 오류 400: 중복, 형식, a ≥ b, 설명 301자, user 폴더
        for (bad in listOf(
            """{"items":[{"videoId":"${vid(1)}"},{"videoId":"${vid(1)}"}],"reason":"r"}""",
            """{"items":[{"videoId":"short"}],"reason":"r"}""",
            """{"items":[{"videoId":"${vid(1)}","a":50,"b":40}],"reason":"r"}""",
            """{"items":[{"videoId":"${vid(1)}","noteI18n":{"ko":"${"가".repeat(301)}"}}],"reason":"r"}"""
        )) {
            assertStandardError(client.send(HttpMethod.Put, "/api/v1/admin/shared-folders/$folderId/items", owner.token, bad).bodyAsText(), 400, "INVALID_INPUT")
        }

        // 관리 목록 — 초안 포함 + 항목
        val listed = client.ok(HttpMethod.Get, "/api/v1/admin/shared-folders?kind=curated", owner.token).arr("folders")
        assertEquals(listOf(folderId), listed.map { it["folder"]!!.jsonObject.str("id") })
        assertEquals(3, listed.single().arr("items").size)
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/admin/shared-folders?kind=user", owner.token).bodyAsText(), 400, "INVALID_INPUT")

        // 공개 → 홈·상세에 보인다(owner null, 플레이리스트 카드 필드)
        assertStandardError(client.send(HttpMethod.Patch, "/api/v1/admin/shared-folders/$folderId", owner.token, """{"reason":"x"}""").bodyAsText(), 400, "INVALID_INPUT")
        val published = client.ok(HttpMethod.Patch, "/api/v1/admin/shared-folders/$folderId", owner.token, """{"isPublic":true,"reason":"공개"}""")
        assertNotNull(published["publishedAt"]!!.jsonPrimitive.contentOrNull)
        val card = client.home(free.token).arr("curated").single()
        assertEquals("curated", card.str("kind"))
        assertTrue(card["owner"] is JsonNull)
        assertEquals("처음 듣기 좋은 곡", card["descriptionI18n"]!!.jsonObject.str("ko"))
        assertEquals(listOf(vid(1), vid(2), vid(3)), card["coverVideoIds"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertEquals(listOf("Fake Channel"), card["artists"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertTrue(card["month"] is JsonNull)
        val detail = client.ok(HttpMethod.Get, "/api/v1/community/folders/$folderId", free.token)
        assertEquals(3, detail.arr("items").size)
        // 운영자 폴더 공개 목록(/community/folders)은 user 폴더만 그대로
        assertTrue(client.ok(HttpMethod.Get, "/api/v1/community/folders", free.token).arr("folders").isEmpty())

        // E8: 좋아요(무료도)·복제(유료) 됨, 신고 400
        assertEquals(true, client.ok(HttpMethod.Put, "/api/v1/community/folders/$folderId/like", free.token)["liked"]!!.jsonPrimitive.boolean)
        val cloned = client.ok(HttpMethod.Post, "/api/v1/community/folders/$folderId/clone", pro.token)
        assertEquals(3, cloned["imported"]!!.jsonPrimitive.int)
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/community/folders/$folderId/reports", free.token, """{"reason":"spam"}""").bodyAsText(), 400, "INVALID_INPUT")

        // 순서·제목 고치기, 숨김 → 홈에서 사라짐 → 숨김 해제
        client.ok(HttpMethod.Patch, "/api/v1/admin/shared-folders/$folderId", owner.token, """{"titleI18n":{"ko":"네오소울 첫걸음"},"sortOrder":0,"reason":"제목 다듬기"}""")
        assertEquals("네오소울 첫걸음", client.home(free.token).arr("curated").single().str("title"))
        client.ok(HttpMethod.Patch, "/api/v1/admin/shared-folders/$folderId", owner.token, """{"hidden":true,"hiddenReason":"점검","reason":"잠시 숨김"}""")
        assertTrue(client.home(free.token).arr("curated").isEmpty())
        client.ok(HttpMethod.Patch, "/api/v1/admin/shared-folders/$folderId", owner.token, """{"hidden":false,"reason":"다시 보임"}""")

        // user 폴더: 운영자 필드 400, 삭제 400(숨김을 쓴다), 항목 교체 400
        val userFolder = client.autoSyncFolder(pro, "내폴더", 11..11)
        assertStandardError(client.send(HttpMethod.Patch, "/api/v1/admin/shared-folders/$userFolder", owner.token, """{"titleI18n":{"ko":"x"},"reason":"r"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Delete, "/api/v1/admin/shared-folders/$userFolder", owner.token, """{"reason":"r"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Put, "/api/v1/admin/shared-folders/$userFolder/items", owner.token, """{"items":[],"reason":"r"}""").bodyAsText(), 400, "INVALID_INPUT")

        // 삭제 → 상세 404
        assertEquals(true, client.ok(HttpMethod.Delete, "/api/v1/admin/shared-folders/$folderId", owner.token, """{"reason":"정리"}""")["deleted"]!!.jsonPrimitive.boolean)
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/folders/$folderId", free.token).bodyAsText(), 404, "NOT_FOUND")

        // 감사 행: 성공한 쓰기마다 하나(실패한 요청은 남지 않음)
        val actions = client.auditActions(owner)
        assertEquals(
            listOf("folder_create", "folder_items_replace", "folder_update", "folder_update", "folder_hide", "folder_unhide", "folder_delete"),
            actions.reversed()
        )
    }

    @Test
    fun `C2 이달의 곡 - 5곡 한도(6개 400), 같은 달 409, 이번 달 없으면 지난 달(E4), 다음 달은 아직 안 보임`() = testApplication {
        configureApiTestApp(dbConfig)
        val owner = client.owner()
        val viewer = client.newUser(tier = null)
        val thisMonth = LocalDate.now(KST).withDayOfMonth(1)
        val (last, cur, next) = Triple(thisMonth.minusMonths(1), thisMonth, thisMonth.plusMonths(1))

        suspend fun pick(month: LocalDate): String = client.ok(
            HttpMethod.Post, "/api/v1/admin/shared-folders", owner.token,
            """{"kind":"monthly_pick","titleI18n":{"ko":"${MONTH.format(month)} 이달의 곡"},"month":"${MONTH.format(month)}","reason":"이달의 곡"}""",
            HttpStatusCode.Created
        ).str("id")

        // month 없음·형식 틀림 400
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/admin/shared-folders", owner.token, """{"kind":"monthly_pick","titleI18n":{"ko":"x"},"reason":"r"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Post, "/api/v1/admin/shared-folders", owner.token, """{"kind":"monthly_pick","titleI18n":{"ko":"x"},"month":"2026-13","reason":"r"}""").bodyAsText(), 400, "INVALID_INPUT")

        val lastId = pick(last)
        // 같은 달 409
        assertStandardError(
            client.send(HttpMethod.Post, "/api/v1/admin/shared-folders", owner.token, """{"kind":"monthly_pick","titleI18n":{"ko":"x"},"month":"${MONTH.format(last)}","reason":"r"}""").bodyAsText(),
            409, "CONFLICT"
        )

        // 6곡 400 detail{max:5}, 5곡 200
        val six = (1..6).joinToString(",") { """{"videoId":"${vid(it)}"}""" }
        val e = assertStandardError(client.send(HttpMethod.Put, "/api/v1/admin/shared-folders/$lastId/items", owner.token, """{"items":[$six],"reason":"r"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertEquals(5, e["detail"]!!.jsonObject["max"]!!.jsonPrimitive.int)
        val five = (1..5).joinToString(",") { """{"videoId":"${vid(it)}"}""" }
        client.ok(HttpMethod.Put, "/api/v1/admin/shared-folders/$lastId/items", owner.token, """{"items":[$five],"reason":"선정"}""")

        // 비공개면 홈에 없다
        assertTrue(client.home(viewer.token)["monthlyPick"] is JsonNull)
        client.ok(HttpMethod.Patch, "/api/v1/admin/shared-folders/$lastId", owner.token, """{"isPublic":true,"reason":"공개"}""")

        // 이번 달 것이 없으면 지난 달(E4) — 곡 5개까지 바로
        val home1 = client.home(viewer.token)["monthlyPick"]!!.jsonObject
        assertEquals(lastId, home1["folder"]!!.jsonObject.str("id"))
        assertEquals(MONTH.format(last), home1["folder"]!!.jsonObject.str("month"))
        assertEquals(5, home1.arr("items").size)
        assertEquals("Fake Title", home1.arr("items").first().str("title"))

        // 다음 달 것은 미리 공개해도 아직 안 보인다
        val nextId = pick(next)
        client.ok(HttpMethod.Patch, "/api/v1/admin/shared-folders/$nextId", owner.token, """{"isPublic":true,"reason":"미리"}""")
        assertEquals(lastId, client.home(viewer.token)["monthlyPick"]!!.jsonObject["folder"]!!.jsonObject.str("id"))

        // 이번 달 것을 공개하면 그것
        val curId = pick(cur)
        client.ok(HttpMethod.Patch, "/api/v1/admin/shared-folders/$curId", owner.token, """{"isPublic":true,"reason":"공개"}""")
        assertEquals(curId, client.home(viewer.token)["monthlyPick"]!!.jsonObject["folder"]!!.jsonObject.str("id"))

        // 관리 목록: monthly_pick 3개, 최근 달 먼저
        val months = client.ok(HttpMethod.Get, "/api/v1/admin/shared-folders?kind=monthly_pick", owner.token).arr("folders")
            .map { it["folder"]!!.jsonObject.str("month") }
        assertEquals(listOf(next, cur, last).map { MONTH.format(it) }, months)
    }

    @Test
    fun `C3 쇼케이스·팔로잉 - 크리에이터 먼저, 팔로워 상위, 자동 연동만, 한 사람 최대 칸, 무료 소유자 제외`() = testApplication {
        configureApiTestApp(dbConfig)
        val owner = client.owner()
        val viewer = client.newUser(tier = null)
        val creator = client.newUser(name = "크리에이터")
        val popular = client.newUser(name = "인기")
        val nobody = client.newUser(name = "팔로워없음")
        val manualOnly = client.newUser(name = "수동공개")
        val fan = client.newUser(tier = null)

        assertEquals(HttpStatusCode.OK, client.send(HttpMethod.Put, "/api/v1/admin/users/${creator.id}/creator", owner.token, """{"isCreator":true,"creatorBadge":"재즈","reason":"크리에이터 지정"}""").status)
        // 크리에이터 폴더 4개(한 사람 최대 칸보다 많게) — 자동 연동
        val creatorFolders = (1..4).map { n -> client.autoSyncFolder(creator, "크$n", (n * 10)..(n * 10)) }
        val popularFolder = client.autoSyncFolder(popular, "인기폴더", 50..51)
        client.autoSyncFolder(nobody, "조용한폴더", 60..60)
        // 자동 연동 아닌 공개 폴더는 쇼케이스에 없다
        val manualCat = client.ok(HttpMethod.Post, "/api/v1/categories", manualOnly.token, """{"name":"수동"}""", HttpStatusCode.Created)["category"]!!.jsonObject.str("id")
        client.addSong(manualOnly.token, 70, listOf(manualCat))
        client.ok(HttpMethod.Put, "/api/v1/categories/$manualCat/share", manualOnly.token, """{"isPublic":true}""")

        // 팔로워: popular 2명, manualOnly 3명, creator 0명(크리에이터는 팔로워 없어도 나온다)
        for (f in listOf(viewer, fan)) client.ok(HttpMethod.Put, "/api/v1/community/follows/${popular.id}", f.token)
        for (f in listOf(viewer, fan, nobody)) client.ok(HttpMethod.Put, "/api/v1/community/follows/${manualOnly.id}", f.token)

        val showcase = client.home(viewer.token).arr("showcase")
        val ids = showcase.map { it.str("id") }
        val perUser = CurationPolicy.SHOWCASE_PER_USER_MAX
        // 크리에이터 몫 먼저(최근 게시 순, 최대 perUser칸) → 인기 사용자
        assertEquals(creatorFolders.reversed().take(perUser) + popularFolder, ids)
        assertEquals("재즈", showcase.first()["owner"]!!.jsonObject.str("creatorBadge"))
        assertTrue(showcase.size <= CurationPolicy.SHOWCASE_TOTAL)

        // 팔로잉 줄 = 내가 팔로우한 사람의 공개 폴더(자동 연동 무관)
        val following = client.home(viewer.token).arr("following")
        assertEquals(setOf(popular.id.toString(), manualOnly.id.toString()), following.map { it["owner"]!!.jsonObject.str("id") }.toSet())
        assertTrue(client.home(owner.token).arr("following").isEmpty())

        // 인기 사용자가 무료가 되면 쇼케이스·팔로잉에서 빠진다(정리 전이라도)
        TestTier.set(db, popular.id, null)
        assertFalse(client.home(viewer.token).arr("showcase").any { it.str("id") == popularFolder })
        assertFalse(client.home(viewer.token).arr("following").any { it["owner"]!!.jsonObject.str("id") == popular.id.toString() })

        assertNoPrivateText(client.send(HttpMethod.Get, "/api/v1/curation/home", viewer.token).bodyAsText())
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/curation/home", null).bodyAsText(), 401, "UNAUTHORIZED")
    }

    /** 세션 직접 넣기(날짜·초·반복 + 공개되면 안 되는 메모) */
    private fun seedSession(userId: UUID, songId: String, date: LocalDate, seconds: Int, loops: Int = 0) {
        transaction(db) {
            SessionsTable.insert {
                it[SessionsTable.userId] = userId
                it[SessionsTable.songId] = UUID.fromString(songId)
                it[SessionsTable.date] = date
                it[SessionsTable.seconds] = seconds
                it[SessionsTable.loops] = loops
                it[memo] = SECRET_MEMO
            }
        }
    }

    @Test
    fun `C4 학습 기록 공유 - 동의한 유료만, 12주·연속 일수·이번 주·오늘 곡(YouTube 제목), 사용자 글자 없음`() = testApplication {
        configureApiTestApp(dbConfig, videoMetaClient = FakeVideoMetaClient())
        val viewer = client.newUser(tier = null)
        val sharer = client.newUser(name = "연습왕")
        val silent = client.newUser(name = "비동의")
        val noName = client.newUser(name = null)
        val free = client.newUser(tier = null, name = "무료동의")

        // E7: 켜기 = 유료만 403, 커뮤니티 이름 없음 409, 불리언 아님 400, 끄기는 누구나
        val e = assertStandardError(client.send(HttpMethod.Patch, "/api/v1/me", free.token, """{"sharePracticeLog":true}""").bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertEquals("community", e["detail"]!!.jsonObject.str("feature"))
        assertStandardError(client.send(HttpMethod.Patch, "/api/v1/me", noName.token, """{"sharePracticeLog":true}""").bodyAsText(), 409, "PUBLIC_NAME_REQUIRED")
        assertStandardError(client.send(HttpMethod.Patch, "/api/v1/me", sharer.token, """{"sharePracticeLog":"yes"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertEquals(HttpStatusCode.OK, client.send(HttpMethod.Patch, "/api/v1/me", free.token, """{"sharePracticeLog":false}""").status)
        assertEquals(true, client.ok(HttpMethod.Patch, "/api/v1/me", sharer.token, """{"sharePracticeLog":true}""")["sharePracticeLog"]!!.jsonPrimitive.boolean)
        // 무료가 DB에서 동의만 켜져 있어도 안 보인다
        transaction(db) { ProfilesTable.update({ ProfilesTable.id eq free.id }) { it[sharePracticeLog] = true } }

        val today = LocalDate.now(KST)
        val s1 = client.addSong(sharer.token, 1)
        val s2 = client.addSong(sharer.token, 2)
        seedSession(sharer.id, s1, today, 600, loops = 7)
        seedSession(sharer.id, s2, today, 120, loops = 2)
        seedSession(sharer.id, s1, today.minusDays(1), 300)
        seedSession(sharer.id, s1, today.minusDays(2), 200)
        seedSession(sharer.id, s1, today.minusDays(10), 100)          // 연속 끊김
        seedSession(sharer.id, s1, today.minusDays(84), 999)          // 12주(84일) 밖
        seedSession(sharer.id, s2, today.minusDays(5), 0, loops = 3)  // 0초는 연습한 날이 아니다
        val silentSong = client.addSong(silent.token, 3)
        seedSession(silent.id, silentSong, today, 500)
        val freeSong = client.addSong(free.token, 4)
        seedSession(free.id, freeSong, today, 500)

        val res = client.send(HttpMethod.Get, "/api/v1/community/logs?scope=all", viewer.token)
        val text = res.bodyAsText()
        assertEquals(HttpStatusCode.OK, res.status, text)
        assertNoPrivateText(text)
        val logs = json(text).arr("logs")
        assertEquals(listOf(sharer.id.toString()), logs.map { it["user"]!!.jsonObject.str("id") })
        val log = logs.single()
        assertEquals("연습왕", log["user"]!!.jsonObject.str("publicName"))
        assertEquals(3, log["streakDays"]!!.jsonPrimitive.int)
        val days = log.arr("days")
        assertEquals(
            listOf(today.minusDays(10), today.minusDays(2), today.minusDays(1), today).map { it.toString() },
            days.map { it.str("date") }
        )
        assertEquals(720, days.last()["seconds"]!!.jsonPrimitive.int)
        val weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val expectedWeek = listOf(today to 720, today.minusDays(1) to 300, today.minusDays(2) to 200, today.minusDays(10) to 100)
            .filter { !it.first.isBefore(weekStart) }.sumOf { it.second }
        assertEquals(expectedWeek, log["thisWeekSeconds"]!!.jsonPrimitive.int)
        val todaySongs = log.arr("today")
        assertEquals(listOf(vid(1), vid(2)), todaySongs.map { it.str("videoId") })
        assertEquals("Fake Title", todaySongs.first().str("title"))
        assertEquals(7, todaySongs.first()["loops"]!!.jsonPrimitive.int)
        assertTrue(json(text)["next"] is JsonNull)

        // following: 팔로우 전 비어 있음 → 팔로우하면 보인다
        assertTrue(client.ok(HttpMethod.Get, "/api/v1/community/logs?scope=following", viewer.token).arr("logs").isEmpty())
        client.ok(HttpMethod.Put, "/api/v1/community/follows/${sharer.id}", viewer.token)
        client.ok(HttpMethod.Put, "/api/v1/community/follows/${silent.id}", viewer.token)
        assertEquals(listOf(sharer.id.toString()),
            client.ok(HttpMethod.Get, "/api/v1/community/logs?scope=following", viewer.token).arr("logs").map { it["user"]!!.jsonObject.str("id") })

        // 사용자 페이지 practiceLog: 동의자만
        val page = client.send(HttpMethod.Get, "/api/v1/community/users/${sharer.id}", viewer.token).bodyAsText()
        assertNoPrivateText(page)
        assertEquals(3, json(page)["practiceLog"]!!.jsonObject["streakDays"]!!.jsonPrimitive.int)
        assertTrue(client.ok(HttpMethod.Get, "/api/v1/community/users/${silent.id}", viewer.token)["practiceLog"] is JsonNull)

        // 끄면 바로 안 보인다
        client.ok(HttpMethod.Patch, "/api/v1/me", sharer.token, """{"sharePracticeLog":false}""")
        assertTrue(client.ok(HttpMethod.Get, "/api/v1/community/logs", viewer.token).arr("logs").isEmpty())

        // 입력 오류·인증
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/logs?scope=friends", viewer.token).bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/logs?cursor=-1", viewer.token).bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Get, "/api/v1/community/logs", null).bodyAsText(), 401, "UNAUTHORIZED")
    }
}
