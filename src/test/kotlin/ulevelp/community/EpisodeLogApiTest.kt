package ulevelp.community

import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.support.*
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.test.*

class EpisodeLogApiTest : EpisodeTestSupport() {
    @Test fun ownerOnlyShareAndWithdraw() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val c = client.user()
        val s = session(a)
        client.send(HttpMethod.Delete, "/sessions/$s/share", a).checked(HttpStatusCode.OK)
        client.post(a, s).checked(HttpStatusCode.Created)
        for (u in listOf(b,c)) {
            client.post(u, s).error(HttpStatusCode.NotFound, "NOT_FOUND")
            client.send(HttpMethod.Delete, "/sessions/$s/share", u).error(HttpStatusCode.NotFound, "NOT_FOUND")
            assertTrue(client.send(HttpMethod.Get, "/community/me/episode-logs", u).checked(HttpStatusCode.OK)["posts"]!!.jsonArray.isEmpty())
        }
        client.post(a, UUID.randomUUID()).error(HttpStatusCode.NotFound, "NOT_FOUND")
        client.post(a, s, "{\"unknown\":true}").error(HttpStatusCode.BadRequest, "INVALID_INPUT")
        client.post(a, s).checked(HttpStatusCode.OK)
        assertEquals(1L, cardCount())
        client.send(HttpMethod.Post, "/sessions/$s/share", null, "{}").error(HttpStatusCode.Unauthorized, "UNAUTHORIZED")
    }

    @Test fun requiresPaidPublicNameAndExplicitPost() = testApplication {
        configureApiTestApp(config)
        val free = client.user(false); val unnamed = client.user(named = false); val a = client.user()
        val sf = session(free); val sn = session(unnamed); val s = session(a)
        assertTrue(client.feed(free).isEmpty())
        client.post(free, sf).error(HttpStatusCode.Forbidden, "TIER_UPGRADE_REQUIRED")
        client.post(unnamed, sn).error(HttpStatusCode.Conflict, "PUBLIC_NAME_REQUIRED")
        assertEquals(0L, cardCount())
        val first = client.post(a, s).checked(HttpStatusCode.Created)["post"]!!.jsonObject
        val second = client.post(a, s, "{\"title\":\"새 제목\"}").checked(HttpStatusCode.OK)["post"]!!.jsonObject
        assertEquals(first["postId"], second["postId"]); assertEquals(first["publishedAt"], second["publishedAt"])
        transaction(db) {
            ProfilesTable.update({ ProfilesTable.id eq a.id }) {
                it[tierOverride] = null; it[creditCycleTier] = "pro"; it[creditCycleNextAt] = OffsetDateTime.now().plusDays(1)
            }
        }
        client.post(a, s).checked(HttpStatusCode.OK)
        assertEquals(1, client.feed(free).size)
    }

    @Test fun validatesTextAndSnapshot() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val s = session(a)
        for (body in listOf("[]", "{", "{\"title\":2}", "{\"title\":\"\\u0000\"}", "{\"title\":\"x\\nx\"}", "{\"title\":\"\\ud800\"}"))
            client.post(a, s, body).error(HttpStatusCode.BadRequest, "INVALID_INPUT")
        for ((key, max) in listOf("title" to 80, "comment" to 500)) {
            client.post(a, s, buildJsonObject { put(key, "😀".repeat(max + 1)) }.toString()).error(HttpStatusCode.BadRequest, "INVALID_INPUT")
            val r = client.post(a, s, buildJsonObject { put(key, "😀".repeat(max)) }.toString())
            r.checked(if (cardCount() == 1L && key == "title") HttpStatusCode.Created else HttpStatusCode.OK)
        }
        client.post(a, s, "{\"comment\":\"f.u.c.k\"}").error(HttpStatusCode.BadRequest, "BANNED_WORD")
        val goodPart = """{"name":"도입","a":0,"b":1,"rate":1,"seconds":2,"loops":0,"completed":false}"""
        transaction(db) { SessionsTable.update({ SessionsTable.id eq s }) { it[partStats] = Json.parseToJsonElement("["+goodPart.replace("도입","f.u.c.k")+"]") } }
        client.post(a,s).error(HttpStatusCode.BadRequest,"BANNED_WORD")
        val badParts = listOf("{}", "[{\"name\":\"x\"}]", "[{\"name\":\"x\",\"a\":0,\"b\":1,\"rate\":1,\"seconds\":2147483648,\"loops\":0,\"completed\":false}]",
            "["+goodPart.replace("\"a\":0","\"a\":\"0\"")+"]", "["+goodPart.replace("\"rate\":1","\"rate\":999")+"]")
        val before = transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.publicSession] }
        for (p in badParts) {
            transaction(db) { SessionsTable.update({ SessionsTable.id eq s }) { it[partStats] = Json.parseToJsonElement(p) } }
            client.post(a, s).error(HttpStatusCode.Conflict, "SESSION_NOT_SHAREABLE")
            assertEquals(before,transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.publicSession] })
        }
        assertEquals(1L, cardCount())
        assertEquals(0L, transaction(db) { AdminAuditTable.selectAll().count() })
    }

    @Test fun publicDtoHasExactAllowlistAndSnapshotChangesOnlyOnExplicitPost() = testApplication {
        configureApiTestApp(config, videoMetaClient = FakeVideoMetaClient(null))
        val a = client.user(); val b = client.user(false)
        val parts = Json.parseToJsonElement("""[{"name":"도입","a":0,"b":0,"rate":1,"completed":false,"seconds":3,"loops":0,"private":"PRIVATE_PART_SENTINEL"}]""")
        val s = session(a, parts = parts)
        client.publish(a,s)
        val row = client.feed(b).single().jsonObject
        assertEquals(setOf("postId","sessionId","owner","videoId","youtubeTitle","youtubeArtist","title","comment","publishedAt","date","seconds","loops","a","b","rate","coveragePct","partStats","likeCount","likedByMe","attachments"), row.keys)
        assertEquals(setOf("id","publicName","isCreator","creatorBadge"), row["owner"]!!.jsonObject.keys)
        assertEquals(setOf("name","a","b","rate","completed","seconds","loops"), row["partStats"]!!.jsonArray.single().jsonObject.keys)
        assertFalse(row.toString().contains("PRIVATE_")); assertFalse(row.toString().contains("@example.com"))
        assertEquals(JsonNull, row["youtubeTitle"]); assertEquals(JsonNull, row["youtubeArtist"])
        transaction(db) { SessionsTable.update({ SessionsTable.id eq s }) { it[seconds] = 999; it[partStats] = JsonArray(emptyList()) } }
        assertEquals(90, client.feed(b).single().jsonObject["seconds"]!!.jsonPrimitive.int)
        client.post(a,s).checked(HttpStatusCode.OK)
        assertEquals(999, client.feed(b).single().jsonObject["seconds"]!!.jsonPrimitive.int)
        assertFalse(transaction(db) { ProfilesTable.selectAll().where { ProfilesTable.id eq a.id }.single()[ProfilesTable.sharePracticeLog] })
        assertTrue(client.send(HttpMethod.Get,"/community/logs",b).checked(HttpStatusCode.OK)["logs"]!!.jsonArray.isEmpty())
    }

    @Test fun cascadeAndWithdraw() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false)
        val s = session(a); val sb = session(b)
        val post = client.publish(a,s)
        client.report(b,post).checked(HttpStatusCode.Created)
        client.send(HttpMethod.Delete,"/sessions/$s/share",a).checked(HttpStatusCode.OK)
        assertTrue(client.feed(b).isEmpty())
        val before = transaction(db) { SharedPracticeCardsTable.selectAll().single() }
        assertEquals(JsonObject(emptyMap()), before[SharedPracticeCardsTable.publicSession])
        assertEquals("",before[SharedPracticeCardsTable.title])
        client.send(HttpMethod.Delete,"/sessions/$s/share",a).checked(HttpStatusCode.OK)
        assertEquals(before[SharedPracticeCardsTable.updatedAt],transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.updatedAt] })
        assertEquals(post.toString(),client.post(a,s).checked(HttpStatusCode.OK)["post"]!!.jsonObject["postId"]!!.jsonPrimitive.content)
        val song = transaction(db) { SessionsTable.selectAll().where { SessionsTable.id eq s }.single()[SessionsTable.songId] }
        client.send(HttpMethod.Delete,"/songs/$song",a).checked(HttpStatusCode.OK)
        assertEquals(0L,cardCount()); assertEquals(0L,transaction(db) { SharedPracticeCardReportsTable.selectAll().count() })
        assertEquals(1L,transaction(db) { SessionsTable.selectAll().where { SessionsTable.id eq sb }.count() })
        val s2 = session(a,2); client.publish(a,s2)
        transaction(db) { SessionsTable.deleteWhere { SessionsTable.id eq s2 } }
        assertEquals(0L,cardCount())
        client.publish(a,session(a,3))
        transaction(db) { UsersTable.deleteWhere { UsersTable.id eq a.id } }
        assertEquals(0L,cardCount())
        assertEquals(1L,transaction(db) { SessionsTable.selectAll().where { SessionsTable.id eq sb }.count() })
    }

    @Test fun feedKeysetAndFollowing() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false)
        repeat(25) { client.publish(a,session(a,it+1)) }
        val at = OffsetDateTime.now().minusHours(1)
        transaction(db) { SharedPracticeCardsTable.update({ SharedPracticeCardsTable.userId eq a.id }) { it[publishedAt] = at } }
        val page = client.send(HttpMethod.Get,"/community/episode-logs",b).checked(HttpStatusCode.OK)
        assertEquals(20,page["posts"]!!.jsonArray.size)
        val cursor = page["next"]!!.jsonPrimitive.content
        val next = client.send(HttpMethod.Get,"/community/episode-logs?cursor=$cursor",b).checked(HttpStatusCode.OK)
        assertEquals(5,next["posts"]!!.jsonArray.size); assertEquals(JsonNull,next["next"])
        val ids = (page["posts"]!!.jsonArray + next["posts"]!!.jsonArray).map { it.jsonObject["postId"]!!.jsonPrimitive.content }
        assertEquals(25,ids.toSet().size); assertEquals(ids.sortedDescending(),ids)
        assertTrue(client.feed(b,"?scope=following").isEmpty())
        client.send(HttpMethod.Put,"/community/follows/${a.id}",b).checked(HttpStatusCode.OK)
        assertEquals(20,client.feed(b,"?scope=following").size)
        client.send(HttpMethod.Delete,"/community/follows/${a.id}",b).checked(HttpStatusCode.OK)
        assertTrue(client.feed(b,"?scope=following").isEmpty())
        client.send(HttpMethod.Get,"/community/episode-logs?scope=following&cursor=$cursor",b).error(HttpStatusCode.BadRequest,"INVALID_INPUT")
        client.send(HttpMethod.Get,"/community/episode-logs?cursor=wrong",b).error(HttpStatusCode.BadRequest,"INVALID_INPUT")
        // Skip more than one SQL scan batch of invalid public snapshots.
        repeat(105) { i ->
            val s = session(a,1000+i)
            transaction(db) { SharedPracticeCardsTable.insert {
                it[sessionId] = s; it[userId] = a.id; it[publicSession] = JsonObject(emptyMap()); it[publishedAt] = at.plusMinutes(1)
            } }
        }
        assertEquals(20,client.feed(b).size)
    }
}
