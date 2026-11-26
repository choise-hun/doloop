package ulevelp.note

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.support.*
import java.util.UUID
import kotlin.test.*

/** NT-1 명세 §12.1 F·D·L·A (노트북·자료/블록 노트·호환·주석) */
class NoteWorkspaceApiTest {

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
                        conn.createStatement().use { it.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;") }
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
            UsersTable.deleteAll()
        }
    }

    private suspend fun HttpClient.newUser(tier: String? = null): Pair<UUID, String> {
        val id = UUID.randomUUID()
        val token = TestJwt.token(id)
        val res = get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }
        assertEquals(HttpStatusCode.OK, res.status)
        if (tier != null) TestTier.set(db, id, tier)
        return id to token
    }

    private suspend fun HttpClient.send(method: HttpMethod, path: String, token: String, body: String? = null): HttpResponse =
        request("/api/v1$path") {
            this.method = method
            header(HttpHeaders.Authorization, "Bearer $token")
            if (body != null) { contentType(ContentType.Application.Json); setBody(body) }
        }

    private suspend fun HttpResponse.json(status: HttpStatusCode): JsonObject {
        val text = bodyAsText()
        assertEquals(status, this.status, text)
        assertEquals("no-store", headers[HttpHeaders.CacheControl])
        return Json.parseToJsonElement(text).jsonObject
    }

    private fun JsonObject.str(k: String) = this[k]!!.jsonPrimitive.content
    private fun JsonObject.obj(k: String) = this[k]!!.jsonObject

    private suspend fun HttpClient.folder(token: String, name: String = "기타 교재"): String =
        send(HttpMethod.Post, "/note-folders", token, """{"name":"$name"}""").json(HttpStatusCode.Created).obj("folder").str("id")

    private suspend fun HttpClient.blockDoc(token: String, title: String = "연습 메모", folderId: String? = null): JsonObject {
        val f = if (folderId != null) ""","folderId":"$folderId"""" else ""
        return send(HttpMethod.Post, "/note-docs", token, """{"kind":"block","title":"$title","body":{"v":1,"blocks":[]}$f}""")
            .json(HttpStatusCode.Created).obj("doc")
    }

    private fun insertAiNote(userId: UUID): UUID = transaction(db) {
        val id = UUID.randomUUID()
        NotesTable.insert {
            it[NotesTable.id] = id
            it[NotesTable.userId] = userId
            it[videoId] = "dQw4w9WgXcQ"
            it[title] = "AI 노트"
            it[tags] = listOf("기타")
            it[analysis] = buildJsonObject { put("summary", "x") }
        }
        id
    }

    // ---------------------------------------------------------------- F

    @Test
    fun `NT1-F1 노트북 - 무료 403, PRO 15개 한도, PRO_PLUS 다음 한도, owner 무제한`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, freeToken) = client.newUser()
        val e = assertStandardError(client.send(HttpMethod.Post, "/note-folders", freeToken, """{"name":"a"}""").bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertEquals("note_folders", e["detail"]!!.jsonObject.str("feature"))

        val (pro, proToken) = client.newUser("pro")
        repeat(15) { client.folder(proToken, "n$it") }
        val le = assertStandardError(client.send(HttpMethod.Post, "/note-folders", proToken, """{"name":"x"}""").bodyAsText(), 403, "NOTE_FOLDER_LIMIT_EXCEEDED")
        val d = le["detail"]!!.jsonObject
        assertEquals(15, d["limit"]!!.jsonPrimitive.int)
        assertEquals("pro_plus", d.str("nextTier"))
        assertEquals(30, d["nextLimit"]!!.jsonPrimitive.int)
        assertEquals(15, transaction(db) { NoteFoldersTable.selectAll().where { NoteFoldersTable.userId eq pro }.count() }.toInt())

        // 관리자(role owner)는 무료 티어여도 노트북·노트 수 제한이 없다
        val (owner, ownerToken) = client.newUser()
        TestTier.setRole(db, owner, "owner")
        repeat(31) { client.folder(ownerToken, "o$it") }
        transaction(db) {
            NoteDocsTable.batchInsert((1..2000).toList()) { i ->
                this[NoteDocsTable.userId] = owner; this[NoteDocsTable.kind] = "block"; this[NoteDocsTable.title] = "seed $i"
            }
        }
        client.blockDoc(ownerToken)

        // 입력 검사
        assertStandardError(client.send(HttpMethod.Post, "/note-folders", proToken, """{"name":"   "}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Post, "/note-folders", ownerToken, """{"name":"a","color":"#FF0000"}""").bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `NT1-F2 노트북 순서·이름·삭제 - 전부만 받고, 삭제하면 안의 노트가 기본 노트북으로`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val (_, otherToken) = client.newUser("pro")
        val a = client.folder(token, "A"); val b = client.folder(token, "B"); val c = client.folder(token, "C")
        val foreign = client.folder(otherToken, "남")

        val ordered = client.send(HttpMethod.Put, "/note-folders/order", token, """{"ids":["$c","$a","$b"]}""").json(HttpStatusCode.OK)
        assertEquals(listOf(c, a, b), ordered["folders"]!!.jsonArray.map { it.jsonObject.str("id") })
        assertStandardError(client.send(HttpMethod.Put, "/note-folders/order", token, """{"ids":["$c","$a"]}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Put, "/note-folders/order", token, """{"ids":["$c","$a","$a"]}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Put, "/note-folders/order", token, """{"ids":["$c","$a","$foreign"]}""").bodyAsText(), 404, "NOT_FOUND")

        val renamed = client.send(HttpMethod.Patch, "/note-folders/$a", token, """{"name":"새 이름","color":"ink"}""").json(HttpStatusCode.OK).obj("folder")
        assertEquals("새 이름", renamed.str("name")); assertEquals("ink", renamed.str("color"))
        val cleared = client.send(HttpMethod.Patch, "/note-folders/$a", token, """{"color":null}""").json(HttpStatusCode.OK).obj("folder")
        assertTrue(cleared["color"] is JsonNull)
        assertStandardError(client.send(HttpMethod.Patch, "/note-folders/$foreign", token, """{"name":"x"}""").bodyAsText(), 404, "NOT_FOUND")

        val doc = client.blockDoc(token, folderId = a)
        val ai = insertAiNote(uid)
        client.send(HttpMethod.Put, "/notes/$ai/folder", token, """{"folderId":"$a"}""").json(HttpStatusCode.OK)
        val listed = client.send(HttpMethod.Get, "/note-folders", token).json(HttpStatusCode.OK)["folders"]!!.jsonArray
            .map { it.jsonObject }.single { it.str("id") == a }
        assertEquals(1, listed["docCount"]!!.jsonPrimitive.int); assertEquals(1, listed["aiNoteCount"]!!.jsonPrimitive.int)

        client.send(HttpMethod.Delete, "/note-folders/$a", token).json(HttpStatusCode.OK)
        assertTrue(client.send(HttpMethod.Get, "/note-docs/${doc.str("id")}", token).json(HttpStatusCode.OK).obj("doc")["folderId"] is JsonNull)
        assertTrue(client.send(HttpMethod.Get, "/notes/$ai", token).json(HttpStatusCode.OK).obj("note")["folderId"] is JsonNull)
        assertStandardError(client.send(HttpMethod.Delete, "/note-folders/$a", token).bodyAsText(), 404, "NOT_FOUND")
    }

    // ---------------------------------------------------------------- D

    @Test
    fun `NT1-D1 소유권 - 남의 노트 404, 남의 노트북을 folderId로 넣기 404`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, aToken) = client.newUser("pro")
        val (bId, bToken) = client.newUser("pro")
        val doc = client.blockDoc(aToken).str("id")
        val aFolder = client.folder(aToken)
        for ((m, body) in listOf(HttpMethod.Get to null, HttpMethod.Patch to """{"title":"x"}""", HttpMethod.Delete to null)) {
            assertStandardError(client.send(m, "/note-docs/$doc", bToken, body).bodyAsText(), 404, "NOT_FOUND")
        }
        assertStandardError(client.send(HttpMethod.Post, "/note-docs", bToken, """{"kind":"block","title":"t","folderId":"$aFolder"}""").bodyAsText(), 404, "NOT_FOUND")
        val bDoc = client.blockDoc(bToken).str("id")
        assertStandardError(client.send(HttpMethod.Patch, "/note-docs/$bDoc", bToken, """{"folderId":"$aFolder"}""").bodyAsText(), 404, "NOT_FOUND")
        val bAi = insertAiNote(bId)
        assertStandardError(client.send(HttpMethod.Put, "/notes/$bAi/folder", bToken, """{"folderId":"$aFolder"}""").bodyAsText(), 404, "NOT_FOUND")
        assertStandardError(client.send(HttpMethod.Put, "/notes/$bAi/folder", aToken, """{"folderId":null}""").bodyAsText(), 404, "NOT_FOUND")
        // A 목록에 B 것이 없다
        val aList = client.send(HttpMethod.Get, "/note-docs", aToken).json(HttpStatusCode.OK)["docs"]!!.jsonArray
        assertEquals(listOf(doc), aList.map { it.jsonObject.str("id") })
        // 경로·쿼리 형식
        assertStandardError(client.send(HttpMethod.Get, "/note-docs/not-a-uuid", aToken).bodyAsText(), 404, "NOT_FOUND")
        assertStandardError(client.send(HttpMethod.Get, "/note-docs?folder=xyz", aToken).bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `NT1-D2 노트 수 - 무료 document 403, 블록 30개 한도, AI 노트는 세지 않는다, 폴더 필터`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        val e = assertStandardError(client.send(HttpMethod.Post, "/note-docs", token, """{"kind":"document","title":"교재"}""").bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertEquals("note_files", e["detail"]!!.jsonObject.str("feature"))
        repeat(3) { insertAiNote(uid) }
        transaction(db) {
            NoteDocsTable.batchInsert((1..29).toList()) { i ->
                this[NoteDocsTable.userId] = uid; this[NoteDocsTable.kind] = "block"; this[NoteDocsTable.title] = "seed $i"
            }
        }
        client.blockDoc(token)
        val le = assertStandardError(client.send(HttpMethod.Post, "/note-docs", token, """{"kind":"block","title":"t"}""").bodyAsText(), 403, "NOTE_DOC_LIMIT_EXCEEDED")
        assertEquals(30, le["detail"]!!.jsonObject["limit"]!!.jsonPrimitive.int)
        assertEquals(1000, le["detail"]!!.jsonObject["nextLimit"]!!.jsonPrimitive.int)

        // 입력 검사
        val (_, pt) = client.newUser("pro")
        assertStandardError(client.send(HttpMethod.Post, "/note-docs", pt, """{"kind":"page","title":"t"}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Post, "/note-docs", pt, """{"kind":"block","title":""}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Post, "/note-docs", pt, """{"kind":"document","title":"t","body":{}}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Post, "/note-docs", pt, """{"kind":"block","title":"t","body":[1]}""").bodyAsText(), 400, "INVALID_INPUT")

        // 폴더 필터: 전부 / none / 특정 노트북
        val f = client.folder(pt)
        val inF = client.blockDoc(pt, "in", f).str("id")
        val outF = client.blockDoc(pt, "out").str("id")
        fun ids(o: JsonObject) = o["docs"]!!.jsonArray.map { it.jsonObject.str("id") }.toSet()
        assertEquals(setOf(inF, outF), ids(client.send(HttpMethod.Get, "/note-docs", pt).json(HttpStatusCode.OK)))
        assertEquals(setOf(outF), ids(client.send(HttpMethod.Get, "/note-docs?folder=none", pt).json(HttpStatusCode.OK)))
        assertEquals(setOf(inF), ids(client.send(HttpMethod.Get, "/note-docs?folder=$f", pt).json(HttpStatusCode.OK)))
        assertFalse(client.send(HttpMethod.Get, "/note-docs", pt).bodyAsText().contains("\"body\""))
    }

    @Test
    fun `NT1-D3 본문 rev - 옛 rev 409, 맞는 rev는 +1, 제목만은 그대로, 1MB 초과 413, 동시 저장은 한쪽만`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, token) = client.newUser("pro")
        val id = client.blockDoc(token).str("id")

        val saved = client.send(HttpMethod.Patch, "/note-docs/$id", token, """{"body":{"v":1,"blocks":[{"t":"p"}]},"rev":1}""").json(HttpStatusCode.OK).obj("doc")
        assertEquals(2, saved["rev"]!!.jsonPrimitive.int)
        assertEquals("p", saved.obj("body")["blocks"]!!.jsonArray[0].jsonObject.str("t"))

        val conflict = assertStandardError(client.send(HttpMethod.Patch, "/note-docs/$id", token, """{"body":{"v":1},"rev":1}""").bodyAsText(), 409, "NOTE_REV_CONFLICT")
        assertEquals(2, conflict["detail"]!!.jsonObject["rev"]!!.jsonPrimitive.int)
        assertStandardError(client.send(HttpMethod.Patch, "/note-docs/$id", token, """{"body":{"v":1}}""").bodyAsText(), 400, "INVALID_INPUT")

        val titled = client.send(HttpMethod.Patch, "/note-docs/$id", token, """{"title":"새 제목"}""").json(HttpStatusCode.OK).obj("doc")
        assertEquals(2, titled["rev"]!!.jsonPrimitive.int); assertEquals("새 제목", titled.str("title"))

        val big = "a".repeat(1_048_600)
        assertStandardError(client.send(HttpMethod.Patch, "/note-docs/$id", token, """{"body":{"x":"$big"},"rev":2}""").bodyAsText(), 413, "NOTE_BODY_TOO_LARGE")
        val huge = "a".repeat(1_200_000)
        assertStandardError(client.send(HttpMethod.Patch, "/note-docs/$id", token, """{"body":{"x":"$huge"},"rev":2}""").bodyAsText(), 413, "NOTE_BODY_TOO_LARGE")

        val results = coroutineScope {
            (1..2).map { n -> async { client.send(HttpMethod.Patch, "/note-docs/$id", token, """{"body":{"n":$n},"rev":2}""") } }.awaitAll()
        }
        assertEquals(setOf(HttpStatusCode.OK, HttpStatusCode.Conflict), results.map { it.status }.toSet())
        assertEquals(3, client.send(HttpMethod.Get, "/note-docs/$id", token).json(HttpStatusCode.OK).obj("doc")["rev"]!!.jsonPrimitive.int)
    }

    // ---------------------------------------------------------------- L

    @Test
    fun `NT1-L1 기존 AI 노트 목록·상세는 folderId 칸 하나만 더해진다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        insertAiNote(uid)
        client.blockDoc(token)   // 새 노트는 GET /notes에 나오지 않는다
        val notes = client.send(HttpMethod.Get, "/notes", token).json(HttpStatusCode.OK)["notes"]!!.jsonArray
        assertEquals(1, notes.size)
        val keys = notes[0].jsonObject.keys
        assertEquals(
            setOf("id", "videoId", "url", "title", "channel", "tags", "memo", "headline", "points", "keywords",
                "difficulty", "model", "collectProgressions", "createdAt", "updatedAt", "folderId"),
            keys
        )
        assertEquals("dQw4w9WgXcQ", notes[0].jsonObject.str("videoId"))
        assertTrue(notes[0].jsonObject["folderId"] is JsonNull)
    }

    // ---------------------------------------------------------------- A

    @Test
    fun `NT1-A1 주석 - rev 0 새 쪽, 중복 409, 옛 rev 409, 256KB 초과 413, 남의 파일 404, 쪽 번호 검사`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val (_, bToken) = client.newUser("pro")
        val docId = UUID.fromString(client.blockDoc(token).str("id"))
        val fileId = seedFile(uid, docId)

        val p1 = client.send(HttpMethod.Put, "/note-files/$fileId/annotations/1", token, """{"data":{"v":1,"items":[]},"rev":0}""").json(HttpStatusCode.OK)
        assertEquals(1, p1["rev"]!!.jsonPrimitive.int)
        val dup = assertStandardError(client.send(HttpMethod.Put, "/note-files/$fileId/annotations/1", token, """{"data":{},"rev":0}""").bodyAsText(), 409, "NOTE_REV_CONFLICT")
        assertEquals(1, dup["detail"]!!.jsonObject["rev"]!!.jsonPrimitive.int)
        assertEquals(2, client.send(HttpMethod.Put, "/note-files/$fileId/annotations/1", token, """{"data":{"v":2},"rev":1}""").json(HttpStatusCode.OK)["rev"]!!.jsonPrimitive.int)
        assertStandardError(client.send(HttpMethod.Put, "/note-files/$fileId/annotations/1", token, """{"data":{},"rev":1}""").bodyAsText(), 409, "NOTE_REV_CONFLICT")
        val missing = assertStandardError(client.send(HttpMethod.Put, "/note-files/$fileId/annotations/5", token, """{"data":{},"rev":3}""").bodyAsText(), 409, "NOTE_REV_CONFLICT")
        assertEquals(0, missing["detail"]!!.jsonObject["rev"]!!.jsonPrimitive.int)

        val big = "a".repeat(262_200)
        assertStandardError(client.send(HttpMethod.Put, "/note-files/$fileId/annotations/2", token, """{"data":{"x":"$big"},"rev":0}""").bodyAsText(), 413, "NOTE_ANNOTATION_TOO_LARGE")
        assertStandardError(client.send(HttpMethod.Put, "/note-files/$fileId/annotations/0", token, """{"data":{},"rev":0}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Put, "/note-files/$fileId/annotations/2001", token, """{"data":{},"rev":0}""").bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.send(HttpMethod.Put, "/note-files/$fileId/annotations/2", token, """{"data":[],"rev":0}""").bodyAsText(), 400, "INVALID_INPUT")

        assertStandardError(client.send(HttpMethod.Get, "/note-files/$fileId/annotations", bToken).bodyAsText(), 404, "NOT_FOUND")
        assertStandardError(client.send(HttpMethod.Put, "/note-files/$fileId/annotations/3", bToken, """{"data":{},"rev":0}""").bodyAsText(), 404, "NOT_FOUND")

        val pages = client.send(HttpMethod.Get, "/note-files/$fileId/annotations", token).json(HttpStatusCode.OK)["pages"]!!.jsonArray
        assertEquals(listOf(1), pages.map { it.jsonObject["page"]!!.jsonPrimitive.int })
        client.send(HttpMethod.Delete, "/note-files/$fileId/annotations/1", token).json(HttpStatusCode.OK)
        client.send(HttpMethod.Delete, "/note-files/$fileId/annotations/1", token).json(HttpStatusCode.OK)
        assertTrue(client.send(HttpMethod.Get, "/note-files/$fileId/annotations", token).json(HttpStatusCode.OK)["pages"]!!.jsonArray.isEmpty())
    }

    @Test
    fun `NT1-A2 다운그레이드 뒤 - 기존 노트북·파일 열람·주석·삭제는 되고 새 노트북·새 자료 노트는 403`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val f = client.folder(token)
        val doc = client.send(HttpMethod.Post, "/note-docs", token, """{"kind":"document","title":"교재","folderId":"$f"}""").json(HttpStatusCode.Created).obj("doc")
        val docId = UUID.fromString(doc.str("id"))
        val fileId = seedFile(uid, docId)
        TestTier.set(db, uid, null)

        assertEquals(1, client.send(HttpMethod.Get, "/note-folders", token).json(HttpStatusCode.OK)["folders"]!!.jsonArray.size)
        client.send(HttpMethod.Get, "/note-files/$fileId/url", token).json(HttpStatusCode.OK)
        client.send(HttpMethod.Put, "/note-files/$fileId/annotations/1", token, """{"data":{},"rev":0}""").json(HttpStatusCode.OK)
        client.send(HttpMethod.Patch, "/note-docs/$docId", token, """{"title":"교재 2"}""").json(HttpStatusCode.OK)
        client.blockDoc(token, folderId = f)  // 남은 노트북에 블록 노트는 넣을 수 있다
        assertStandardError(client.send(HttpMethod.Post, "/note-folders", token, """{"name":"b"}""").bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertStandardError(client.send(HttpMethod.Post, "/note-docs", token, """{"kind":"document","title":"t"}""").bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        client.send(HttpMethod.Delete, "/note-docs/$docId", token).json(HttpStatusCode.OK)
    }

    private fun seedFile(userId: UUID, docId: UUID): UUID = transaction(db) {
        val id = UUID.randomUUID()
        val key = "notes/$userId/$docId/$id.pdf"
        NoteFilesTable.insert {
            it[NoteFilesTable.id] = id; it[NoteFilesTable.userId] = userId; it[NoteFilesTable.docId] = docId
            it[storage] = "supabase"; it[storageKey] = key; it[fileName] = "a.pdf"; it[mime] = "application/pdf"; it[sizeBytes] = 10L
        }
        fake.objects[key] = byteArrayOf(1)
        id
    }
}
