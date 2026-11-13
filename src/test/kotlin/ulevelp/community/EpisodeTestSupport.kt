package ulevelp.community

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.AfterEach
import ulevelp.db.*
import ulevelp.db.DatabaseConfig
import ulevelp.support.*
import java.time.LocalDate
import java.util.UUID
import kotlin.test.*

abstract class EpisodeTestSupport {
    protected lateinit var config: DatabaseConfig
    protected lateinit var db: Database
    private lateinit var source: HikariDataSource
    @BeforeEach fun prepare() {
        config = PostgresTestContainer.getConfig()
        source = DatabaseFactory.createDataSource(config)
        DatabaseFactory.migrate(source)
        db = DatabaseFactory.connect(source)
        transaction(db) { AdminAuditTable.deleteAll(); UsersTable.deleteAll(); VideoTitlesTable.deleteAll() }
    }
    @AfterEach fun close() { source.close() }
    protected data class User(val id: UUID, val token: String)
    /** consent=true면 현재 안내 버전 카드 공유 동의 행을 넣는다(S3b-3 D12: 카드 공유 동의 강제). */
    protected suspend fun HttpClient.user(paid: Boolean = true, named: Boolean = true, owner: Boolean = false, consent: Boolean = true): User {
        val id = UUID.randomUUID()
        val u = User(id, TestJwt.token(id, "private-$id@example.com"))
        val response = send(HttpMethod.Get, "/me", u)
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        TestTier.set(db, id, if (paid) "pro" else "free")
        transaction(db) {
            ProfilesTable.update({ ProfilesTable.id eq id }) {
                it[displayName] = "PRIVATE_DISPLAY_SENTINEL"
                if (named) { it[publicName] = "u" + id.toString().take(8); it[publicNameKey] = "u" + id.toString().take(8) }
                if (owner) it[role] = "owner"
            }
            if (consent) CommunityShareConsentsTable.insert {
                it[userId] = id; it[action] = "agree"; it[noticeVersion] = ulevelp.service.ShareNotice.CURRENT_VERSION
            }
        }
        return u
    }
    protected fun session(user: User, index: Int = 1, parts: JsonElement = JsonArray(emptyList())): UUID = transaction(db) {
        val song = SongsTable.insert {
            it[userId] = user.id; it[title] = "PRIVATE_SONG_SENTINEL"; it[memo] = "PRIVATE_SONG_MEMO_SENTINEL"
            it[videoId] = "vid" + index.toString().padStart(8, '0')
        } get SongsTable.id
        SessionsTable.insert {
            it[userId] = user.id; it[songId] = song; it[date] = LocalDate.now(); it[seconds] = 90; it[loops] = 2
            it[memo] = "PRIVATE_SESSION_MEMO_SENTINEL"; it[partStats] = parts
        } get SessionsTable.id
    }
    protected suspend fun HttpClient.send(method: HttpMethod, path: String, user: User?, body: String? = null): HttpResponse = request("/api/v1$path") {
        this.method = method
        if (user != null) header(HttpHeaders.Authorization, "Bearer ${user.token}")
        if (body != null) { contentType(ContentType.Application.Json); setBody(body) }
    }
    protected fun obj(body: String) = Json.parseToJsonElement(body).jsonObject
    protected suspend fun HttpResponse.checked(status: HttpStatusCode): JsonObject {
        val text = bodyAsText()
        assertEquals(status, this.status, text)
        assertEquals("no-store", headers[HttpHeaders.CacheControl])
        return obj(text)
    }
    protected suspend fun HttpResponse.error(status: HttpStatusCode, code: String) {
        val o = checked(status)
        assertEquals(code, o["code"]!!.jsonPrimitive.content)
        assertEquals(false, o["ok"]!!.jsonPrimitive.boolean)
        assertEquals("server", o["source"]!!.jsonPrimitive.content)
    }
    protected suspend fun HttpClient.post(user: User, session: UUID, body: String = "{}"): HttpResponse = send(HttpMethod.Post, "/sessions/$session/share", user, body)
    protected suspend fun HttpClient.publish(user: User, session: UUID): UUID {
        val o = post(user, session).checked(HttpStatusCode.Created)
        return UUID.fromString(o["post"]!!.jsonObject["postId"]!!.jsonPrimitive.content)
    }
    protected suspend fun HttpClient.feed(user: User, query: String = ""): JsonArray = send(HttpMethod.Get, "/community/episode-logs$query", user).checked(HttpStatusCode.OK)["posts"]!!.jsonArray
    protected suspend fun HttpClient.moderate(actor: User, post: UUID, status: String): HttpResponse = send(HttpMethod.Patch, "/admin/community/episode-logs/$post", actor, """{"status":"$status","reason":"검토"}""")
    protected suspend fun HttpClient.report(user: User, post: UUID): HttpResponse = send(HttpMethod.Post, "/community/episode-logs/$post/reports", user, """{"reason":"other","detail":"PRIVATE_REPORT_DETAIL"}""")
    protected fun cardCount() = transaction(db) { SharedPracticeCardsTable.selectAll().count() }
}
