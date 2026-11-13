package ulevelp.community

import io.ktor.client.HttpClient
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.support.*
import java.util.UUID
import kotlin.test.*

class EpisodeLikeApiTest : EpisodeTestSupport() {
    private suspend fun HttpClient.like(user: User, post: UUID, on: Boolean = true) =
        send(if (on) HttpMethod.Put else HttpMethod.Delete, "/community/episode-logs/$post/like", user)

    private suspend fun HttpClient.likeOk(user: User, post: UUID, on: Boolean, count: Int) {
        val o = like(user, post, on).checked(HttpStatusCode.OK)
        assertEquals(on, o["liked"]!!.jsonPrimitive.boolean)
        assertEquals(count, o["likeCount"]!!.jsonPrimitive.int)
    }

    private fun likeRows(post: UUID? = null): Long = transaction(db) {
        val q = SharedPracticeCardLikesTable.selectAll()
        (if (post == null) q else q.where { SharedPracticeCardLikesTable.cardId eq post }).count()
    }

    private fun JsonObject.likeCount() = this["likeCount"]!!.jsonPrimitive.int
    private fun JsonObject.likedByMe() = this["likedByMe"]!!.jsonPrimitive.boolean

    @Test fun likeAndUnlikeReflectInFeed() = testApplication {   // L1
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false)
        val p = client.publish(a, session(a))
        client.likeOk(b, p, true, 1)
        client.feed(b).single().jsonObject.also { assertEquals(1, it.likeCount()); assertTrue(it.likedByMe()) }
        client.feed(a).single().jsonObject.also { assertEquals(1, it.likeCount()); assertFalse(it.likedByMe()) }
        client.likeOk(b, p, false, 0)
        client.feed(b).single().jsonObject.also { assertEquals(0, it.likeCount()); assertFalse(it.likedByMe()) }
    }

    @Test fun idempotent() = testApplication {   // L2
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false)
        val p = client.publish(a, session(a))
        client.likeOk(b, p, true, 1); client.likeOk(b, p, true, 1)
        assertEquals(1L, likeRows(p))
        client.likeOk(b, p, false, 0); client.likeOk(b, p, false, 0)
        assertEquals(0L, likeRows(p))
    }

    @Test fun ownerMayLikeOwnPost() = testApplication {   // L3
        configureApiTestApp(config)
        val a = client.user()
        val p = client.publish(a, session(a))
        client.likeOk(a, p, true, 1)
        val card = client.send(HttpMethod.Get, "/community/me/episode-logs", a).checked(HttpStatusCode.OK)["posts"]!!.jsonArray.single().jsonObject["card"]!!.jsonObject
        assertEquals(1, card.likeCount()); assertTrue(card.likedByMe())
    }

    @Test fun ineligibleTargetsAre404() = testApplication {   // L4
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val o = client.user(owner = true)
        client.like(b, UUID.randomUUID()).error(HttpStatusCode.NotFound, "NOT_FOUND")
        // 철회
        val s1 = session(a, 1); val p1 = client.publish(a, s1)
        client.send(HttpMethod.Delete, "/sessions/$s1/share", a).checked(HttpStatusCode.OK)
        client.like(b, p1).error(HttpStatusCode.NotFound, "NOT_FOUND")
        // 관리자 숨김
        val s2 = session(a, 2); val p2 = client.publish(a, s2)
        client.moderate(o, p2, "moderation_hidden").checked(HttpStatusCode.OK)
        client.like(b, p2).error(HttpStatusCode.NotFound, "NOT_FOUND")
        // 티어 정지
        val s3 = session(a, 3); val p3 = client.publish(a, s3)
        client.send(HttpMethod.Put, "/admin/users/${a.id}/tier-override", o, """{"tier":"free","until":null,"reason":"강등"}""").checked(HttpStatusCode.OK)
        client.like(b, p3).error(HttpStatusCode.NotFound, "NOT_FOUND")
        assertEquals(0L, likeRows())
    }

    @Test fun withdrawClearsLikesButTierPauseKeepsThem() = testApplication {   // L5, L6
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val o = client.user(owner = true)
        val s = session(a); val p = client.publish(a, s)
        client.likeOk(b, p, true, 1)
        client.send(HttpMethod.Delete, "/sessions/$s/share", a).checked(HttpStatusCode.OK)
        assertEquals(0L, likeRows(p))
        client.post(a, s).checked(HttpStatusCode.OK)
        assertEquals(0, client.feed(b).single().jsonObject.likeCount())
        // 티어 정지 중에는 보존
        client.likeOk(b, p, true, 1)
        client.send(HttpMethod.Put, "/admin/users/${a.id}/tier-override", o, """{"tier":"free","until":null,"reason":"강등"}""").checked(HttpStatusCode.OK)
        assertEquals(1L, likeRows(p))
        assertTrue(client.feed(b).isEmpty())
        client.send(HttpMethod.Put, "/admin/users/${a.id}/tier-override", o, """{"tier":"pro","until":null,"reason":"복구"}""").checked(HttpStatusCode.OK)
        client.post(a, s).checked(HttpStatusCode.OK)
        client.feed(b).single().jsonObject.also { assertEquals(1, it.likeCount()); assertTrue(it.likedByMe()) }
    }

    @Test fun unauthenticatedAndMalformedId() = testApplication {   // L7
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false)
        val p = client.publish(a, session(a))
        assertEquals(HttpStatusCode.Unauthorized, client.send(HttpMethod.Put, "/community/episode-logs/$p/like", null).status)
        assertEquals(HttpStatusCode.Unauthorized, client.send(HttpMethod.Delete, "/community/episode-logs/$p/like", null).status)
        client.send(HttpMethod.Put, "/community/episode-logs/abc/like", b).error(HttpStatusCode.BadRequest, "INVALID_INPUT")
        client.send(HttpMethod.Delete, "/community/episode-logs/abc/like", b).error(HttpStatusCode.BadRequest, "INVALID_INPUT")
        assertEquals(0L, likeRows())
    }

    @Test fun concurrentLikesCountEachUserOnce() = testApplication {   // L8
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val c = client.user(false)
        val p = client.publish(a, session(a))
        val statuses = coroutineScope {
            val start = CompletableDeferred<Unit>()
            val tasks = listOf(b, c).flatMap { u -> List(5) { async { start.await(); client.like(u, p).status } } }
            start.complete(Unit); tasks.awaitAll()
        }
        assertEquals(setOf(HttpStatusCode.OK), statuses.toSet())
        assertEquals(2L, likeRows(p))
        assertEquals(2, client.feed(a).single().jsonObject.likeCount())
    }

    @Test fun everyResponsePathCarriesLikeFields() = testApplication {   // L9
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val c = client.user(false)
        val s = session(a)
        val share = client.post(a, s).checked(HttpStatusCode.Created)["post"]!!.jsonObject
        val p = UUID.fromString(share["postId"]!!.jsonPrimitive.content)
        share["card"]!!.jsonObject.also { assertEquals(0, it.likeCount()); assertFalse(it.likedByMe()) }
        client.likeOk(b, p, true, 1); client.likeOk(c, p, true, 2); client.likeOk(a, p, true, 3)
        val reshare = client.post(a, s).checked(HttpStatusCode.OK)["post"]!!.jsonObject["card"]!!.jsonObject
        assertEquals(3, reshare.likeCount()); assertTrue(reshare.likedByMe())
        val mine = client.send(HttpMethod.Get, "/community/me/episode-logs", a).checked(HttpStatusCode.OK)["posts"]!!.jsonArray.single().jsonObject["card"]!!.jsonObject
        assertEquals(3, mine.likeCount()); assertTrue(mine.likedByMe())
        client.feed(b).single().jsonObject.also { assertEquals(3, it.likeCount()); assertTrue(it.likedByMe()) }
    }
}
