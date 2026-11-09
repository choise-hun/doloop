package ulevelp.community

import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import kotlinx.coroutines.runBlocking
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.*
import ulevelp.support.*
import java.time.OffsetDateTime
import kotlin.test.*

class EpisodeLogModerationApiTest : EpisodeTestSupport() {
    @Test fun reportsAndOwnerAudit() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val o = client.user(owner = true)
        val s = session(a); val p = client.publish(a,s)
        client.report(a,p).error(HttpStatusCode.BadRequest,"SELF_REPORT_NOT_ALLOWED")
        val report = client.report(b,p).checked(HttpStatusCode.Created)["reportId"]!!.jsonPrimitive.content
        client.report(b,p).error(HttpStatusCode.Conflict,"ALREADY_REPORTED")
        client.send(HttpMethod.Get,"/admin/community/episode-logs/reports",b).error(HttpStatusCode.Forbidden,"FORBIDDEN")
        client.moderate(b,p,"moderation_hidden").error(HttpStatusCode.Forbidden,"FORBIDDEN")
        val list = client.send(HttpMethod.Get,"/admin/community/episode-logs/reports",o).checked(HttpStatusCode.OK)
        assertEquals(1,list["reports"]!!.jsonArray.size)
        assertTrue(list.toString().contains("PRIVATE_REPORT_DETAIL"))
        val mine = client.send(HttpMethod.Get,"/community/me/episode-logs",a).checked(HttpStatusCode.OK)
        assertFalse(mine.toString().contains("PRIVATE_REPORT_DETAIL")); assertFalse(mine.toString().contains(b.id.toString()))
        client.send(HttpMethod.Patch,"/admin/community/episode-logs/reports/$report",o,"""{"status":"resolved","reason":"처리"}""").checked(HttpStatusCode.OK)
        client.send(HttpMethod.Patch,"/admin/community/episode-logs/reports/$report",o,"""{"status":"dismissed","reason":"처리"}""").error(HttpStatusCode.Conflict,"REPORT_ALREADY_RESOLVED")
        client.report(b,p).checked(HttpStatusCode.Created)
        client.moderate(o,p,"moderation_hidden").checked(HttpStatusCode.OK)
        client.report(b,p).error(HttpStatusCode.NotFound,"NOT_FOUND")
        assertTrue(client.feed(b).isEmpty())
        assertEquals(2L,transaction(db) { AdminAuditTable.selectAll().count() })
        val audit = transaction(db) { AdminAuditTable.selectAll().map { it[AdminAuditTable.after].toString() + it[AdminAuditTable.before].toString() }.joinToString() }
        assertFalse(audit.contains("PRIVATE_"))
        client.moderate(o,p,"published").checked(HttpStatusCode.OK)
        val n = transaction(db) { AdminAuditTable.selectAll().count() }
        client.moderate(o,p,"published").checked(HttpStatusCode.OK)
        assertEquals(n,transaction(db) { AdminAuditTable.selectAll().count() })
        TestTier.setRole(db,o.id,"user")
        val denied = assertFailsWith<ulevelp.api.ApiException> { AdminService(db).moderateEpisode(o.id,p,"moderation_hidden","검토") }
        assertEquals(HttpStatusCode.Forbidden,denied.status)
        assertEquals(n,transaction(db) { AdminAuditTable.selectAll().count() })
        assertEquals("published",transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.status] })
    }

    @Test fun hiddenCannotBeBypassed() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val o = client.user(owner = true)
        val s = session(a); val p = client.publish(a,s)
        client.moderate(o,p,"moderation_hidden").checked(HttpStatusCode.OK)
        client.send(HttpMethod.Delete,"/sessions/$s/share",a).checked(HttpStatusCode.OK)
        client.post(a,s).error(HttpStatusCode.Conflict,"POST_MODERATION_HIDDEN")
        // Existing real tier override endpoint, no test-only cleanup invocation.
        client.send(HttpMethod.Put,"/admin/users/${a.id}/tier-override",o,"""{"tier":"free","until":null,"reason":"강등"}""").checked(HttpStatusCode.OK)
        var row = transaction(db) { SharedPracticeCardsTable.selectAll().single() }
        assertEquals("moderation_hidden",row[SharedPracticeCardsTable.status]); assertNotNull(row[SharedPracticeCardsTable.tierPausedAt])
        client.post(a,s).error(HttpStatusCode.Conflict,"POST_MODERATION_HIDDEN")
        client.send(HttpMethod.Put,"/admin/users/${a.id}/tier-override",o,"""{"tier":"pro","until":null,"reason":"재가입"}""").checked(HttpStatusCode.OK)
        client.post(a,s).error(HttpStatusCode.Conflict,"POST_MODERATION_HIDDEN")
        val restore = client.moderate(o,p,"published").checked(HttpStatusCode.OK)
        assertEquals("tier_paused",restore["status"]!!.jsonPrimitive.content)
        assertNotEquals(JsonNull,restore["withdrawnAt"])
        assertTrue(client.feed(b).isEmpty())
        client.moderate(o,p,"published").error(HttpStatusCode.Conflict,"POST_REPUBLISH_REQUIRED")
        client.post(a,s).checked(HttpStatusCode.OK)
        assertEquals(1,client.feed(b).size)
        row = transaction(db) { SharedPracticeCardsTable.selectAll().single() }
        assertNull(row[SharedPracticeCardsTable.withdrawnAt]); assertNull(row[SharedPracticeCardsTable.tierPausedAt])
    }

    @Test fun downgradeNeverAutoRepublishes() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val o = client.user(owner = true)
        val s = session(a); client.publish(a,s)
        // Expired override, cron has not executed; readers must immediately hide.
        val past = OffsetDateTime.now().minusHours(2)
        transaction(db) { ProfilesTable.update({ ProfilesTable.id eq a.id }) {
            it[tierOverrideUntil] = past; it[creditCycleNextAt] = null; it[creditCycleTier] = null
        } }
        assertTrue(client.feed(b).isEmpty())
        client.send(HttpMethod.Put,"/admin/users/${a.id}/tier-override",o,"""{"tier":"pro","until":null,"reason":"지연 cron 뒤 재가입"}""").checked(HttpStatusCode.OK)
        assertTrue(client.feed(b).isEmpty())
        assertNotNull(transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.tierPausedAt] })
        client.post(a,s).checked(HttpStatusCode.OK)
        assertEquals(1,client.feed(b).size)
        // Grace remains visible until its actual end, then real cycle handler cleans up.
        val future = OffsetDateTime.now().plusDays(1)
        transaction(db) { ProfilesTable.update({ ProfilesTable.id eq a.id }) {
            it[tierOverride] = null; it[tierOverrideUntil] = null; it[creditCycleTier] = "pro"; it[creditCycleNextAt] = future
        } }
        assertEquals(1,client.feed(b).size)
        transaction(db) { ProfilesTable.update({ ProfilesTable.id eq a.id }) { it[creditCycleNextAt] = past } }
        assertTrue(client.feed(b).isEmpty())
        transaction(db) { processDueCycle(a.id,"free",OffsetDateTime.now().toInstant()) }
        assertEquals("tier_paused",transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.status] })
        client.send(HttpMethod.Put,"/admin/users/${a.id}/tier-override",o,"""{"tier":"pro","until":null,"reason":"재구독"}""").checked(HttpStatusCode.OK)
        assertTrue(client.feed(b).isEmpty())
        client.post(a,s).checked(HttpStatusCode.OK)
        // Real override expiry path after removing cycle grace.
        transaction(db) { ProfilesTable.update({ ProfilesTable.id eq a.id }) {
            it[tierOverrideUntil] = past; it[creditCycleNextAt] = null; it[creditCycleTier] = null
        } }
        val result = TierService(db).expireOverrides()
        assertEquals(1,result.downgraded)
        assertTrue(client.feed(b).isEmpty())
        assertEquals("tier_paused",transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.status] })
    }
}
