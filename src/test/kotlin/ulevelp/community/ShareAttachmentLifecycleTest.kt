package ulevelp.community

import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import ulevelp.db.*
import ulevelp.db.SharedCardAttachmentsTable as A
import ulevelp.service.*
import ulevelp.support.*
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.*

class ShareAttachmentLifecycleTest : EpisodeTestSupport() {
    @BeforeEach fun clearTrash() { transaction(db) { StorageTrashTable.deleteAll() } }
    private val bytes = byteArrayOf(0, 0, 0, 8) + "ftyp".toByteArray()
    private fun now() = OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS)
    private fun take(user: User, session: UUID, drive: Boolean = false): UUID = transaction(db) {
        val song = SessionsTable.selectAll().where { SessionsTable.id eq session }.single()[SessionsTable.songId]
        TakesTable.insert {
            it[userId] = user.id; it[sessionId] = session; it[songId] = song; it[recordedAt] = now()
            it[durationSec] = 12; it[mime] = "audio/mp4"; it[sizeBytes] = bytes.size.toLong()
            it[storage] = if (drive) "drive" else "supabase"; it[storageKey] = "${user.id}/${UUID.randomUUID()}.m4a"
        } get TakesTable.id
    }
    private suspend fun HttpClient.agree(user: User) { send(HttpMethod.Post, "/community/me/share-consent", user, """{"noticeVersion":1}""").checked(HttpStatusCode.OK) }
    private fun replace(take: UUID, upload: String? = null) = buildJsonObject {
        putJsonObject("attachment") { put("mode", "replace"); put("takeId", take.toString()); put("originalConfirmed", true); if (upload != null) put("uploadId", upload) }
    }.toString()
    private fun key(take: UUID) = transaction(db) { TakesTable.selectAll().where { TakesTable.id eq take }.single()[TakesTable.storageKey] }
    private suspend fun HttpClient.attach(user: User, session: UUID, storage: FakeStorageClient): Pair<UUID, String> {
        val take = take(user, session); storage.objects[key(take)] = bytes
        post(user, session, replace(take)).checked(HttpStatusCode.Created)
        return take to transaction(db) { A.selectAll().where { A.sessionId eq session }.single()[A.storageKey] }
    }
    private suspend fun HttpClient.upload(user: User, session: UUID, take: UUID, data: ByteArray = bytes): HttpResponse =
        post("/api/v1/sessions/$session/share/uploads") {
            header(HttpHeaders.Authorization, "Bearer ${user.token}")
            setBody(MultiPartFormDataContent(formData {
                append("takeId", take.toString())
                append("file", data, Headers.build { append(HttpHeaders.ContentDisposition, "filename=recording.m4a"); append(HttpHeaders.ContentType, "audio/mp4") })
            }))
        }
    private suspend fun retry(storage: FakeStorageClient, time: OffsetDateTime = now().plusSeconds(1)): JsonObject {
        val trash = StorageTrashService(db, storage)
        ShareAttachmentService(db, storage, trash).reclaim(time)
        return trash.runSharedRetryBatch(time)
    }
    private fun attachmentCount() = transaction(db) { A.selectAll().count().toInt() }
    private fun logCount() = transaction(db) { SharedAttachmentCopyLogTable.selectAll().count().toInt() }

    @Test fun L1_takeDeletionPurgesCopyAndKeepsCard() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); val s = session(u); client.agree(u)
        val (take, copy) = client.attach(u, s, storage)
        val deletion = client.send(HttpMethod.Delete, "/takes/$take", u)
        assertEquals(HttpStatusCode.OK, deletion.status, deletion.bodyAsText())
        assertEquals(0, attachmentCount()); assertEquals(1L, cardCount()); assertTrue(copy in storage.deleted)
    }
    @Test fun L2_uploadReplacementPurgesOtherSongCopy() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); client.agree(u); val s = session(u)
        val (_, copy) = client.attach(u, s, storage)
        val s2 = session(u, 2)
        val song = transaction(db) { SessionsTable.selectAll().where { SessionsTable.id eq s2 }.single()[SessionsTable.songId] }
        val metadata = """{"songId":"$song","date":"2026-11-13","recordedAt":"2026-11-13T01:00:00Z","durationSec":12,"mime":"audio/mp4","replaceOldSongTakes":true}"""
        val res = client.post("/api/v1/takes") {
            header(HttpHeaders.Authorization, "Bearer ${u.token}")
            setBody(MultiPartFormDataContent(formData {
                append("metadata", metadata)
                append("file", bytes, Headers.build { append(HttpHeaders.ContentDisposition, "filename=new.m4a") })
            }))
        }
        assertEquals(HttpStatusCode.Created, res.status, res.bodyAsText())
        assertEquals(0, attachmentCount()); assertTrue(copy in storage.deleted); assertEquals(1L, cardCount())
    }
    @Test fun L3_songDeletionPurgesCopyAndCard() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); val s = session(u); client.agree(u); val (_, copy) = client.attach(u, s, storage)
        val song = transaction(db) { SessionsTable.selectAll().where { SessionsTable.id eq s }.single()[SessionsTable.songId] }
        client.send(HttpMethod.Delete, "/songs/$song", u).checked(HttpStatusCode.OK)
        assertEquals(0, attachmentCount()); assertEquals(0L, cardCount()); assertTrue(copy in storage.deleted)
    }
    @Test fun L4_accountDeletionLeavesSharedTrashForCron() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); val s = session(u); client.agree(u); val (_, copy) = client.attach(u, s, storage)
        client.send(HttpMethod.Delete, "/me", u, """{"confirmText":"삭제합니다"}""").checked(HttpStatusCode.OK)
        assertEquals(0, attachmentCount()); assertEquals(0L, cardCount())
        assertTrue(transaction(db) { StorageTrashTable.selectAll().where { StorageTrashTable.storageKey eq copy }.any() })
        assertFalse(copy in storage.deleted)
        retry(storage); assertTrue(copy in storage.deleted)
    }
    @Test fun L5_driveMigrationKeepsPlayableCopy() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); val s = session(u); client.agree(u); val (take, copy) = client.attach(u, s, storage)
        val migration = client.send(HttpMethod.Post, "/takes/$take/migrate-drive", u, """{"driveFileId":"drive_abcdef12345"}""")
        assertEquals(HttpStatusCode.OK, migration.status, migration.bodyAsText())
        assertEquals(1, attachmentCount()); assertTrue(storage.objects.containsKey(copy)); assertFalse(copy in storage.deleted)
        val card = client.feed(u).single().jsonObject
        val id = card["attachments"]!!.jsonArray.single().jsonObject["attachmentId"]!!.jsonPrimitive.content
        client.send(HttpMethod.Get, "/community/episode-logs/${card["postId"]!!.jsonPrimitive.content}/attachments/$id/url", u).checked(HttpStatusCode.OK)
    }
    @Test fun L6_tierPauseRemovesHiddenAndPublishedAttachments() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); val owner = client.user(owner = true); client.agree(u)
        val s1 = session(u); val s2 = session(u, 2)
        client.attach(u, s1, storage); client.attach(u, s2, storage)
        val card = transaction(db) { SharedPracticeCardsTable.selectAll().where { SharedPracticeCardsTable.sessionId eq s1 }.single()[SharedPracticeCardsTable.id] }
        client.moderate(owner, card, "moderation_hidden").checked(HttpStatusCode.OK)
        client.send(HttpMethod.Put, "/admin/users/${u.id}/tier-override", owner, """{"tier":"free","until":null,"reason":"test downgrade"}""").checked(HttpStatusCode.OK)
        assertEquals(0, attachmentCount())
        assertEquals(2L, transaction(db) { StorageTrashTable.selectAll().where { StorageTrashTable.storageKey like "shared/%" }.count() })
    }
    @Test fun L7_hiddenRetentionExpiresOnlyAfterThirtyDays() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); val owner = client.user(owner = true); client.agree(u)
        val s1 = session(u); val s2 = session(u, 2)
        val (_, k1) = client.attach(u, s1, storage); val (_, k2) = client.attach(u, s2, storage)
        val cards = transaction(db) { SharedPracticeCardsTable.selectAll().associate { it[SharedPracticeCardsTable.sessionId] to it[SharedPracticeCardsTable.id] } }
        for (s in listOf(s1, s2)) client.moderate(owner, cards.getValue(s), "moderation_hidden").checked(HttpStatusCode.OK)
        transaction(db) {
            SharedPracticeCardsTable.update({ SharedPracticeCardsTable.sessionId eq s1 }) { it[hiddenAt] = now().minusDays(31) }
            SharedPracticeCardsTable.update({ SharedPracticeCardsTable.sessionId eq s2 }) { it[hiddenAt] = now().minusDays(29) }
        }
        retry(storage); assertTrue(k1 in storage.deleted); assertTrue(storage.objects.containsKey(k2)); assertEquals(1, attachmentCount())
        client.moderate(owner, cards.getValue(s2), "published").checked(HttpStatusCode.OK)
        val aid = transaction(db) { A.selectAll().single()[A.id] }
        client.send(HttpMethod.Get, "/community/episode-logs/${cards.getValue(s2)}/attachments/$aid/url", u).checked(HttpStatusCode.OK)
    }
    @Test fun D1_driveUploadThenConfirmAndIdempotentRetry() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); val s = session(u); client.agree(u); val t = take(u, s, true)
        val uploaded = client.upload(u, s, t).checked(HttpStatusCode.Created)
        assertEquals(setOf("uploadId", "expiresAt"), uploaded.keys)
        assertEquals("uploaded", transaction(db) { A.selectAll().single()[A.status] })
        val id = uploaded["uploadId"]!!.jsonPrimitive.content
        val created = transaction(db) { A.selectAll().single()[A.createdAt] }
        assertEquals(created.plusMinutes(30).toInstant(), java.time.Instant.parse(uploaded["expiresAt"]!!.jsonPrimitive.content))
        client.post(u, s, replace(t, id)).checked(HttpStatusCode.Created)
        assertEquals("ready", transaction(db) { A.selectAll().single()[A.status] })
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() }); assertEquals(1, logCount())
        client.post(u, s, replace(t, id)).checked(HttpStatusCode.OK); assertEquals(1, logCount())
        assertContentEquals(bytes, storage.objects["shared/$id.m4a"]); assertEquals(0, storage.downloadCount.get())
    }
    @Test fun D2_invalidDriveBytesAndSupabaseAreRejectedBeforeUpload() = testApplication {
        val storage = FakeStorageClient(); var uploads = 0; storage.onUploadStart = { uploads++ }
        configureApiTestApp(config, storageClient = storage)
        val u = client.user(); val s = session(u); client.agree(u); val t = take(u, s, true)
        for (data in listOf(bytes + 0, ByteArray(bytes.size))) {
            client.upload(u, s, t, data).error(HttpStatusCode.Conflict, "ATTACHMENT_UPLOAD_INVALID")
            assertEquals(0, attachmentCount()); assertEquals(0, uploads); assertTrue(storage.objects.isEmpty())
        }
        val supabase = take(u, s)
        var read = false
        val service = ShareAttachmentService(db, storage, StorageTrashService(db, storage))
        val e = assertFailsWith<ulevelp.api.ApiException> { service.uploadDrive(u.id, s, supabase) { read = true; bytes } }
        assertEquals("ATTACHMENT_UPLOAD_INVALID", e.code); assertFalse(read); assertEquals(0, uploads)
        client.upload(u, s, supabase).error(HttpStatusCode.Conflict, "ATTACHMENT_UPLOAD_INVALID")
        assertEquals(0, attachmentCount()); assertEquals(0, logCount())
    }
    @Test fun D3_uploadCannotBeConfirmedByAnotherUserTakeOrAfterExpiry() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val a = client.user(); val b = client.user(); client.agree(a); client.agree(b)
        val s = session(a); val t = take(a, s, true)
        val id = client.upload(a, s, t).checked(HttpStatusCode.Created)["uploadId"]!!.jsonPrimitive.content
        val bs = session(b); val bt = take(b, bs, true)
        client.post(b, bs, replace(bt, id)).error(HttpStatusCode.Conflict, "ATTACHMENT_UPLOAD_INVALID")
        client.post(a, s, replace(take(a, s, true), id)).error(HttpStatusCode.Conflict, "ATTACHMENT_UPLOAD_INVALID")
        transaction(db) { A.update({ A.id eq UUID.fromString(id) }) { it[createdAt] = now().minusMinutes(31) } }
        client.post(a, s, replace(t, id)).error(HttpStatusCode.Conflict, "ATTACHMENT_UPLOAD_INVALID")
        assertEquals(0, logCount()); assertEquals("uploaded", transaction(db) { A.selectAll().single()[A.status] })
    }
    @Test fun D4_C2_expiredUploadsReclaimedButActiveGuardsProtected() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val a = client.user(); client.agree(a); val s = session(a); val t = take(a, s, true)
        val id = client.upload(a, s, t).checked(HttpStatusCode.Created)["uploadId"]!!.jsonPrimitive.content
        transaction(db) { A.update({ A.id eq UUID.fromString(id) }) { it[createdAt] = now().minusMinutes(29) } }
        retry(storage); assertTrue(storage.objects.containsKey("shared/$id.m4a")); assertEquals(1, attachmentCount())
        transaction(db) { A.update({ A.id eq UUID.fromString(id) }) { it[createdAt] = now().minusMinutes(31) } }
        retry(storage); assertTrue("shared/$id.m4a" in storage.deleted); assertEquals(0, attachmentCount())
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
    }
    @Test fun C1_C3_C5_retryBackoffMetricsAndPersonalKeyExclusion() = testApplication {
        val storage = FakeStorageClient().apply { failDelete = true }
        configureApiTestApp(config, storageClient = storage)
        val start = now(); val key = "shared/${UUID.randomUUID()}.m4a"
        val id = transaction(db) {
            StorageTrashTable.deleteAll()
            StorageTrashTable.insert { it[storageKey] = key; it[nextAttemptAt] = start } get StorageTrashTable.id
        }
        for ((time, minutes) in listOf(start to 1L, start.plusMinutes(1) to 2L, start.plusMinutes(3) to 4L)) {
            val result = StorageTrashService(db, storage).runSharedRetryBatch(time)
            assertEquals(1, result["failed"]!!.jsonPrimitive.int)
            assertEquals(time.plusMinutes(minutes), transaction(db) { StorageTrashTable.selectAll().single()[StorageTrashTable.nextAttemptAt] })
            assertEquals(0, StorageTrashService(db, storage).runSharedRetryBatch(time.plusSeconds(1))["processed"]!!.jsonPrimitive.int)
        }
        assertEquals(3, transaction(db) { StorageTrashTable.selectAll().single()[StorageTrashTable.attempts] })
        transaction(db) {
            StorageTrashTable.update({ StorageTrashTable.id eq id }) { it[attempts] = 5; it[createdAt] = start.minusHours(25) }
            StorageTrashTable.insert { it[storageKey] = "private/recording.m4a"; it[nextAttemptAt] = start.minusDays(1) }
        }
        val result = StorageTrashService(db, storage).runSharedRetryBatch(start.plusMinutes(4))
        assertEquals(1, result["stuck"]!!.jsonPrimitive.int); assertEquals(1, result["overdue"]!!.jsonPrimitive.int)
        storage.failDelete = false
        val success = StorageTrashService(db, storage).runSharedRetryBatch(start.plusMinutes(7))
        assertEquals(1, success["deleted"]!!.jsonPrimitive.int)
        assertEquals(listOf("private/recording.m4a"), transaction(db) { StorageTrashTable.selectAll().map { it[StorageTrashTable.storageKey] } })
    }
    @Test fun C4_cronRequiresOidc() = testApplication {
        configureApiTestApp(config, storageClient = FakeStorageClient())
        val res = client.post("/internal/cron/storage-trash")
        assertEquals(HttpStatusCode.Unauthorized, res.status)
    }
    @Test fun C6_reclaimerSkipsLockedUploadAndNeverDeletesConfirmedCopy() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); client.agree(u); val s = session(u); val t = take(u, s, true)
        val id = UUID.fromString(client.upload(u, s, t).checked(HttpStatusCode.Created)["uploadId"]!!.jsonPrimitive.content)
        val locked = CountDownLatch(1); val release = CountDownLatch(1)
        coroutineScope {
            val confirm = async(Dispatchers.IO) {
                transaction(db) {
                    A.selectAll().where { A.id eq id }.forUpdate(ForUpdateOption.ForUpdate).single()
                    A.update({ A.id eq id }) { it[createdAt] = now().minusMinutes(31) }
                    locked.countDown()
                    assertTrue(release.await(10, TimeUnit.SECONDS))
                    A.update({ A.id eq id }) { it[status] = "ready"; it[readyAt] = now() }
                    StorageTrashTable.deleteWhere { storageKey eq "shared/$id.m4a" }
                }
            }
            assertTrue(withContext(Dispatchers.IO) { locked.await(10, TimeUnit.SECONDS) })
            try {
                withTimeout(5000) { retry(storage, now().plusMinutes(32)) }
                assertTrue(storage.deleted.isEmpty())
            } finally { release.countDown() }
            confirm.await()
        }
        retry(storage, now().plusMinutes(33)); assertTrue(storage.objects.containsKey("shared/$id.m4a"))
        assertEquals("ready", transaction(db) { A.selectAll().single()[A.status] })
    }
    @Test fun M1_countAndDailyLimitsWithSameTakeExemption() = testApplication {
        val storage = FakeStorageClient(); var uploads = 0; storage.onUploadStart = { uploads++ }
        configureApiTestApp(config, storageClient = storage)
        val u = client.user(); client.agree(u)
        var first: Pair<UUID, UUID>? = null
        repeat(20) { index ->
            val s = session(u, index + 1); val (t, _) = client.attach(u, s, storage)
            if (first == null) first = s to t
        }
        assertEquals(20, logCount()); assertEquals(20, uploads)
        val s = session(u, 21); val t = take(u, s); storage.objects[key(t)] = bytes
        val count = client.post(u, s, replace(t)).checked(HttpStatusCode.Conflict)
        assertEquals("count", count["detail"]!!.jsonObject["kind"]!!.jsonPrimitive.content)
        val (s1, t1) = requireNotNull(first)
        client.post(u, s1, replace(t1)).checked(HttpStatusCode.OK); assertEquals(20, logCount())
        client.send(HttpMethod.Delete, "/sessions/$s1/share/attachment", u).checked(HttpStatusCode.OK)
        val daily = client.post(u, s, replace(t)).checked(HttpStatusCode.Conflict)
        assertEquals("daily", daily["detail"]!!.jsonObject["kind"]!!.jsonPrimitive.content)
        assertEquals(20, uploads); assertEquals(19, attachmentCount())
        transaction(db) { SharedAttachmentCopyLogTable.update({ SharedAttachmentCopyLogTable.userId eq u.id }) { it[createdAt] = now().minusHours(25) } }
        client.post(u, s, replace(t)).checked(HttpStatusCode.Created)
        assertEquals(21, logCount())
    }
    @Test fun I1_impactAndR1_reportAttachmentUseOwnedData() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val a = client.user(); val b = client.user(); val owner = client.user(owner = true)
        val s = session(a); client.agree(a); val (t, _) = client.attach(a, s, storage)
        val song = transaction(db) { SessionsTable.selectAll().where { SessionsTable.id eq s }.single()[SessionsTable.songId] }
        val s2 = transaction(db) {
            SessionsTable.insert { it[userId] = a.id; it[songId] = song; it[date] = java.time.LocalDate.now().minusDays(1); it[seconds] = 1 } get SessionsTable.id
        }
        client.publish(a, s2)
        suspend fun impact(user: User, query: String) = client.send(HttpMethod.Get, "/community/me/share-impact?$query", user).checked(HttpStatusCode.OK)
        assertEquals(obj("""{"cards":2,"attachments":1}"""), impact(a, "songId=$song"))
        assertEquals(obj("""{"cards":0,"attachments":1}"""), impact(a, "takeId=$t"))
        assertEquals(obj("""{"cards":0,"attachments":0}"""), impact(b, "songId=$song"))
        assertEquals(obj("""{"cards":0,"attachments":0}"""), impact(b, "takeId=$t"))
        val card = transaction(db) { SharedPracticeCardsTable.selectAll().where { SharedPracticeCardsTable.sessionId eq s }.single()[SharedPracticeCardsTable.id] }
        client.report(b, card).checked(HttpStatusCode.Created)
        val report = client.send(HttpMethod.Get, "/admin/community/episode-logs/reports", owner).checked(HttpStatusCode.OK)["reports"]!!.jsonArray.single().jsonObject
        assertTrue(report["hasAttachment"]!!.jsonPrimitive.boolean)
    }
    @Test fun uploadBoundariesAndFailureCompensateWithoutPublishing() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); client.agree(u); val s = session(u); val t = take(u, s, true)
        client.upload(u, s, t, ByteArray(ShareAttachmentService.MAX_BYTES + 1)).error(HttpStatusCode.Conflict, "ATTACHMENT_LIMIT_EXCEEDED")
        client.upload(u, s, t, byteArrayOf()).error(HttpStatusCode.Conflict, "ATTACHMENT_UPLOAD_INVALID")
        assertEquals(0, attachmentCount()); assertTrue(storage.objects.isEmpty()); assertEquals(0L, cardCount())
        storage.failUpload = true
        client.upload(u, s, t).error(HttpStatusCode.BadGateway, "STORAGE_ERROR")
        assertEquals(0, attachmentCount()); assertTrue(storage.objects.isEmpty()); assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
        storage.failUpload = false
        val missing = client.post("/api/v1/sessions/$s/share/uploads") {
            header(HttpHeaders.Authorization, "Bearer ${u.token}")
            setBody(MultiPartFormDataContent(formData { append("takeId", t.toString()) }))
        }
        missing.error(HttpStatusCode.BadRequest, "INVALID_INPUT")
        assertEquals(0, attachmentCount()); assertEquals(0L, cardCount())
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
    }
    @Test fun otherUserCannotUploadOrDeleteSourceOrReadImpact() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val a = client.user(); val b = client.user(); client.agree(a); client.agree(b)
        val s = session(a); val (t, copy) = client.attach(a, s, storage)
        val drive = take(a, s, true)
        client.upload(b, s, drive).error(HttpStatusCode.NotFound, "NOT_FOUND")
        val delete = client.send(HttpMethod.Delete, "/takes/$t", b)
        assertEquals(HttpStatusCode.NotFound, delete.status, delete.bodyAsText())
        assertEquals(1, attachmentCount()); assertTrue(storage.objects.containsKey(copy)); assertTrue(storage.deleted.isEmpty())
    }
    @Test fun retryBatchCapsAtFiftyAndSkipsClaimedRows() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val time = now()
        transaction(db) { repeat(51) { index -> StorageTrashTable.insert { it[storageKey] = "shared/$index.m4a"; it[nextAttemptAt] = time } } }
        val first = StorageTrashService(db, storage).runSharedRetryBatch(time)
        assertEquals(50, first["processed"]!!.jsonPrimitive.int); assertEquals(50, storage.deleted.size)
        val last = StorageTrashService(db, storage).runSharedRetryBatch(time)
        assertEquals(1, last["processed"]!!.jsonPrimitive.int); assertEquals(51, storage.deleted.size)
    }

    private suspend fun ApplicationTestBuilder.deletionLocksCardBeforeAttachment(account: Boolean) {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); client.agree(u); val session = session(u)
        val (_, copy) = client.attach(u, session, storage)
        val card = transaction(db) { SharedPracticeCardsTable.selectAll().where { SharedPracticeCardsTable.sessionId eq session }.single()[SharedPracticeCardsTable.id] }
        val song = transaction(db) { SessionsTable.selectAll().where { SessionsTable.id eq session }.single()[SessionsTable.songId] }
        val locked = CompletableDeferred<Int>(); val release = CountDownLatch(1)
        coroutineScope {
            val hiddenCleanup = async(Dispatchers.IO) {
                transaction(db) {
                    SharedPracticeCardsTable.selectAll().where { SharedPracticeCardsTable.id eq card }.forUpdate(ForUpdateOption.ForUpdate).single()
                    val pid = exec("SELECT pg_backend_pid()") { it.next(); it.getInt(1) }!!
                    locked.complete(pid)
                    assertTrue(release.await(15, TimeUnit.SECONDS))
                }
            }
            val blocker = locked.await()
            val deletion = async {
                if (account) client.send(HttpMethod.Delete, "/me", u, """{"confirmText":"삭제합니다"}""")
                else client.send(HttpMethod.Delete, "/songs/$song", u)
            }
            try {
                val blocked = withContext(Dispatchers.IO) {
                    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
                    var observed = false
                    while (!observed && System.nanoTime() < deadline) {
                        observed = transaction(db) {
                            exec("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $blocker = ANY(pg_blocking_pids(pid)))") { it.next(); it.getBoolean(1) }!!
                        }
                        if (!observed) Thread.yield()
                    }
                    observed
                }
                assertTrue(blocked, "deletion must reach a real database lock wait")
                val available = transaction(db) {
                    A.selectAll().where { A.sessionId eq session }.forUpdate(ForUpdateOption.PostgreSQL.ForUpdate(ForUpdateOption.PostgreSQL.MODE.SKIP_LOCKED))
                        .map { it[A.storageKey] }
                }
                assertEquals(listOf(copy), available, "deletion must wait for the card before locking its attachment")
            } finally { release.countDown() }
            hiddenCleanup.await()
            val response = deletion.await()
            assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        }
        assertEquals(0, attachmentCount())
        if (account) { retry(storage); assertTrue(copy in storage.deleted) }
        else assertTrue(copy in storage.deleted)
    }
    @Test fun songDeletionUsesCardThenAttachmentLockOrder() = testApplication { deletionLocksCardBeforeAttachment(false) }
    @Test fun accountDeletionUsesCardThenAttachmentLockOrder() = testApplication { deletionLocksCardBeforeAttachment(true) }

    @Test fun sameDriveRecordingDiscardsUnusedUploadAndAllowsNextUpload() = testApplication {
        val storage = FakeStorageClient(); configureApiTestApp(config, storageClient = storage)
        val u = client.user(); client.agree(u); val s = session(u); val t = take(u, s, true)
        val original = client.upload(u, s, t).checked(HttpStatusCode.Created)["uploadId"]!!.jsonPrimitive.content
        client.post(u, s, replace(t, original)).checked(HttpStatusCode.Created)
        val unused = client.upload(u, s, t).checked(HttpStatusCode.Created)["uploadId"]!!.jsonPrimitive.content
        client.post(u, s, replace(t, unused)).checked(HttpStatusCode.OK)
        assertEquals(1, attachmentCount(), "same recording must discard its unused prepared upload")
        assertEquals(1, logCount()); assertTrue(storage.objects.containsKey("shared/$original.m4a"))
        assertTrue("shared/$unused.m4a" in storage.deleted)
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
        val nextTake = take(u, s, true)
        client.upload(u, s, nextTake).checked(HttpStatusCode.Created)
        assertEquals(nextTake, transaction(db) { A.selectAll().where { A.status eq "uploaded" }.single()[A.sourceTakeId] })
    }

}
