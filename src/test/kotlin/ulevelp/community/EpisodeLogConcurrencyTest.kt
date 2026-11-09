package ulevelp.community

import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.*
import ulevelp.support.*
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.test.*

class EpisodeLogConcurrencyTest : EpisodeTestSupport() {
    @Test fun serializedWritesAndUniqueReports() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val b = client.user(false); val o = client.user(owner = true)
        val s = session(a)
        val statuses = coroutineScope {
            val start = CompletableDeferred<Unit>()
            val tasks = List(2) { async { start.await(); client.post(a,s).status } }
            start.complete(Unit); tasks.awaitAll()
        }
        assertEquals(setOf(HttpStatusCode.Created,HttpStatusCode.OK),statuses.toSet()); assertEquals(1L,cardCount())
        val post = transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.id] }
        val reports = coroutineScope {
            val start = CompletableDeferred<Unit>()
            val tasks = List(2) { async { start.await(); client.report(b,post).status } }
            start.complete(Unit); tasks.awaitAll()
        }
        assertEquals(setOf(HttpStatusCode.Created,HttpStatusCode.Conflict),reports.toSet())
        assertEquals(1L,transaction(db) { SharedPracticeCardReportsTable.selectAll().count() })
        coroutineScope {
            val sharing = async { client.post(a,s).status }
            val hiding = async { client.moderate(o,post,"moderation_hidden").status }
            assertTrue(sharing.await() in setOf(HttpStatusCode.OK,HttpStatusCode.Conflict))
            assertEquals(HttpStatusCode.OK,hiding.await())
        }
        assertEquals("moderation_hidden",transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.status] })
        client.moderate(o,post,"published").checked(HttpStatusCode.OK)
        coroutineScope {
            val posting = async { client.post(a,s).status }
            val withdrawing = async { client.send(HttpMethod.Delete,"/sessions/$s/share",a).status }
            assertEquals(HttpStatusCode.OK,posting.await()); assertEquals(HttpStatusCode.OK,withdrawing.await())
        }
        coroutineScope {
            val posting = async { client.post(a,s).status }
            val downgrading = async { client.send(HttpMethod.Put,"/admin/users/${a.id}/tier-override",o,"""{"tier":"free","until":null,"reason":"동시 강등"}""").status }
            assertTrue(posting.await() in setOf(HttpStatusCode.OK,HttpStatusCode.Forbidden))
            assertEquals(HttpStatusCode.OK,downgrading.await())
        }
        assertTrue(client.feed(b).isEmpty())
        assertNotNull(transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.tierPausedAt] })
        client.send(HttpMethod.Put,"/admin/users/${a.id}/tier-override",o,"""{"tier":"pro","until":null,"reason":"복원"}""").checked(HttpStatusCode.OK)
        val song = transaction(db) { SessionsTable.selectAll().where { SessionsTable.id eq s }.single()[SessionsTable.songId] }
        coroutineScope {
            val posting = async { client.post(a,s).status }
            val deleting = async { client.send(HttpMethod.Delete,"/songs/$song",a).status }
            assertTrue(posting.await() in setOf(HttpStatusCode.OK,HttpStatusCode.NotFound))
            assertEquals(HttpStatusCode.OK,deleting.await())
        }
        assertEquals(0L,cardCount()); assertEquals(0L,transaction(db) { SharedPracticeCardReportsTable.selectAll().count() })
    }

    @Test fun lateMetadataAndCancellation() = testApplication {
        var entered = CompletableDeferred<Unit>()
        var release = CompletableDeferred<Unit>()
        val meta = object : VideoMetaClient {
            override suspend fun fetch(videoId: String): VideoMeta? {
                entered.complete(Unit); release.await(); return null
            }
        }
        configureApiTestApp(config,videoMetaClient = meta)
        val a = client.user(); val b = client.user(false); val o = client.user(owner = true)
        val s = session(a); val p = client.publish(a,s)
        for (change in listOf("withdraw","hide","downgrade")) {
            entered = CompletableDeferred(); release = CompletableDeferred()
            coroutineScope {
                val response = async { client.feed(b) }
                withTimeout(10_000) { entered.await() }
                when (change) {
                    "withdraw" -> client.send(HttpMethod.Delete,"/sessions/$s/share",a).checked(HttpStatusCode.OK)
                    "hide" -> client.moderate(o,p,"moderation_hidden").checked(HttpStatusCode.OK)
                    else -> client.send(HttpMethod.Put,"/admin/users/${a.id}/tier-override",o,"""{"tier":"free","until":null,"reason":"강등"}""").checked(HttpStatusCode.OK)
                }
                release.complete(Unit)
                assertTrue(withTimeout(10_000) { response.await() }.isEmpty())
            }
            if (change == "hide") client.moderate(o,p,"published").checked(HttpStatusCode.OK)
            if (change != "downgrade") client.post(a,s).checked(HttpStatusCode.OK)
        }
        // The production dbQuery boundary must roll back writes if the parent is cancelled before commit.
        coroutineScope {
          val inserted = CompletableDeferred<Unit>()
          val job = launch(Dispatchers.Default) {
            DatabaseFactory.dbQuery(db) {
                SharedPracticeCardsTable.update({ SharedPracticeCardsTable.id eq p }) { it[title] = "MUST_ROLL_BACK" }
                inserted.complete(Unit)
                awaitCancellation()
            }
        }
        withTimeout(10_000) { inserted.await() }
          job.cancelAndJoin()
        }
        assertNotEquals("MUST_ROLL_BACK",transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.title] })
        // Cancel while blocked on an actual share INSERT, then release the DB lock.
        val lockKey = 780142L
        transaction(db) {
            exec("CREATE FUNCTION cm_test_insert_gate() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN PERFORM pg_advisory_xact_lock($lockKey); RETURN NEW; END'")
            exec("CREATE TRIGGER cm_test_insert_gate BEFORE INSERT ON shared_practice_cards FOR EACH ROW EXECUTE FUNCTION cm_test_insert_gate()")
        }
        val s2 = session(a,2)
        TestTier.set(db,a.id,"pro")
        val dbConnection = java.sql.DriverManager.getConnection(config.jdbcUrl,config.username,config.password)
        try {
            dbConnection.createStatement().use { it.execute("SELECT pg_advisory_lock($lockKey)") }
            val service = EpisodeLogService(db,CommunityService(db,FakeVideoMetaClient()))
            coroutineScope {
                val share = async(Dispatchers.Default) { service.share(a.id,s2,"","") }
                withTimeout(10_000) {
                    while (true) {
                        val waiting = transaction(db) {
                            exec("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid=$lockKey") { rs -> rs.next(); rs.getInt(1) }!!
                        }
                        if (waiting > 0) break
                        yield()
                    }
                }
                share.cancel()
                dbConnection.createStatement().use { it.execute("SELECT pg_advisory_unlock($lockKey)") }
                share.join()
            }
            assertEquals(1L,cardCount())
        } finally {
            dbConnection.close()
            transaction(db) { exec("DROP TRIGGER cm_test_insert_gate ON shared_practice_cards"); exec("DROP FUNCTION cm_test_insert_gate()") }
        }
    }

    @Test fun auditFailureRollsBackModeration() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val o = client.user(owner = true)
        val p = client.publish(a,session(a))
        transaction(db) {
            exec("CREATE FUNCTION cm_test_audit_fail() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''CM audit failure''; END'")
            exec("CREATE TRIGGER cm_test_audit_fail BEFORE INSERT ON admin_audit FOR EACH ROW EXECUTE FUNCTION cm_test_audit_fail()")
        }
        try {
            assertFailsWith<org.jetbrains.exposed.exceptions.ExposedSQLException> { AdminService(db).moderateEpisode(o.id,p,"moderation_hidden","검토") }
            assertEquals("published",transaction(db) { SharedPracticeCardsTable.selectAll().single()[SharedPracticeCardsTable.status] })
            assertEquals(0L,transaction(db) { AdminAuditTable.selectAll().count() })
        } finally {
            transaction(db) { exec("DROP TRIGGER cm_test_audit_fail ON admin_audit"); exec("DROP FUNCTION cm_test_audit_fail()") }
        }
    }
}
