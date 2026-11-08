package ulevelp.av3

import com.zaxxer.hikari.HikariDataSource
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.module
import ulevelp.service.VideoMeta
import ulevelp.service.VideoMetaClient
import ulevelp.support.*
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.*

/** Real Netty sockets + disposable DB; test-signed JWT/external metadata are explicitly separate from Google OAuth. */
class LiveBoundaryTest {
    private class GateMeta : VideoMetaClient {
        val armed = AtomicBoolean(false)
        val reached = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()
        override suspend fun fetch(videoId: String): VideoMeta {
            if (armed.compareAndSet(true, false)) {
                reached.complete(Unit)
                release.await()
            }
            return VideoMeta("External title", "External author")
        }
    }

    private class Live(val db: Database, val ds: HikariDataSource, val meta: GateMeta, val base: String) {
        val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
        suspend fun request(user: UUID, method: String, path: String, body: String? = null): HttpResponse<String> = withContext(Dispatchers.IO) {
            val builder = HttpRequest.newBuilder(URI(base + "/api/v1" + path))
                .timeout(Duration.ofSeconds(15)).header("Authorization", "Bearer ${TestJwt.token(user)}")
            if (body != null) builder.header("Content-Type", "application/json")
            http.send(builder.method(method, body?.let(HttpRequest.BodyPublishers::ofString) ?: HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString())
        }
        suspend fun ok(user: UUID, method: String, path: String, body: String? = null, status: Int = 200): JsonObject {
            val response = request(user, method, path, body)
            assertEquals(status, response.statusCode(), response.body())
            return Json.parseToJsonElement(response.body()).jsonObject
        }
        suspend fun user(paid: Boolean = true): UUID {
            val id = UUID.randomUUID()
            ok(id, "GET", "/me")
            if (paid) TestTier.set(db, id, "pro")
            ok(id, "PUT", "/community/me/public-name", """{"publicName":"u${id.toString().take(8)}"}""")
            return id
        }
        suspend fun category(user: UUID, name: String): String = ok(user, "POST", "/categories", """{"name":"$name"}""", 201)["category"]!!.jsonObject["id"]!!.jsonPrimitive.content
        suspend fun publish(user: UUID): Pair<String, String> {
            val cat = category(user, "Boundary source")
            val song = ok(user, "POST", "/songs", """{"videoId":"dQw4w9WgXcQ"}""", 201)["song"]!!.jsonObject["id"]!!.jsonPrimitive.content
            ok(user, "PATCH", "/songs/$song", """{"categoryIds":["$cat"],"memo":"A_PRIVATE"}""")
            val folder = ok(user, "PUT", "/categories/$cat/share", """{"isPublic":true}""")["share"]!!.jsonObject["folderId"]!!.jsonPrimitive.content
            return cat to folder
        }
        fun sql(query: String): List<String> = ds.connection.use { conn ->
            conn.createStatement().use { stmt -> stmt.executeQuery(query).use { rs -> buildList { while (rs.next()) add(rs.getString(1)) } } }
        }
        fun snapshot(): Map<String, List<String>> {
            val tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('flyway_schema_history','video_titles') ORDER BY tablename")
            return tables.associateWith { table ->
                require(table.matches(Regex("[a-z_]+")))
                sql("SELECT row_to_json(t)::text FROM \"$table\" t ORDER BY row_to_json(t)::text")
            }
        }
    }

    private fun live(block: suspend Live.() -> Unit) = runBlocking {
        val config = PostgresTestContainer.getConfig()
        val ds = DatabaseFactory.createDataSource(config)
        DatabaseFactory.migrate(ds)
        val db = DatabaseFactory.connect(ds)
        transaction(db) { UsersTable.deleteAll(); VideoTitlesTable.deleteAll() }
        val meta = GateMeta()
        val server = embeddedServer(Netty, host = "127.0.0.1", port = 0) {
            module(dbConfig = config.copy(runMigrations = false), authConfig = TestJwt.authConfig,
                videoMetaClient = meta, playlistClient = FakePlaylistClient(), videoDurationClient = FakeVideoDurationClient(),
                storageClient = null, cryptoService = null, cronOidcVerifier = null,
                geminiClient = FakeGeminiClient(), geminiApiKey = null,
                allowedOrigins = listOf("http://127.0.0.1:3103"), publicAppUrl = "http://127.0.0.1:3103/")
        }.start(wait = false)
        try {
            val port = server.engine.resolvedConnectors().single().port
            withTimeout(45_000) { Live(db, ds, meta, "http://127.0.0.1:$port").block() }
        } finally {
            server.stop(100, 1000)
            ds.close()
        }
    }

    @Test
    fun `clone rechecks withdrawal after external IO and writes no domain rows`() = live {
        val a = user(); val b = user(); val (cat, folder) = publish(a)
        transaction(db) { VideoTitlesTable.deleteAll() }
        meta.armed.set(true)
        coroutineScope {
            val pending = async { request(b, "POST", "/community/folders/$folder/clone") }
            meta.reached.await()
            ok(a, "PUT", "/categories/$cat/share", """{"isPublic":false}""")
            val before = snapshot()
            meta.release.complete(Unit)
            val response = pending.await()
            assertEquals(404, response.statusCode(), response.body())
            assertEquals(before, snapshot(), "withdrawn clone must not create categories, songs, links, counters or ledger")
        }
    }

    @Test
    fun `two concurrent clones compete for one remaining category slot`() = live {
        val a = user(); val b = user(); val (_, folder) = publish(a)
        repeat(6) { category(b, "B slot $it") } // pro has seven slots
        val statuses = coroutineScope {
            List(2) { async { request(b, "POST", "/community/folders/$folder/clone").statusCode() } }.awaitAll().sorted()
        }
        assertEquals(listOf(200, 403), statuses)
        assertEquals(listOf("7"), sql("SELECT count(*) FROM categories WHERE user_id='$b'"))
        assertEquals(listOf("1"), sql("SELECT count(*) FROM songs WHERE user_id='$b'"))
        assertEquals(listOf("1"), sql("SELECT clone_count FROM shared_folders WHERE id='$folder'"))
        val before = snapshot()
        val rejected = request(b, "POST", "/community/folders/$folder/clone")
        assertEquals(403, rejected.statusCode())
        assertEquals("CATEGORY_LIMIT_EXCEEDED", Json.parseToJsonElement(rejected.body()).jsonObject["code"]!!.jsonPrimitive.content)
        assertEquals(before, snapshot())
    }

    @Test
    fun `concurrent repeated likes remain one row and one count`() = live {
        val a = user(); val b = user(false); val (_, folder) = publish(a)
        coroutineScope {
            List(4) { async { ok(b, "PUT", "/community/folders/$folder/like") } }.awaitAll()
        }
        assertEquals(listOf("1"), sql("SELECT count(*) FROM folder_likes WHERE folder_id='$folder' AND user_id='$b'"))
        assertEquals(listOf("1"), sql("SELECT like_count FROM shared_folders WHERE id='$folder'"))
    }

    @Test
    fun `parent coroutine cancellation rolls back a suspended database write`() = live {
        val a = user()
        val entered = CompletableDeferred<Unit>()
        coroutineScope {
            val job = launch {
                DatabaseFactory.dbQuery(db) {
                    CategoriesTable.insert { it[id] = UUID.randomUUID(); it[userId] = a; it[name] = "cancelled fixture" }
                    entered.complete(Unit)
                    awaitCancellation()
                }
            }
            entered.await()
            job.cancelAndJoin()
        }
        assertEquals(listOf("0"), sql("SELECT count(*) FROM categories WHERE user_id='$a'"))
    }
}
