package ulevelp.song

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.ProfileService
import ulevelp.service.SongService
import ulevelp.service.TabFileValidator
import ulevelp.service.TabFormat
import ulevelp.service.TabSongService
import ulevelp.service.TabUploadInput
import ulevelp.storage.StorageException
import ulevelp.support.*
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.*

/** TB-1 명세 §11.1 U·F·D·S */
class TabSongApiTest {

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

    private fun fixture(name: String): ByteArray =
        requireNotNull(javaClass.getResourceAsStream("/tab/$name")) { name }.readBytes()

    private suspend fun HttpClient.newUser(): Pair<UUID, String> {
        val id = UUID.randomUUID()
        val token = TestJwt.token(id)
        val res = get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $token") }
        assertEquals(HttpStatusCode.OK, res.status)
        return id to token
    }

    private suspend fun HttpClient.upload(
        token: String,
        fileName: String?,
        bytes: ByteArray,
        title: String? = null,
        artist: String? = null,
        titleAsBlob: Boolean = false
    ): HttpResponse = post("/api/v1/songs/tab") {
        header(HttpHeaders.Authorization, "Bearer $token")
        setBody(MultiPartFormDataContent(formData {
            if (title != null) {
                if (titleAsBlob) append("title", title.toByteArray(), Headers.build {
                    append(HttpHeaders.ContentDisposition, "filename=\"blob\"")
                }) else append("title", title)
            }
            if (artist != null) append("artist", artist)
            append("file", bytes, Headers.build {
                append(HttpHeaders.ContentType, "application/octet-stream")
                if (fileName != null) append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
            })
        }))
    }

    private suspend fun HttpResponse.json(status: HttpStatusCode): JsonObject {
        val text = bodyAsText()
        assertEquals(status, this.status, text)
        assertEquals("no-store", headers[HttpHeaders.CacheControl])
        return Json.parseToJsonElement(text).jsonObject
    }

    private fun songRows(userId: UUID) = transaction(db) {
        SongsTable.selectAll().where { SongsTable.userId eq userId }.toList()
    }

    private fun insertTabs(userId: UUID, count: Int, sizeEach: Long = 1234L) = transaction(db) {
        SongsTable.batchInsert((1..count).toList()) { i ->
            val id = UUID.randomUUID()
            this[SongsTable.id] = id
            this[SongsTable.userId] = userId
            this[SongsTable.title] = "seed $i"
            this[SongsTable.mediaType] = SongsTable.MEDIA_TAB
            this[SongsTable.tabStorageKey] = "tabs/$userId/$id.gp"
            this[SongsTable.tabFileName] = "seed$i.gp"
            this[SongsTable.tabFileSize] = sizeEach
            this[SongsTable.tabFormat] = "gp"
        }
    }

    // ---------------------------------------------------------------- U

