package ulevelp.note

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.NoteFileValidator
import ulevelp.storage.StorageException
import ulevelp.support.*
import java.util.UUID
import kotlin.test.*

/** NT-1 명세 §12.1 U·V·X (첨부 업로드·검증·합산 총량·보상 정리·Drive·삭제 정리) */
class NoteFileApiTest {

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

        val PDF = "%PDF-1.7\n%test\n".toByteArray()
        val PNG = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0)
        const val MB = 1_048_576L
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
        assertEquals(HttpStatusCode.OK, get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }.status)
        if (tier != null) TestTier.set(db, id, tier)
        return id to token
    }

    private suspend fun HttpResponse.json(status: HttpStatusCode): JsonObject {
        val text = bodyAsText()
        assertEquals(status, this.status, text)
        assertEquals("no-store", headers[HttpHeaders.CacheControl])
        return Json.parseToJsonElement(text).jsonObject
    }

    private fun JsonObject.str(k: String) = this[k]!!.jsonPrimitive.content

    private suspend fun HttpClient.doc(token: String, kind: String = "document"): String =
        post("/api/v1/note-docs") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json); setBody("""{"kind":"$kind","title":"교재"}""")
        }.json(HttpStatusCode.Created)["doc"]!!.jsonObject.str("id")

    private suspend fun HttpClient.upload(token: String, docId: String, fileName: String?, bytes: ByteArray): HttpResponse =
        post("/api/v1/note-docs/$docId/files") {
            header(HttpHeaders.Authorization, "Bearer $token")
            setBody(MultiPartFormDataContent(formData {
                append("file", bytes, Headers.build {
                    append(HttpHeaders.ContentType, "application/octet-stream")
                    if (fileName != null) append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
                })
            }))
        }

    private suspend fun HttpClient.drive(token: String, docId: String, body: String): HttpResponse =
        post("/api/v1/note-docs/$docId/files") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json); setBody(body)
        }

    private fun fileRows(userId: UUID) = transaction(db) {
        NoteFilesTable.selectAll().where { NoteFilesTable.userId eq userId }.toList()
    }

    private fun trashKeys() = transaction(db) { StorageTrashTable.selectAll().map { it[StorageTrashTable.storageKey] } }

    /** 크기만 세는 시드(합산 총량 검사용) */
    private fun seedSize(userId: UUID, docId: UUID, size: Long) = transaction(db) {
        NoteFilesTable.insert {
            it[NoteFilesTable.userId] = userId; it[NoteFilesTable.docId] = docId; it[storage] = "supabase"
            it[storageKey] = "notes/$userId/$docId/${UUID.randomUUID()}.pdf"; it[fileName] = "s.pdf"; it[mime] = "application/pdf"; it[sizeBytes] = size
        }
    }

    private fun seedTab(userId: UUID, size: Long) = transaction(db) {
        val id = UUID.randomUUID()
        SongsTable.insert {
            it[SongsTable.id] = id; it[SongsTable.userId] = userId; it[title] = "t"; it[mediaType] = SongsTable.MEDIA_TAB
            it[tabStorageKey] = "tabs/$userId/$id.gp"; it[tabFileName] = "t.gp"; it[tabFileSize] = size; it[tabFormat] = "gp"
        }
    }

    // ---------------------------------------------------------------- U

    @Test
    fun `NT1-U1 PDF·PNG 업로드 201, 키·바이트·Content-Type, 서명 주소 TTL 300, 남은 404`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val (_, bToken) = client.newUser("pro")
        val docId = client.doc(token)
        val pdf = client.upload(token, docId, "교재.pdf", PDF).json(HttpStatusCode.Created)["file"]!!.jsonObject
        val png = client.upload(token, docId, "../p.png", PNG).json(HttpStatusCode.Created)["file"]!!.jsonObject
        assertEquals("application/pdf", pdf.str("mime")); assertEquals("교재.pdf", pdf.str("fileName"))
        assertEquals("p.png", png.str("fileName")); assertEquals(1, png["sortOrder"]!!.jsonPrimitive.int)
        assertFalse(pdf.toString().contains("notes/"))
        val key = "notes/$uid/$docId/${pdf.str("id")}.pdf"
        assertContentEquals(PDF, fake.objects[key])
        assertEquals("application/octet-stream", fake.contentTypes[key])

        val url = client.get("/api/v1/note-files/${pdf.str("id")}/url") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        assertEquals("supabase", url.str("storage")); assertEquals(300, url["expiresIn"]!!.jsonPrimitive.int)
        assertTrue(url.str("url").contains(key))
        assertStandardError(client.get("/api/v1/note-files/${pdf.str("id")}/url") { header(HttpHeaders.Authorization, "Bearer $bToken") }.bodyAsText(), 404, "NOT_FOUND")
        assertStandardError(client.upload(bToken, docId, "x.pdf", PDF).bodyAsText(), 404, "NOT_FOUND")

        val detail = client.get("/api/v1/note-docs/$docId") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)["doc"]!!.jsonObject
        assertEquals(2, detail["files"]!!.jsonArray.size)
        assertEquals(pdf.str("id"), detail["firstFile"]!!.jsonObject.str("id"))
        // 블록 노트에도 붙일 수 있다(NT-3 이미지 블록)
        client.upload(token, client.doc(token, "block"), "b.png", PNG).json(HttpStatusCode.Created)
        fake.failSign = true
        assertStandardError(client.get("/api/v1/note-files/${pdf.str("id")}/url") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText(), 502, "STORAGE_ERROR")
    }

    @Test
    fun `NT1-U2 형식·크기·개수 거부는 업로드와 행이 0`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val docId = client.doc(token)
        val svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"/>".toByteArray()
        for ((name, bytes) in listOf("a.pdf" to PNG, "a.png" to svg, "a.svg" to svg, "a.heic" to PNG, "noext" to PDF, "a.webp" to "RIFF0000WEBX".toByteArray())) {
            assertStandardError(client.upload(token, docId, name, bytes).bodyAsText(), 400, "INVALID_NOTE_FILE")
        }
        assertStandardError(client.upload(token, docId, "e.pdf", ByteArray(0)).bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.upload(token, docId, null, PDF).bodyAsText(), 400, "INVALID_INPUT")
        val over = ByteArray((NoteFileValidator.MAX_FILE_BYTES + 1).toInt()).also { PDF.copyInto(it) }
        assertStandardError(client.upload(token, docId, "big.pdf", over).bodyAsText(), 413, "NOTE_FILE_TOO_LARGE")
        assertTrue(fake.objects.isEmpty()); assertTrue(fileRows(uid).isEmpty())

        val webp = "RIFF0000WEBPVP8 ".toByteArray()
        client.upload(token, docId, "w.webp", webp).json(HttpStatusCode.Created)
        client.upload(token, docId, "j.JPEG", byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0)).json(HttpStatusCode.Created)
        repeat(18) { client.upload(token, docId, "p$it.pdf", PDF).json(HttpStatusCode.Created) }
        assertStandardError(client.upload(token, docId, "21.pdf", PDF).bodyAsText(), 403, "NOTE_FILE_COUNT_EXCEEDED")
        assertEquals(20, fileRows(uid).size); assertEquals(20, fake.objects.size)

        // 무료는 첨부 불가(기존 블록 노트에도)
        val (_, freeToken) = client.newUser()
        val freeBlock = client.doc(freeToken, "block")
        val e = assertStandardError(client.upload(freeToken, freeBlock, "a.pdf", PDF).bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertEquals("note_files", e["detail"]!!.jsonObject.str("feature"))
    }

    @Test
    fun `NT1-U3 파일 총량은 TAB과 합산 - 양쪽 방향 413, 무료 TAB 동작은 그대로`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val docId = client.doc(token)
        seedTab(uid, 400 * MB)
        seedSize(uid, UUID.fromString(docId), 100 * MB - 4)
        val e = assertStandardError(client.upload(token, docId, "a.pdf", PDF).bodyAsText(), 413, "FILE_QUOTA_EXCEEDED")
        val d = e["detail"]!!.jsonObject
        assertEquals(500 * MB, d["limitBytes"]!!.jsonPrimitive.long)
        assertEquals(500 * MB - 4, d["usedBytes"]!!.jsonPrimitive.long)
        assertEquals(1024 * MB, d["nextLimit"]!!.jsonPrimitive.long)

        // 반대 방향: 노트 첨부가 차 있으면 TAB 업로드가 기존 코드로 막힌다(usedBytes = 합산)
        val gp = requireNotNull(javaClass.getResourceAsStream("/tab/A.gp")).readBytes()
        val (u2, t2) = client.newUser("pro")
        seedSize(u2, UUID.fromString(client.doc(t2)), 500 * MB - 10)
        val te = assertStandardError(client.post("/api/v1/songs/tab") {
            header(HttpHeaders.Authorization, "Bearer $t2")
            setBody(MultiPartFormDataContent(formData {
                append("file", gp, Headers.build { append(HttpHeaders.ContentDisposition, "filename=\"A.gp\"") })
            }))
        }.bodyAsText(), 413, "TAB_QUOTA_EXCEEDED")
        assertEquals(500 * MB - 10, te["detail"]!!.jsonObject["usedBytes"]!!.jsonPrimitive.long)

        // /me 사용량: tabBytes는 TAB만, fileBytes는 합산
        val me = client.get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText()
        val usage = Json.parseToJsonElement(me).jsonObject["usage"]!!.jsonObject
        assertEquals(400 * MB, usage["tabBytes"]!!.jsonPrimitive.long)
        assertEquals(100 * MB - 4, usage["noteFileBytes"]!!.jsonPrimitive.long)
        assertEquals(500 * MB - 4, usage["fileBytes"]!!.jsonPrimitive.long)
        assertEquals(1, usage["noteDocs"]!!.jsonPrimitive.int)
        val limits = Json.parseToJsonElement(me).jsonObject["limits"]!!.jsonObject
        assertEquals(500 * MB, limits["fileBytes"]!!.jsonPrimitive.long); assertEquals(500 * MB, limits["tabBytes"]!!.jsonPrimitive.long)

        // owner는 총량 제한 없음
        val (owner, ownerToken) = client.newUser()
        TestTier.setRole(db, owner, "owner")
        val od = client.doc(ownerToken)
        seedSize(owner, UUID.fromString(od), 5_000 * MB)
        client.upload(ownerToken, od, "o.pdf", PDF).json(HttpStatusCode.Created)
    }

    @Test
    fun `NT1-U4 동시 업로드 2건이 한도 경계를 넘으면 1건만 성공하고 실패한 쪽 파일은 지워진다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val docId = client.doc(token)
        seedSize(uid, UUID.fromString(docId), 500 * MB - PDF.size - 1)   // 하나만 더 들어간다
        fake.uploadDelayMs = 300L
        val results = coroutineScope {
            listOf(async { client.upload(token, docId, "c1.pdf", PDF) }, async { client.upload(token, docId, "c2.pdf", PDF) }).awaitAll()
        }
        assertEquals(1, results.count { it.status == HttpStatusCode.Created }, results.map { it.status }.toString())
        assertStandardError(results.single { it.status != HttpStatusCode.Created }.bodyAsText(), 413, "FILE_QUOTA_EXCEEDED")
        assertEquals(1, fake.deleted.size); assertEquals(1, fake.objects.size)
        assertEquals(2, fileRows(uid).size)
    }

    @Test
    fun `NT1-U5 보상 정리 - 트랜잭션 B 실패면 삭제, 삭제도 실패면 휴지통, 업로드 응답 유실이면 502와 삭제`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val docId = client.doc(token)
        // 업로드 직후 다른 경로로 총량이 찬다 → 트랜잭션 B 재검사 실패
        fake.onUploadSuccess = { seedSize(uid, UUID.fromString(docId), 500 * MB) }
        assertStandardError(client.upload(token, docId, "a.pdf", PDF).bodyAsText(), 413, "FILE_QUOTA_EXCEEDED")
        assertEquals(1, fake.deleted.size); assertTrue(fake.deleted.single().startsWith("notes/$uid/$docId/"))

        val (u2, t2) = client.newUser("pro")
        val d2 = client.doc(t2)
        fake.onUploadSuccess = { seedSize(u2, UUID.fromString(d2), 500 * MB) }
        fake.failDelete = true
        assertStandardError(client.upload(t2, d2, "a.pdf", PDF).bodyAsText(), 413, "FILE_QUOTA_EXCEEDED")
        val trash = trashKeys()
        assertEquals(1, trash.size); assertTrue(trash.single().startsWith("notes/$u2/$d2/"))

        fake.failDelete = false
        val (_, t3) = client.newUser("pro")
        val d3 = client.doc(t3)
        var stored: String? = null
        fake.onUploadSuccess = { key -> stored = key; throw StorageException("Upload response lost") }
        assertStandardError(client.upload(t3, d3, "a.pdf", PDF).bodyAsText(), 502, "STORAGE_ERROR")
        assertEquals(assertNotNull(stored), fake.deleted.last())
    }

    @Test
    fun `NT1-U6 업로드 중 노트가 지워지면 404이고 올린 파일은 지워진다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val docId = client.doc(token)
        fake.onUploadSuccess = { transaction(db) { NoteDocsTable.deleteWhere { NoteDocsTable.id eq UUID.fromString(docId) } } }
        assertStandardError(client.upload(token, docId, "a.pdf", PDF).bodyAsText(), 404, "NOT_FOUND")
        assertEquals(1, fake.deleted.size); assertTrue(fake.objects.isEmpty()); assertTrue(fileRows(uid).isEmpty())
    }

    // ---------------------------------------------------------------- V

    @Test
    fun `NT1-V1 Drive 참조 - 무료 403, 유료 등록·총량 미산입·주소는 파일 ID, 입력 검사`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, freeToken) = client.newUser()
        val freeDoc = client.doc(freeToken, "block")
        val ok = """{"storage":"drive","storageKey":"1AbC_d-EfGh","fileName":"교재.pdf","mime":"application/pdf","sizeBytes":104857600}"""
        val e = assertStandardError(client.drive(freeToken, freeDoc, ok).bodyAsText(), 403, "TIER_UPGRADE_REQUIRED")
        assertEquals("drive", e["detail"]!!.jsonObject.str("feature"))

        val (uid, token) = client.newUser("pro")
        val docId = client.doc(token)
        val file = client.drive(token, docId, ok).json(HttpStatusCode.Created)["file"]!!.jsonObject
        assertEquals("drive", file.str("storage"))
        val url = client.get("/api/v1/note-files/${file.str("id")}/url") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        assertEquals("1AbC_d-EfGh", url.str("storageKey")); assertTrue(url["url"] is JsonNull)
        val usage = Json.parseToJsonElement(client.get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText())
            .jsonObject["usage"]!!.jsonObject
        assertEquals(0L, usage["fileBytes"]!!.jsonPrimitive.long)

        val bad = listOf(
            """{"storage":"supabase","storageKey":"1AbC_d-EfGh","fileName":"a.pdf","mime":"application/pdf","sizeBytes":1}""" to "INVALID_INPUT",
            """{"storage":"drive","storageKey":"a/b","fileName":"a.pdf","mime":"application/pdf","sizeBytes":1}""" to "INVALID_INPUT",
            """{"storage":"drive","storageKey":"1AbC_d-EfGh","fileName":"a.png","mime":"application/pdf","sizeBytes":1}""" to "INVALID_NOTE_FILE",
            """{"storage":"drive","storageKey":"1AbC_d-EfGh","fileName":"a.svg","mime":"image/svg+xml","sizeBytes":1}""" to "INVALID_NOTE_FILE",
            """{"storage":"drive","storageKey":"1AbC_d-EfGh","fileName":"a.pdf","mime":"application/pdf","sizeBytes":0}""" to "INVALID_INPUT",
            """{"storage":"drive","storageKey":"1AbC_d-EfGh","fileName":"a.pdf","mime":"application/pdf","sizeBytes":"1"}""" to "INVALID_INPUT"
        )
        for ((body, code) in bad) assertStandardError(client.drive(token, docId, body).bodyAsText(), 400, code)
        assertEquals(1, fileRows(uid).size)
    }

    // ---------------------------------------------------------------- X

    @Test
    fun `NT1-X1 노트·파일 삭제 - supabase 키만 휴지통을 거쳐 바로 지워지고 Drive는 행만`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val (_, bToken) = client.newUser("pro")
        val docId = client.doc(token)
        val a = client.upload(token, docId, "a.pdf", PDF).json(HttpStatusCode.Created)["file"]!!.jsonObject.str("id")
        client.upload(token, docId, "b.png", PNG).json(HttpStatusCode.Created)
        client.drive(token, docId, """{"storage":"drive","storageKey":"1AbC_d-EfGh","fileName":"c.pdf","mime":"application/pdf","sizeBytes":5}""")
            .json(HttpStatusCode.Created)
        client.put("/api/v1/note-files/$a/annotations/1") {
            header(HttpHeaders.Authorization, "Bearer $token"); contentType(ContentType.Application.Json); setBody("""{"data":{},"rev":0}""")
        }.json(HttpStatusCode.OK)

        assertStandardError(client.delete("/api/v1/note-files/$a") { header(HttpHeaders.Authorization, "Bearer $bToken") }.bodyAsText(), 404, "NOT_FOUND")
        client.delete("/api/v1/note-files/$a") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        assertEquals(listOf("notes/$uid/$docId/$a.pdf"), fake.deleted.toList())
        assertEquals(0L, transaction(db) { NoteAnnotationsTable.selectAll().count() })

        assertStandardError(client.delete("/api/v1/note-docs/$docId") { header(HttpHeaders.Authorization, "Bearer $bToken") }.bodyAsText(), 404, "NOT_FOUND")
        client.delete("/api/v1/note-docs/$docId") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        assertEquals(2, fake.deleted.size)
        assertTrue(fake.deleted.none { it.contains("1AbC") })
        assertTrue(fake.objects.isEmpty()); assertTrue(fileRows(uid).isEmpty()); assertTrue(trashKeys().isEmpty())

        // 바로 지우지 못하면 휴지통에 남아 cron이 다시 지운다
        val d2 = client.doc(token)
        val f2 = client.upload(token, d2, "x.pdf", PDF).json(HttpStatusCode.Created)["file"]!!.jsonObject.str("id")
        fake.failDelete = true
        client.delete("/api/v1/note-files/$f2") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        assertEquals(listOf("notes/$uid/$d2/$f2.pdf"), trashKeys())
    }

    @Test
    fun `NT1-X2 계정 삭제 - 녹음·TAB·노트 첨부 키가 모두 휴지통에 들어간다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser("pro")
        val docId = client.doc(token)
        val f = client.upload(token, docId, "a.pdf", PDF).json(HttpStatusCode.Created)["file"]!!.jsonObject.str("id")
        client.drive(token, docId, """{"storage":"drive","storageKey":"1AbC_d-EfGh","fileName":"c.pdf","mime":"application/pdf","sizeBytes":5}""")
            .json(HttpStatusCode.Created)
        seedTab(uid, 10)
        client.delete("/api/v1/me") {
            header(HttpHeaders.Authorization, "Bearer $token"); contentType(ContentType.Application.Json); setBody("""{"confirmText":"삭제합니다"}""")
        }
        val trash = trashKeys()
        assertTrue("notes/$uid/$docId/$f.pdf" in trash, trash.toString())
        assertTrue(trash.any { it.startsWith("tabs/$uid/") }, trash.toString())
        assertTrue(trash.none { it.contains("1AbC") })
        assertTrue(transaction(db) { NoteFilesTable.selectAll().where { NoteFilesTable.userId eq uid }.empty() })
    }
}
