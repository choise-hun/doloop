package ulevelp.community

import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.support.configureApiTestApp
import java.time.OffsetDateTime
import java.util.Base64
import kotlin.test.*

class EpisodeCursorApiTest : EpisodeTestSupport() {
    private val lists = listOf(
        Triple("/community/episode-logs", "feed", "all"),
        Triple("/community/me/episode-logs", "mine", "self"),
        Triple("/admin/community/episode-logs/reports", "reports", "open"),
    )

    private fun cursor(kind: String, scope: String, at: String): String {
        val json = buildJsonObject {
            put("v", 1); put("kind", kind); put("scope", scope); put("at", at)
            put("id", "00000000-0000-0000-0000-000000000001")
        }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.toString().toByteArray(Charsets.UTF_8))
    }

    @Test fun invalidCursorTimesReturn400AcrossAllLists() = testApplication {
        configureApiTestApp(config)
        val owner = client.user(owner = true)
        val responses = mutableListOf<Pair<String, io.ktor.client.statement.HttpResponse>>()
        for (at in listOf(
            "2016-12-31T23:59:60Z",
            "+1000000000-12-31T23:59:59.999999999Z",
            "-1000000000-01-01T00:00:00Z",
            "+300000-01-01T00:00:00Z",
            "-5000-01-01T00:00:00Z",
            "-4713-11-23T23:59:59.999999Z",
            "+294277-01-01T00:00:00Z",
            "+294276-12-31T23:59:59.999999999Z",
        )) {
            for ((path, kind, scope) in lists) {
                responses += "$kind $at" to client.send(HttpMethod.Get, "$path?cursor=${cursor(kind, scope, at)}", owner)
            }
        }
        assertEquals(List(responses.size) { 400 }, responses.map { it.second.status.value }, responses.map { it.first }.toString())
        for ((_, response) in responses) response.error(HttpStatusCode.BadRequest, "INVALID_INPUT")
        assertEquals(0L, cardCount())
        assertEquals(0L, transaction(db) { SharedPracticeCardReportsTable.selectAll().count() })
        assertEquals(0L, transaction(db) { AdminAuditTable.selectAll().count() })
    }

    @Test fun supportedCursorTimesRemainQueryableAcrossAllLists() = testApplication {
        configureApiTestApp(config)
        val owner = client.user(owner = true)
        for (at in listOf(
            "-4713-11-24T00:00:00Z",
            "+294276-12-31T23:59:59.999999Z",
            "2026-11-09T01:02:03.123456Z",
            "2016-12-31T23:59:59Z",
        )) {
            for ((path, kind, scope) in lists) {
                val page = client.send(HttpMethod.Get, "$path?cursor=${cursor(kind, scope, at)}", owner).checked(HttpStatusCode.OK)
                assertTrue(page[if (kind == "reports") "reports" else "posts"]!!.jsonArray.isEmpty(), "$kind $at")
                assertEquals(JsonNull, page["next"])
            }
        }
    }

    @Test fun allListsKeepExactPageBoundaryWithEqualTimestamps() = testApplication {
        configureApiTestApp(config)
        val owner = client.user(owner = true)
        val reporter = client.user(false)
        repeat(21) {
            val post = client.publish(owner, session(owner, it + 1))
            client.report(reporter, post).checked(HttpStatusCode.Created)
        }
        val at = OffsetDateTime.parse("2026-11-09T01:02:03.123456Z")
        transaction(db) {
            SharedPracticeCardsTable.update({ SharedPracticeCardsTable.userId eq owner.id }) { it[publishedAt] = at }
            SharedPracticeCardReportsTable.update({ SharedPracticeCardReportsTable.reporterId eq reporter.id }) { it[createdAt] = at }
        }
        for ((path, kind, _) in lists) {
            val key = if (kind == "reports") "reports" else "posts"
            val idKey = if (kind == "reports") "reportId" else "postId"
            val query = if (kind == "reports") "limit=20&" else ""
            val page = client.send(HttpMethod.Get, "$path?${query}", owner).checked(HttpStatusCode.OK)
            assertEquals(20, page[key]!!.jsonArray.size, kind)
            val next = client.send(HttpMethod.Get, "$path?${query}cursor=${page["next"]!!.jsonPrimitive.content}", owner).checked(HttpStatusCode.OK)
            assertEquals(1, next[key]!!.jsonArray.size, kind)
            assertEquals(JsonNull, next["next"])
            val ids = (page[key]!!.jsonArray + next[key]!!.jsonArray).map { it.jsonObject[idKey]!!.jsonPrimitive.content }
            val expected = transaction(db) {
                if (kind == "reports") SharedPracticeCardReportsTable.selectAll().map { it[SharedPracticeCardReportsTable.id].toString() }
                else SharedPracticeCardsTable.selectAll().map { it[SharedPracticeCardsTable.id].toString() }
            }.sortedDescending()
            assertEquals(expected, ids, kind)
            assertEquals(21, ids.toSet().size, kind)
        }
        assertEquals(21L, cardCount())
        assertEquals(21L, transaction(db) { SharedPracticeCardReportsTable.selectAll().count() })
    }
}