    @Test
    fun `TB1-U1 gp xml mxl 업로드 201과 저장소 키·바이트·Content-Type`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        for ((name, fmt) in listOf("A.gp" to "gp", "B.xml" to "xml", "B.mxl" to "mxl")) {
            val bytes = fixture(name)
            val song = client.upload(token, name, bytes).json(HttpStatusCode.Created)["song"]!!.jsonObject
            val id = song["id"]!!.jsonPrimitive.content
            assertEquals("tab", song["mediaType"]!!.jsonPrimitive.content)
            assertTrue(song["videoId"] is JsonNull)
            assertEquals(fmt, song["tabFormat"]!!.jsonPrimitive.content)
            assertEquals(name, song["tabFileName"]!!.jsonPrimitive.content)
            assertEquals(bytes.size.toLong(), song["tabFileSize"]!!.jsonPrimitive.long)
            assertEquals(name.substringBeforeLast('.'), song["title"]!!.jsonPrimitive.content)
            assertTrue(song["resumeUrl"]!!.jsonPrimitive.content.endsWith("practice.html?song=$id"))
            val key = "tabs/$uid/$id.$fmt"
            assertContentEquals(bytes, fake.objects[key])
            assertEquals("application/octet-stream", fake.contentTypes[key])
            assertFalse(song.toString().contains("tabs/"))
        }
        assertEquals(3, songRows(uid).size)
    }

    @Test
    fun `TB1-U2 제목·아티스트 파트, 경로 들어간 이름, 한국어 이름, Blob 텍스트 파트`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, token) = client.newUser()
        val gp = fixture("A.gp")
        val s1 = client.upload(token, "x.gp", gp, title = "  Autumn Leaves ", artist = "Jim").json(HttpStatusCode.Created)["song"]!!.jsonObject
        assertEquals("Autumn Leaves", s1["title"]!!.jsonPrimitive.content)
        assertEquals("Jim", s1["artist"]!!.jsonPrimitive.content)
        val s2 = client.upload(token, "../../evil.gp", gp).json(HttpStatusCode.Created)["song"]!!.jsonObject
        assertEquals("evil.gp", s2["tabFileName"]!!.jsonPrimitive.content)
        // quoted-string 안의 역슬래시는 이스케이프해서 보낸다(전송값 C:\a\b.gp)
        val s3 = client.upload(token, "C:\\\\a\\\\b.gp", gp).json(HttpStatusCode.Created)["song"]!!.jsonObject
        assertEquals("b.gp", s3["tabFileName"]!!.jsonPrimitive.content)
        // U3(명세 §13): 브라우저처럼 filename="…"에 UTF-8 한국어를 그대로 보낸다
        val s4 = client.upload(token, "연습곡.gp", gp).json(HttpStatusCode.Created)["song"]!!.jsonObject
        assertEquals("연습곡.gp", s4["tabFileName"]!!.jsonPrimitive.content)
        assertEquals("연습곡", s4["title"]!!.jsonPrimitive.content)
        val s5 = client.upload(token, "y.gp", gp, title = "블롭 제목", titleAsBlob = true).json(HttpStatusCode.Created)["song"]!!.jsonObject
        assertEquals("블롭 제목", s5["title"]!!.jsonPrimitive.content)
        assertStandardError(client.upload(token, "z.gp", gp, title = "가".repeat(301)).bodyAsText(), 400, "INVALID_INPUT")
        assertStandardError(client.upload(token, "z.gp", gp, title = "a".repeat(5000)).bodyAsText(), 400, "INVALID_INPUT")
    }

    @Test
    fun `TB1-U3 형식 거부는 저장소 업로드와 DB 행이 0`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        val cases = listOf(
            Triple("a.gp5", fixture("A.gp"), "extension"),
            Triple("a.txt", fixture("B.xml"), "extension"),
            Triple("noext", fixture("A.gp"), "extension"),
            Triple("broken.gp", fixture("broken.gp"), "content"),
            Triple("x.gp", fixture("B.xml"), "content"),
            Triple("x.xml", fixture("B.mxl"), "content"),
            Triple("x.xml", "<!DOCTYPE a [<!ENTITY x \"y\">]><score-partwise/>".toByteArray(), "content")
        )
        for ((name, bytes, reason) in cases) {
            val e = assertStandardError(client.upload(token, name, bytes).bodyAsText(), 400, "TAB_FORMAT_INVALID")
            assertEquals(reason, e["detail"]!!.jsonObject["reason"]!!.jsonPrimitive.content, name)
        }
        assertStandardError(client.upload(token, null, fixture("A.gp")).bodyAsText(), 400, "INVALID_INPUT")
        assertTrue(fake.objects.isEmpty())
        assertTrue(songRows(uid).isEmpty())
    }

    @Test
    fun `TB1-U4 크기 - 10MB 초과 413, Content-Length 초과 413, 빈 파일 400, 정확히 10MB는 형식 검사로 간다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        val over = ByteArray((TabFileValidator.MAX_FILE_BYTES + 1).toInt())
        assertStandardError(client.upload(token, "big.gp", over).bodyAsText(), 413, "TAB_TOO_LARGE")
        val exact = ByteArray(TabFileValidator.MAX_FILE_BYTES.toInt())
        assertStandardError(client.upload(token, "big.gp", exact).bodyAsText(), 400, "TAB_FORMAT_INVALID")
        val cl = client.post("/api/v1/songs/tab") {
            header(HttpHeaders.Authorization, "Bearer $token")
            // 형식이 깨진 12MB 본문: Content-Length 사전 거부가 없으면 multipart 파싱 실패로 400이 된다
            contentType(ContentType.MultiPart.FormData.withParameter("boundary", "b"))
            setBody(ByteArray(12 * 1024 * 1024))
        }
        assertStandardError(cl.bodyAsText(), 413, "TAB_TOO_LARGE")
        assertStandardError(client.upload(token, "e.gp", ByteArray(0)).bodyAsText(), 400, "INVALID_INPUT")
        val notMultipart = client.post("/api/v1/songs/tab") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json); setBody("{}")
        }
        assertStandardError(notMultipart.bodyAsText(), 400, "INVALID_INPUT")
        assertTrue(fake.objects.isEmpty())
        assertTrue(songRows(uid).isEmpty())
    }

    @Test
    fun `TB1-U5 한도 - 무료 TAB 5곡·곡 한도·총량·owner·다운그레이드`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val gp = fixture("A.gp")

        // 무료 TAB 5곡 뒤 6번째 403
        val (free, freeToken) = client.newUser()
        insertTabs(free, 5)
        val e = assertStandardError(client.upload(freeToken, "a.gp", gp).bodyAsText(), 403, "TAB_LIMIT_EXCEEDED")
        val d = e["detail"]!!.jsonObject
        assertEquals(5, d["limit"]!!.jsonPrimitive.int); assertEquals(5, d["used"]!!.jsonPrimitive.int)
        assertEquals("free", d["tier"]!!.jsonPrimitive.content); assertEquals("pro", d["nextTier"]!!.jsonPrimitive.content)
        assertTrue(d["nextLimit"] is JsonNull)

        // 곡 한도(무료 100)가 다 차면 SONG_LIMIT_EXCEEDED
        val (full, fullToken) = client.newUser()
        transaction(db) {
            SongsTable.batchInsert((0 until 100).toList()) { i ->
                this[SongsTable.userId] = full; this[SongsTable.title] = "y$i"; this[SongsTable.videoId] = "v" + i.toString().padStart(10, '0')
            }
        }
        assertStandardError(client.upload(fullToken, "a.gp", gp).bodyAsText(), 403, "SONG_LIMIT_EXCEEDED")

        // 총량(무료 20MB) 초과 413
        val (q, qToken) = client.newUser()
        insertTabs(q, 4, sizeEach = 5_242_880L)
        val qe = assertStandardError(client.upload(qToken, "a.gp", gp).bodyAsText(), 413, "TAB_QUOTA_EXCEEDED")
        assertEquals(20_971_520L, qe["detail"]!!.jsonObject["limitBytes"]!!.jsonPrimitive.long)
        assertEquals(20_971_520L, qe["detail"]!!.jsonObject["usedBytes"]!!.jsonPrimitive.long)
        assertEquals(524_288_000L, qe["detail"]!!.jsonObject["nextLimit"]!!.jsonPrimitive.long)

        // owner는 TAB 한도 없음
        val (owner, ownerToken) = client.newUser()
        TestTier.setRole(db, owner, "owner")
        insertTabs(owner, 6, sizeEach = 5_242_880L)
        client.upload(ownerToken, "a.gp", gp).json(HttpStatusCode.Created)

        // 다운그레이드: 유료 때 만든 6곡은 남고 새 업로드만 막힌다
        val (down, downToken) = client.newUser()
        TestTier.set(db, down, "pro")
        repeat(6) { client.upload(downToken, "p$it.gp", gp).json(HttpStatusCode.Created) }
        TestTier.set(db, down, null)
        val list = client.get("/api/v1/songs?include=tab") { header(HttpHeaders.Authorization, "Bearer $downToken") }.json(HttpStatusCode.OK)
        assertEquals(6, list["songs"]!!.jsonArray.size)
        assertStandardError(client.upload(downToken, "p7.gp", gp).bodyAsText(), 403, "TAB_LIMIT_EXCEEDED")

        // /me 사용량·한도에 TAB 칸
        val me = client.get("/api/v1/me") { header(HttpHeaders.Authorization, "Bearer $freeToken") }.bodyAsText()
        val meJson = Json.parseToJsonElement(me).jsonObject.toString()
        assertTrue(meJson.contains("\"tabSongs\":5"), meJson)
        assertTrue(meJson.contains("\"tabBytes\":20971520"), meJson)
    }

    @Test
    fun `TB1-U6 동시 업로드 2건은 한도 안에서 정확히 1건만 성공하고 실패한 쪽 파일은 지워진다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        insertTabs(uid, 4)
        fake.uploadDelayMs = 300L
        val results = coroutineScope {
            listOf(async { client.upload(token, "c1.gp", fixture("A.gp")) }, async { client.upload(token, "c2.gp", fixture("A.gp")) }).awaitAll()
        }
        val statuses = results.map { it.status }
        assertEquals(1, statuses.count { it == HttpStatusCode.Created }, statuses.toString())
        val loser = results.single { it.status != HttpStatusCode.Created }
        assertStandardError(loser.bodyAsText(), 403, "TAB_LIMIT_EXCEEDED")
        assertEquals(5, transaction(db) { SongsTable.selectAll().where { (SongsTable.userId eq uid) and (SongsTable.mediaType eq "tab") }.count() }.toInt())
        assertEquals(1, fake.deleted.size)
        assertEquals(1, fake.objects.size)
    }

    @Test
    fun `TB1-U7 보상 정리 - 트랜잭션 B 실패면 파일 삭제, 삭제도 실패면 휴지통, 업로드 실패면 502`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        // 업로드 직후 다른 경로로 TAB 5곡이 생긴 상황 → 트랜잭션 B 재검사 실패
        fake.onUploadSuccess = { insertTabs(uid, 5) }
        assertStandardError(client.upload(token, "a.gp", fixture("A.gp")).bodyAsText(), 403, "TAB_LIMIT_EXCEEDED")
        assertEquals(1, fake.deleted.size)
        assertTrue(fake.deleted.single().startsWith("tabs/$uid/"))

        val (uid2, token2) = client.newUser()
        fake.onUploadSuccess = { insertTabs(uid2, 5) }
        fake.failDelete = true
        assertStandardError(client.upload(token2, "a.gp", fixture("A.gp")).bodyAsText(), 403, "TAB_LIMIT_EXCEEDED")
        val trash = transaction(db) { StorageTrashTable.selectAll().map { it[StorageTrashTable.storageKey] } }
        assertEquals(1, trash.size)
        assertTrue(trash.single().startsWith("tabs/$uid2/"))

        fake.onUploadSuccess = null; fake.failDelete = false; fake.failUpload = true
        val (uid3, token3) = client.newUser()
        var failedUploadKey: String? = null
        fake.onUploadStart = { failedUploadKey = it }
        assertStandardError(client.upload(token3, "a.gp", fixture("A.gp")).bodyAsText(), 502, "STORAGE_ERROR")
        assertEquals(assertNotNull(failedUploadKey), fake.deleted.last())
        assertTrue(songRows(uid3).isEmpty())
    }

    @Test
    fun `TB1-U7 저장 직후 업로드 예외면 파일을 지우고 502를 반환한다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        var storedKey: String? = null
        fake.onUploadSuccess = { key ->
            storedKey = key
            throw StorageException("Upload response lost")
        }

        val response = client.upload(token, "a.gp", fixture("A.gp"))
        assertEquals(HttpStatusCode.BadGateway, response.status)
        assertStandardError(response.bodyAsText(), 502, "STORAGE_ERROR")

        assertEquals(listOf(assertNotNull(storedKey)), fake.deleted.toList())
        assertTrue(fake.objects.isEmpty())
        assertTrue(songRows(uid).isEmpty())
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
    }

    @Test
    fun `TB1-U7 저장 직후 요청 취소 및 삭제 실패면 파일 키를 휴지통에 남긴다`() = runBlocking {
        val uid = seedUser("tab-upload-cancel@example.com")
        val service = TabSongService(db, fake, SongService(db, FakeVideoMetaClient(), "https://x/"))
        val cancellation = CancellationException("Client disconnected during upload")
        var storedKey: String? = null
        fake.failDelete = true
        val upload = async {
            val context = currentCoroutineContext()
            fake.onUploadSuccess = { key ->
                storedKey = key
                context.cancel(cancellation)
                context.ensureActive()
            }
            service.create(uid, input())
        }

        val thrown = assertFailsWith<CancellationException> { upload.await() }
        assertEquals(cancellation.message, thrown.message)
        val key = assertNotNull(storedKey)
        assertEquals(setOf(key), fake.objects.keys)
        assertEquals(listOf(key), transaction(db) { StorageTrashTable.selectAll().map { it[StorageTrashTable.storageKey] } })
        assertTrue(songRows(uid).isEmpty())
    }

    private fun seedUser(email: String): UUID {
        val uid = UUID.randomUUID()
        transaction(db) {
            UsersTable.insert { it[id] = uid; it[UsersTable.email] = email }
            ProfilesTable.insert { it[id] = uid }
        }
        return uid
    }

    private fun input() = TabUploadInput("a.gp", TabFormat.GP, fixture("A.gp"), "a", "")

    @Test
    fun `TB1-U8a 커밋 전 취소면 파일을 지운다`() = runBlocking {
        val uid = seedUser("tab-cancel@example.com")
        val service = TabSongService(db, fake, SongService(db, FakeVideoMetaClient(), "https://x/"))
        var key: String? = null
        var job: Job? = null
        fake.onUploadSuccess = { k -> key = k; job?.cancel(CancellationException("Client disconnected")) }
        val d = async { service.create(uid, input()) }
        job = d
        assertFailsWith<CancellationException> { d.await() }
        assertNotNull(key)
        assertEquals(listOf(key), fake.deleted.toList())
        assertTrue(songRows(uid).isEmpty())
    }

    @Test
    fun `TB1-U8b 커밋 뒤 취소면 파일을 보존한다`() = runBlocking {
        val uid = seedUser("tab-commit-cancel@example.com")
        val service = TabSongService(db, fake, SongService(db, FakeVideoMetaClient(), "https://x/"))
        var job: Job? = null
        fake.onUploadSuccess = { k ->
            // 같은 키의 행이 이미 커밋된 상황을 흉내 낸다
            transaction(db) {
                SongsTable.insert {
                    it[userId] = uid; it[title] = "committed"; it[mediaType] = "tab"; it[tabStorageKey] = k
                    it[tabFileName] = "a.gp"; it[tabFileSize] = 1L; it[tabFormat] = "gp"
                }
            }
            job?.cancel(CancellationException("Disconnected right after commit"))
        }
        val d = async { service.create(uid, input()) }
        job = d
        assertFailsWith<CancellationException> { d.await() }
        assertTrue(fake.deleted.isEmpty())
        assertEquals(1, fake.objects.size)
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
    }

    // ---------------------------------------------------------------- F

    @Test
    fun `TB1-F1 tab-file 서명 주소 - 본인 TAB 곡만 200, 그 밖은 404, 서명 실패 502, 저장소 없음 503`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, token) = client.newUser()
        val (_, other) = client.newUser()
        val bytes = fixture("B.mxl")
        val song = client.upload(token, "B.mxl", bytes).json(HttpStatusCode.Created)["song"]!!.jsonObject
        val id = song["id"]!!.jsonPrimitive.content
        val res = client.get("/api/v1/songs/$id/tab-file") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        assertEquals(setOf("url", "expiresIn", "fileName", "format", "sizeBytes"), res.keys)
        assertTrue(res["url"]!!.jsonPrimitive.content.startsWith("https://fake.storage/tabs/"))
        assertTrue(res["url"]!!.jsonPrimitive.content.endsWith("?exp=300"))
        assertEquals(300, res["expiresIn"]!!.jsonPrimitive.int)
        assertEquals("B.mxl", res["fileName"]!!.jsonPrimitive.content)
        assertEquals("mxl", res["format"]!!.jsonPrimitive.content)
        assertEquals(bytes.size.toLong(), res["sizeBytes"]!!.jsonPrimitive.long)

        val yt = client.post("/api/v1/songs") {
            header(HttpHeaders.Authorization, "Bearer $token"); contentType(ContentType.Application.Json)
            setBody("""{"videoId":"dQw4w9WgXcQ","title":"YT"}""")
        }.json(HttpStatusCode.Created)["song"]!!.jsonObject["id"]!!.jsonPrimitive.content
        for ((t, path) in listOf(other to id, token to yt, token to UUID.randomUUID().toString(), token to "not-a-uuid")) {
            val r = client.get("/api/v1/songs/$path/tab-file") { header(HttpHeaders.Authorization, "Bearer $t") }
            assertStandardError(r.bodyAsText(), 404, "NOT_FOUND")
        }
        fake.failSign = true
        assertStandardError(client.get("/api/v1/songs/$id/tab-file") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText(), 502, "STORAGE_ERROR")
    }

    @Test
    fun `TB1-F1b 저장소 미설정이면 업로드와 파일 주소 모두 503`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = null)
        val (uid, token) = client.newUser()
        assertStandardError(client.upload(token, "a.gp", fixture("A.gp")).bodyAsText(), 503, "STORAGE_UNAVAILABLE")
        val tab = TestTab.insertTabSong(db, uid)
        assertStandardError(client.get("/api/v1/songs/$tab/tab-file") { header(HttpHeaders.Authorization, "Bearer $token") }.bodyAsText(), 503, "STORAGE_UNAVAILABLE")
    }

    // ---------------------------------------------------------------- D

    @Test
    fun `TB1-D1 TAB 곡 삭제는 파일을 휴지통 거쳐 지우고, 삭제 실패면 휴지통에 attempts 1로 남는다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        val id = client.upload(token, "a.gp", fixture("A.gp")).json(HttpStatusCode.Created)["song"]!!.jsonObject["id"]!!.jsonPrimitive.content
        val key = "tabs/$uid/$id.gp"
        client.delete("/api/v1/songs/$id") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        assertTrue(key in fake.deleted)
        assertFalse(fake.objects.containsKey(key))
        assertTrue(songRows(uid).isEmpty())
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })

        val id2 = client.upload(token, "b.gp", fixture("A.gp")).json(HttpStatusCode.Created)["song"]!!.jsonObject["id"]!!.jsonPrimitive.content
        fake.failDelete = true
        client.delete("/api/v1/songs/$id2") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        val row = transaction(db) { StorageTrashTable.selectAll().single() }
        assertEquals("tabs/$uid/$id2.gp", row[StorageTrashTable.storageKey])
        assertEquals(1, row[StorageTrashTable.attempts])
    }

    @Test
    fun `TB1-D2 계정 삭제는 TAB 키와 녹음 키를 모두 휴지통에 넣는다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        val ids = (1..2).map { client.upload(token, "t$it.gp", fixture("A.gp")).json(HttpStatusCode.Created)["song"]!!.jsonObject["id"]!!.jsonPrimitive.content }
        val res = client.delete("/api/v1/me") {
            header(HttpHeaders.Authorization, "Bearer $token"); contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("confirmText", ProfileService.CONFIRM_DELETE_TEXT) }.toString())
        }
        assertEquals(HttpStatusCode.OK, res.status, res.bodyAsText())
        val keys = transaction(db) { StorageTrashTable.selectAll().map { it[StorageTrashTable.storageKey] }.toSet() }
        assertEquals(ids.map { "tabs/$uid/$it.gp" }.toSet(), keys)
    }

    // ---------------------------------------------------------------- S

    @Test
    fun `TB1-S1 TAB 곡에도 프리셋·곡 수정·녹음 업로드가 유튜브 곡과 똑같이 동작한다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (_, token) = client.newUser()
        val id = client.upload(token, "a.gp", fixture("A.gp")).json(HttpStatusCode.Created)["song"]!!.jsonObject["id"]!!.jsonPrimitive.content
        client.put("/api/v1/songs/$id/presets") {
            header(HttpHeaders.Authorization, "Bearer $token"); contentType(ContentType.Application.Json)
            setBody("""{"name":"후렴","a":12.5,"b":30,"rate":0.75}""")
        }.json(HttpStatusCode.OK)
        val upd = client.patch("/api/v1/songs/$id") {
            header(HttpHeaders.Authorization, "Bearer $token"); contentType(ContentType.Application.Json)
            setBody("""{"memo":"메모","status":"done","title":"새 제목"}""")
        }.json(HttpStatusCode.OK)["song"]!!.jsonObject
        assertEquals("새 제목", upd["title"]!!.jsonPrimitive.content)
        assertEquals("tab", upd["mediaType"]!!.jsonPrimitive.content)
        val metadata = buildJsonObject {
            put("songId", id); put("date", LocalDate.now(ZoneOffset.UTC).toString())
            put("recordedAt", OffsetDateTime.now(ZoneOffset.UTC).toInstant().toString()); put("durationSec", 10)
            put("mime", "audio/mp4")
        }
        val take = client.post("/api/v1/takes") {
            header(HttpHeaders.Authorization, "Bearer $token")
            setBody(MultiPartFormDataContent(formData {
                append("metadata", metadata.toString(), Headers.build { append(HttpHeaders.ContentType, "application/json") })
                append("file", ByteArray(500), Headers.build {
                    append(HttpHeaders.ContentType, "audio/mp4"); append(HttpHeaders.ContentDisposition, "filename=\"take.m4a\"")
                })
            }))
        }
        assertEquals(HttpStatusCode.Created, take.status, take.bodyAsText())
        val detail = client.get("/api/v1/songs/$id") { header(HttpHeaders.Authorization, "Bearer $token") }.json(HttpStatusCode.OK)
        assertEquals(1, detail["presets"]!!.jsonArray.size)
        assertEquals(1, detail["takes"]!!.jsonArray.size)
        assertTrue(detail["song"]!!.jsonObject["videoId"] is JsonNull)
    }

    @Test
    fun `TB1-S2 TAB 업로드는 outbox에 행을 만들지 않는다`() = testApplication {
        configureApiTestApp(dbConfig, storageClient = fake)
        val (uid, token) = client.newUser()
        transaction(db) { NotionSyncTable.insert { it[userId] = uid; it[enabled] = true } }
        client.upload(token, "a.gp", fixture("A.gp")).json(HttpStatusCode.Created)
        assertEquals(0L, transaction(db) { SyncOutboxTable.selectAll().where { SyncOutboxTable.userId eq uid }.count() })
    }
}
