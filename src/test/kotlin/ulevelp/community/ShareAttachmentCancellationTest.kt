package ulevelp.community

import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.statements.StatementInterceptor
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.*
import ulevelp.support.*
import java.time.OffsetDateTime
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.*

class ShareAttachmentCancellationTest : EpisodeTestSupport() {
    @Test fun cancellationImmediatelyAfterTx1CommitReclaimsPreparation() = probe(1)
    @Test fun cancellationImmediatelyAfterTx2CommitPreservesReadyFile() = probe(2)

    @Test fun tx1CommitThenSourceDeletionAndCancellationLeavesNoGuard() = probe(1, true)

    @Test fun cancellationBeforeTx1CommitRollsBackWithoutDeletingOrEnqueuingFile() = probe(1, cancelBeforeCommit = true)

    private fun probe(cancelAt: Int, deleteAfterCommit: Boolean = false, cancelBeforeCommit: Boolean = false) = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/boundary.m4a"
        storage.objects[key] = byteArrayOf(1, 2, 3, 4)
        val take = transaction(db) {
            val song = SessionsTable.selectAll().where { SessionsTable.id eq session }.single()[SessionsTable.songId]
            TakesTable.insert {
                it[userId] = a.id; it[sessionId] = session; it[songId] = song
                it[recordedAt] = OffsetDateTime.now(); it[durationSec] = 12; it[mime] = "audio/mp4"
                it[sizeBytes] = 4; it[TakesTable.storage] = "supabase"; it[TakesTable.storageKey] = key
            } get TakesTable.id
        }
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)
        val service = ShareAttachmentService(db, storage, StorageTrashService(db, storage))
        val commitObserved = AtomicBoolean(false)
        coroutineScope {
            val request = launch {
                val ownerJob = currentCoroutineContext().job
                var phase = 0
                service.replace(a.id, session, ShareAttachmentInput("replace", take), validate = {
                    tierContext(a.id, lock = true)
                    phase++
                    if (phase == cancelAt) registerInterceptor(object : StatementInterceptor {
                        override fun beforeCommit(transaction: Transaction) {
                            if (cancelBeforeCommit) {
                                ownerJob.cancel(CancellationException("cancel before prepare commit"))
                                ownerJob.ensureActive()
                            }
                        }
                        override fun afterCommit(transaction: Transaction) {
                            if (deleteAfterCommit) java.util.concurrent.CompletableFuture.runAsync {
                                transaction(db) { TakesTable.deleteWhere { id eq take } }
                            }.join()
                            commitObserved.set(true)
                            ownerJob.cancel(CancellationException("review cancellation after commit $cancelAt"))
                        }
                    })
                }, publish = { "published" })
            }
            request.join()
            assertTrue(request.isCancelled, "request cancellation must propagate")
        }
        assertEquals(!cancelBeforeCommit, commitObserved.get(), "verify the requested side of the commit boundary")
        transaction(db) {
            assertEquals(0L, StorageTrashTable.selectAll().count(), "guard/trash must be cleaned")
            val rows = SharedCardAttachmentsTable.selectAll().toList()
            if (cancelAt == 1) {
                assertTrue(rows.isEmpty(), "tx1 preparation must be compensated")
            } else {
                assertEquals(1, rows.size)
                assertEquals("ready", rows.single()[SharedCardAttachmentsTable.status])
                assertContentEquals(byteArrayOf(1, 2, 3, 4), storage.objects[rows.single()[SharedCardAttachmentsTable.storageKey]])
            }
        }
        if (cancelAt == 1) {
            assertEquals(0, storage.downloadCount.get())
            assertEquals(setOf(key), storage.objects.keys)
            if (cancelBeforeCommit) assertTrue(storage.deleted.isEmpty(), "rolled-back preparation must not invent cleanup work")
        } else assertTrue(storage.deleted.isEmpty(), "committed ready file must be preserved")
    }
}
