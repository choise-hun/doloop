package ulevelp.community

import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.notion.NotionPushWorker
import ulevelp.service.IntegrationService
import ulevelp.service.ShareAttachmentService
import ulevelp.service.StorageTrashService
import ulevelp.support.*
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.*

class ShareAttachmentApiTest : EpisodeTestSupport() {
    private fun take(
        user: User,
        session: UUID,
        key: String,
        mime: String = "audio/mp4",
        durationSec: Int = 12,
        sizeBytes: Long = 4L
    ): UUID = transaction(db) {
        val song = SessionsTable.selectAll().where { SessionsTable.id eq session }.single()[SessionsTable.songId]
        TakesTable.insert {
            it[userId] = user.id; it[sessionId] = session; it[songId] = song
            it[recordedAt] = OffsetDateTime.now(); it[TakesTable.durationSec] = durationSec; it[TakesTable.mime] = mime
            it[TakesTable.sizeBytes] = sizeBytes; it[storage] = "supabase"; it[storageKey] = key
        } get TakesTable.id
    }
    private fun replacement(id: UUID) = """{"attachment":{"mode":"replace","takeId":"$id","originalConfirmed":true}}"""

    @Test fun firstAttachmentCopiesBytesAndExposesOnlyPublicMetadata() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user(); val b = client.user(false)
        val session = session(a); val key = "${a.id}/private.m4a"
        val bytes = byteArrayOf(1, 2, 3, 4); storage.objects[key] = bytes
        val take = take(a, session, key)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)
        // A/B 권한 경계: B는 A 세션을 게시할 수 없고, A도 B 녹음을 첨부할 수 없다.
        client.post(b, session, replacement(take)).error(HttpStatusCode.NotFound, "NOT_FOUND")
        val otherSession = session(b)
        val otherTake = take(b, otherSession, "${b.id}/private.m4a")
        client.post(a, session, replacement(otherTake)).error(HttpStatusCode.NotFound, "NOT_FOUND")
        assertEquals(0L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
        assertEquals(setOf(key), storage.objects.keys)
        val post = client.post(a, session, replacement(take)).checked(HttpStatusCode.Created)["post"]!!.jsonObject
        assertEquals(take.toString(), post["attachment"]!!.jsonObject["sourceTakeId"]!!.jsonPrimitive.content)
        val card = client.feed(b).single().jsonObject
        val attachment = card["attachments"]!!.jsonArray.single().jsonObject
        assertEquals(setOf("attachmentId", "kind", "mime", "durationSec"), attachment.keys)
        val id = attachment["attachmentId"]!!.jsonPrimitive.content
        assertContentEquals(bytes, storage.objects["shared/$id.m4a"])
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
        assertEquals(1L, cardCount())
        assertEquals(300, client.send(HttpMethod.Get, "/community/episode-logs/${card["postId"]!!.jsonPrimitive.content}/attachments/$id/url", b)
            .checked(HttpStatusCode.OK)["expiresIn"]!!.jsonPrimitive.int)
    }

    @Test fun uploadFailureCompensatesWithoutPublishingCard() = testApplication {
        val storage = FakeStorageClient().apply { failUpload = true }
        configureApiTestApp(config, storageClient = storage)
        transaction(db) { StorageTrashTable.deleteAll() }
        val a = client.user(); val session = session(a); val key = "${a.id}/private.m4a"
        storage.objects[key] = byteArrayOf(1, 2, 3, 4)
        val take = take(a, session, key)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)
        client.post(a, session, replacement(take)).error(HttpStatusCode.BadGateway, "STORAGE_ERROR")
        assertEquals(0L, cardCount())
        transaction(db) {
            assertEquals(0, exec("SELECT count(*) FROM shared_card_attachments") { it.next(); it.getInt(1) })
            assertEquals(0L, StorageTrashTable.selectAll().count())
        }
        assertEquals(1, storage.deleted.size)
        assertTrue(storage.deleted.single().startsWith("shared/"))
        assertEquals(setOf(key), storage.objects.keys)
    }

    // A3: 동의 없음 / 버전 불일치 / 철회 뒤 / 재동의
    @Test fun consentRequiredAndWithdrawAndReconsentFlow() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/a3.m4a"
        storage.objects[key] = byteArrayOf(1, 2, 3, 4)
        val take = take(a, session, key)

        val initial = client.send(HttpMethod.Get, "/community/me/share-consent", a).checked(HttpStatusCode.OK)
        assertEquals(false, initial["cardShareAllowed"]!!.jsonPrimitive.boolean)
        assertEquals(false, initial["recordingAllowed"]!!.jsonPrimitive.boolean)
        assertEquals(JsonNull, initial["consentedVersion"])
        assertEquals(JsonNull, initial["consentedAt"])
        assertEquals(JsonNull, initial["recordingWithdrawnAt"])

        val noConsent = client.post(a, session, replacement(take)).checked(HttpStatusCode.Conflict)
        assertEquals("SHARE_CONSENT_REQUIRED", noConsent["code"]!!.jsonPrimitive.content)
        assertEquals("recording", noConsent["detail"]!!.jsonObject["scope"]!!.jsonPrimitive.content)
        assertEquals(1, noConsent["detail"]!!.jsonObject["requiredVersion"]!!.jsonPrimitive.int)
        assertEquals(0L, cardCount())

        val outdated = client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":99}""").checked(HttpStatusCode.Conflict)
        assertEquals("SHARE_NOTICE_OUTDATED", outdated["code"]!!.jsonPrimitive.content)
        assertEquals(1, outdated["detail"]!!.jsonObject["noticeVersion"]!!.jsonPrimitive.int)

        val agreed = client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)
        assertEquals(true, agreed["cardShareAllowed"]!!.jsonPrimitive.boolean)
        assertEquals(true, agreed["recordingAllowed"]!!.jsonPrimitive.boolean)
        assertEquals(1, agreed["consentedVersion"]!!.jsonPrimitive.int)
        assertTrue(agreed["consentedAt"]!!.jsonPrimitive.content.endsWith("Z"))
        assertEquals(JsonNull, agreed["recordingWithdrawnAt"])

        // 멱등 동의: 같은 버전 재요청 시 행 추가 없음
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)
        assertEquals(1L, transaction(db) { CommunityShareConsentsTable.selectAll().count() })

        val withdrawn = client.send(HttpMethod.Post, "/community/me/share-consent/withdraw-recording", a, """{"removeExisting":false}""").checked(HttpStatusCode.OK)
        val wConsent = withdrawn["consent"]!!.jsonObject
        assertEquals(true, wConsent["cardShareAllowed"]!!.jsonPrimitive.boolean)
        assertEquals(false, wConsent["recordingAllowed"]!!.jsonPrimitive.boolean)
        assertTrue(wConsent["recordingWithdrawnAt"]!!.jsonPrimitive.content.endsWith("Z"))

        client.post(a, session, replacement(take)).error(HttpStatusCode.Conflict, "SHARE_CONSENT_REQUIRED")

        val reconsented = client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)
        assertEquals(true, reconsented["recordingAllowed"]!!.jsonPrimitive.boolean)
        assertEquals(JsonNull, reconsented["recordingWithdrawnAt"])
        client.post(a, session, replacement(take)).checked(HttpStatusCode.Created)
    }

    // A4: 녹음 없는 공유는 동의 불필요 (S3b-1 회귀 없음)
    @Test fun shareWithoutAttachmentDoesNotRequireConsent() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        configureApiTestApp(config, storageClient = FakeStorageClient())
        val a = client.user()
        val session = session(a)
        client.post(a, session).checked(HttpStatusCode.Created)
        assertEquals(1L, cardCount())
    }

    // A5: 소유·세션 경계 (남의 녹음, 같은 사용자의 다른 세션 녹음 모두 404)
    @Test fun ownershipAndSessionBoundaryRejectsForeignOrOtherSessionTake() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user(); val b = client.user()
        val sessionA1 = session(a, 1)
        val sessionA2 = session(a, 2)
        val sessionB = session(b, 3)
        val takeA2 = take(a, sessionA2, "${a.id}/other.m4a")
        val takeB = take(b, sessionB, "${b.id}/b.m4a")
        storage.objects["${a.id}/other.m4a"] = byteArrayOf(1, 2)
        storage.objects["${b.id}/b.m4a"] = byteArrayOf(3, 4)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        client.post(a, sessionA1, replacement(takeB)).error(HttpStatusCode.NotFound, "NOT_FOUND")
        client.post(a, sessionA1, replacement(takeA2)).error(HttpStatusCode.NotFound, "NOT_FOUND")
        assertEquals(0, storage.downloadCount.get())
        assertEquals(0L, cardCount())
        assertEquals(0L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
    }

    // A6: 길이(>300초) · 크기(>10MB) 상한
    @Test fun attachmentDurationAndSizeLimitsRejectBeforeAndAfterDownload() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val longTake = take(a, session, "${a.id}/long.m4a", durationSec = 301, sizeBytes = 100L)
        val longRes = client.post(a, session, replacement(longTake)).checked(HttpStatusCode.Conflict)
        assertEquals("ATTACHMENT_LIMIT_EXCEEDED", longRes["code"]!!.jsonPrimitive.content)
        assertEquals("duration", longRes["detail"]!!.jsonObject["kind"]!!.jsonPrimitive.content)
        assertEquals(300, longRes["detail"]!!.jsonObject["limit"]!!.jsonPrimitive.int)
        assertEquals(0, storage.downloadCount.get())

        val bigMetaTake = take(a, session, "${a.id}/bigmeta.m4a", durationSec = 10, sizeBytes = 10_485_761L)
        val bigMetaRes = client.post(a, session, replacement(bigMetaTake)).checked(HttpStatusCode.Conflict)
        assertEquals("ATTACHMENT_LIMIT_EXCEEDED", bigMetaRes["code"]!!.jsonPrimitive.content)
        assertEquals("size", bigMetaRes["detail"]!!.jsonObject["kind"]!!.jsonPrimitive.content)
        assertEquals(10_485_760, bigMetaRes["detail"]!!.jsonObject["limit"]!!.jsonPrimitive.int)
        assertEquals(0, storage.downloadCount.get())

        // 메타 sizeBytes는 작지만 실제 다운로드 바이트가 10MB+1인 경우
        val bigActualKey = "${a.id}/bigactual.m4a"
        storage.objects[bigActualKey] = ByteArray(10_485_761) { 7 }
        val bigActualTake = take(a, session, bigActualKey, durationSec = 10, sizeBytes = 4L)
        val bigActualRes = client.post(a, session, replacement(bigActualTake)).checked(HttpStatusCode.Conflict)
        assertEquals("ATTACHMENT_LIMIT_EXCEEDED", bigActualRes["code"]!!.jsonPrimitive.content)
        assertEquals("size", bigActualRes["detail"]!!.jsonObject["kind"]!!.jsonPrimitive.content)
        assertEquals(1, storage.downloadCount.get())
        assertEquals(0L, cardCount())
        assertEquals(0L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
    }

    // A7: 동시 복사 1건 제한
    @Test fun concurrentCopyAllowsOnlyOneInProgress() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        val uploadStarted = CompletableDeferred<Unit>()
        val releaseUpload = CompletableDeferred<Unit>()
        storage.onUploadStart = {
            uploadStarted.complete(Unit)
            releaseUpload.await()
        }
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/c.m4a"
        storage.objects[key] = byteArrayOf(1, 2, 3)
        val take = take(a, session, key)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        coroutineScope {
            val first = async { client.post(a, session, replacement(take)) }
            uploadStarted.await()
            val second = client.post(a, session, replacement(take))
            second.error(HttpStatusCode.Conflict, "ATTACHMENT_COPY_IN_PROGRESS")
            releaseUpload.complete(Unit)
            first.await().checked(HttpStatusCode.Created)
        }
        assertEquals(1L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
        assertEquals(1, storage.objects.keys.count { it.startsWith("shared/") })
    }

    // A8: 같은 녹음 재요청 시 재복사·다운로드 없음
    @Test fun repostingSameTakeSkipsCopyAndDownload() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/same.m4a"
        storage.objects[key] = byteArrayOf(9, 8, 7)
        val take = take(a, session, key)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val first = client.post(a, session, replacement(take)).checked(HttpStatusCode.Created)
        val firstAttId = first["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content
        storage.downloadCount.set(0)
        storage.failDownload = true

        val second = client.post(a, session, replacement(take)).checked(HttpStatusCode.OK)
        assertEquals(firstAttId, second["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content)
        assertEquals(0, storage.downloadCount.get())
    }

    // A9: 다른 녹음으로 교체 시 새 사본 ready, 옛 키 삭제
    @Test fun replaceWithDifferentTakeDeletesOldSharedObject() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key1 = "${a.id}/t1.m4a"; val key2 = "${a.id}/t2.m4a"
        storage.objects[key1] = byteArrayOf(1, 1)
        storage.objects[key2] = byteArrayOf(2, 2, 2)
        val take1 = take(a, session, key1)
        val take2 = take(a, session, key2)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val p1 = client.post(a, session, replacement(take1)).checked(HttpStatusCode.Created)
        val id1 = p1["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content

        val p2 = client.post(a, session, replacement(take2)).checked(HttpStatusCode.OK)
        val id2 = p2["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content
        assertNotEquals(id1, id2)
        assertFalse(storage.objects.containsKey("shared/$id1.m4a"))
        assertTrue(storage.deleted.contains("shared/$id1.m4a"))
        assertContentEquals(byteArrayOf(2, 2, 2), storage.objects["shared/$id2.m4a"])
        assertEquals(1L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
    }

    // A10: 교체 실패 시 기존 첨부 유지·재생 가능
    @Test fun replaceFailureKeepsExistingReadyAttachmentPlayable() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user(); val b = client.user(false)
        val session = session(a)
        val key1 = "${a.id}/k1.m4a"; val key2 = "${a.id}/k2.m4a"
        storage.objects[key1] = byteArrayOf(1, 2)
        storage.objects[key2] = byteArrayOf(3, 4)
        val take1 = take(a, session, key1)
        val take2 = take(a, session, key2)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val created = client.post(a, session, replacement(take1)).checked(HttpStatusCode.Created)
        val postId = created["post"]!!.jsonObject["postId"]!!.jsonPrimitive.content
        val attId = created["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content

        storage.failDownload = true
        client.post(a, session, replacement(take2)).error(HttpStatusCode.BadGateway, "STORAGE_ERROR")
        storage.failDownload = false

        assertTrue(storage.objects.containsKey("shared/$attId.m4a"))
        client.send(HttpMethod.Get, "/community/episode-logs/$postId/attachments/$attId/url", b).checked(HttpStatusCode.OK)
    }

    // A11: 복사 중 철회 → 공유 409 ATTACHMENT_COPY_EXPIRED, 철회 상태 유지
    @Test fun withdrawDuringUploadCancelsPublishAndCleansUp() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        val uploadStarted = CompletableDeferred<Unit>()
        val releaseUpload = CompletableDeferred<Unit>()
        var uploadingKey: String? = null
        storage.onUploadStart = { key ->
            uploadingKey = key
            uploadStarted.complete(Unit)
            releaseUpload.await()
        }
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/w.m4a"
        storage.objects[key] = byteArrayOf(5, 6)
        val take = take(a, session, key)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        coroutineScope {
            val shareJob = async { client.post(a, session, replacement(take)) }
            uploadStarted.await()
            client.send(HttpMethod.Delete, "/sessions/$session/share", a).checked(HttpStatusCode.OK)
            releaseUpload.complete(Unit)
            shareJob.await().error(HttpStatusCode.Conflict, "ATTACHMENT_COPY_EXPIRED")
        }

        assertEquals(0, client.feed(a).size)
        assertEquals(0L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
        assertEquals(setOf(key), storage.objects.keys)
        assertTrue(storage.deleted.contains(requireNotNull(uploadingKey)))
    }

    // A12: 복사 중 원본 녹음 삭제 → 409 ATTACHMENT_SOURCE_GONE, 사본 키 정리
    @Test fun deletingSourceTakeDuringUploadReturnsSourceGoneAndCleansUp() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        val uploadStarted = CompletableDeferred<Unit>()
        val releaseUpload = CompletableDeferred<Unit>()
        var uploadingKey: String? = null
        storage.onUploadStart = { key ->
            uploadingKey = key
            uploadStarted.complete(Unit)
            releaseUpload.await()
        }
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/del.m4a"
        storage.objects[key] = byteArrayOf(5, 6)
        val take = take(a, session, key)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        coroutineScope {
            val shareJob = async { client.post(a, session, replacement(take)) }
            uploadStarted.await()
            transaction(db) { TakesTable.deleteWhere { id eq take } }
            releaseUpload.complete(Unit)
            shareJob.await().error(HttpStatusCode.Conflict, "ATTACHMENT_SOURCE_GONE")
        }

        assertEquals(0L, cardCount())
        assertEquals(0L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
        assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
        assertEquals(setOf(key), storage.objects.keys)
        assertTrue(storage.deleted.contains(requireNotNull(uploadingKey)))
    }

    // A13: none vs DELETE /attachment (스냅샷·publishedAt 유지 여부)
    @Test fun noneModeUpdatesSnapshotWhileDeleteAttachmentPreservesPublishedAtAndSnapshot() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/n.m4a"
        storage.objects[key] = byteArrayOf(1, 2)
        val take = take(a, session, key)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val created = client.post(a, session, replacement(take)).checked(HttpStatusCode.Created)["post"]!!.jsonObject
        val publishedAt = created["publishedAt"]!!.jsonPrimitive.content
        val attId = created["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content

        // 세션 통계 변경 후 DELETE /attachment → publishedAt·스냅샷(seconds=90) 불변
        transaction(db) { SessionsTable.update({ SessionsTable.id eq session }) { it[seconds] = 777 } }
        val removed = client.send(HttpMethod.Delete, "/sessions/$session/share/attachment", a).checked(HttpStatusCode.OK)
        assertEquals(true, removed["ok"]!!.jsonPrimitive.boolean)
        assertEquals(1, removed["removed"]!!.jsonPrimitive.int)
        assertEquals(0, client.send(HttpMethod.Delete, "/sessions/$session/share/attachment", a).checked(HttpStatusCode.OK)["removed"]!!.jsonPrimitive.int)
        assertTrue(storage.deleted.contains("shared/$attId.m4a"))

        val afterDelete = client.feed(a).single().jsonObject
        assertEquals(publishedAt, afterDelete["publishedAt"]!!.jsonPrimitive.content)
        assertEquals(90, afterDelete["seconds"]!!.jsonPrimitive.int)
        assertEquals(0, afterDelete["attachments"]!!.jsonArray.size)

        // 다시 첨부 후 mode=none 재게시 → 첨부 0 + 스냅샷 갱신(888)
        client.post(a, session, replacement(take)).checked(HttpStatusCode.OK)
        transaction(db) { SessionsTable.update({ SessionsTable.id eq session }) { it[seconds] = 888 } }
        client.post(a, session, """{"attachment":{"mode":"none"}}""").checked(HttpStatusCode.OK)

        val afterNone = client.feed(a).single().jsonObject
        assertEquals(888, afterNone["seconds"]!!.jsonPrimitive.int)
        assertEquals(0, afterNone["attachments"]!!.jsonArray.size)
        assertEquals(0L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
    }

    // A14: 동의 철회 removeExisting false / true
    @Test fun withdrawRecordingConsentRespectsRemoveExistingFlag() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val s1 = session(a, 1); val s2 = session(a, 2)
        val k1 = "${a.id}/1.m4a"; val k2 = "${a.id}/2.m4a"
        storage.objects[k1] = byteArrayOf(1); storage.objects[k2] = byteArrayOf(2)
        val t1 = take(a, s1, k1); val t2 = take(a, s2, k2)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val id1 = client.post(a, s1, replacement(t1)).checked(HttpStatusCode.Created)["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content
        val id2 = client.post(a, s2, replacement(t2)).checked(HttpStatusCode.Created)["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content

        val keepRes = client.send(HttpMethod.Post, "/community/me/share-consent/withdraw-recording", a, """{"removeExisting":false}""").checked(HttpStatusCode.OK)
        assertEquals(0, keepRes["removedAttachments"]!!.jsonPrimitive.int)
        assertEquals(2L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
        client.post(a, s1, replacement(t1)).error(HttpStatusCode.Conflict, "SHARE_CONSENT_REQUIRED")

        val rmRes = client.send(HttpMethod.Post, "/community/me/share-consent/withdraw-recording", a, """{"removeExisting":true}""").checked(HttpStatusCode.OK)
        assertEquals(2, rmRes["removedAttachments"]!!.jsonPrimitive.int)
        assertEquals(0L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
        assertEquals(2L, cardCount())
        assertTrue(storage.deleted.containsAll(listOf("shared/$id1.m4a", "shared/$id2.m4a")))
        assertTrue(client.feed(a).all { it.jsonObject["attachments"]!!.jsonArray.isEmpty() })
    }

    // A15: 재생 주소 접근·비대상 404
    @Test fun attachmentUrlEnforcesEligibilityAndMembership() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user(); val owner = client.user(owner = true); val c = client.user(paid = false)
        val s1 = session(a, 1); val s2 = session(a, 2)
        val k1 = "${a.id}/1.m4a"; val k2 = "${a.id}/2.m4a"
        storage.objects[k1] = byteArrayOf(1); storage.objects[k2] = byteArrayOf(2)
        val t1 = take(a, s1, k1); val t2 = take(a, s2, k2)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val p1 = client.post(a, s1, replacement(t1)).checked(HttpStatusCode.Created)["post"]!!.jsonObject
        val p2 = client.post(a, s2, replacement(t2)).checked(HttpStatusCode.Created)["post"]!!.jsonObject
        val post1 = p1["postId"]!!.jsonPrimitive.content
        val att1 = p1["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content
        val att2 = p2["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content

        val urlRes = client.send(HttpMethod.Get, "/community/episode-logs/$post1/attachments/$att1/url", c).checked(HttpStatusCode.OK)
        assertEquals(300, urlRes["expiresIn"]!!.jsonPrimitive.int)
        assertTrue(urlRes["url"]!!.jsonPrimitive.content.contains("shared/$att1.m4a"))

        // 다른 카드의 첨부 id
        client.send(HttpMethod.Get, "/community/episode-logs/$post1/attachments/$att2/url", c).error(HttpStatusCode.NotFound, "NOT_FOUND")
        // 숨김 뒤 404
        client.moderate(owner, UUID.fromString(post1), "moderation_hidden").checked(HttpStatusCode.OK)
        client.send(HttpMethod.Get, "/community/episode-logs/$post1/attachments/$att1/url", c).error(HttpStatusCode.NotFound, "NOT_FOUND")
        // 철회 뒤 404
        client.moderate(owner, UUID.fromString(post1), "published").checked(HttpStatusCode.OK)
        client.send(HttpMethod.Delete, "/sessions/$s1/share", a).checked(HttpStatusCode.OK)
        client.send(HttpMethod.Get, "/community/episode-logs/$post1/attachments/$att1/url", c).error(HttpStatusCode.NotFound, "NOT_FOUND")
    }

    // A16: 공개/내 게시물 DTO 허용 필드 정확 일치
    @Test fun publicAndMyDtosExposeOnlyAllowedAttachmentFields() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/dto.m4a"
        storage.objects[key] = byteArrayOf(1, 2, 3, 4)
        val take = take(a, session, key)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)
        client.post(a, session, replacement(take)).checked(HttpStatusCode.Created)

        val pubAtt = client.feed(a).single().jsonObject["attachments"]!!.jsonArray.single().jsonObject
        assertEquals(setOf("attachmentId", "kind", "mime", "durationSec"), pubAtt.keys)

        val myPost = client.send(HttpMethod.Get, "/community/me/episode-logs", a).checked(HttpStatusCode.OK)["posts"]!!.jsonArray.single().jsonObject
        val myAtt = myPost["attachment"]!!.jsonObject
        assertEquals(setOf("attachmentId", "sourceTakeId", "mime", "durationSec", "readyAt"), myAtt.keys)
        assertTrue(myAtt["readyAt"]!!.jsonPrimitive.content.endsWith("Z"))
    }

    // A17: 노션 cron 배치는 31분 뒤에도 GUARD_HOLD 보류 행을 지우지 않는다
    @Test fun notionCronDoesNotPurgeGuardHoldRowEvenAfter31Minutes() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        val key = "shared/${UUID.randomUUID()}.m4a"
        storage.objects[key] = byteArrayOf(1, 2, 3)
        transaction(db) {
            StorageTrashTable.insert {
                it[storageKey] = key
                it[nextAttemptAt] = ShareAttachmentService.GUARD_HOLD
            }
        }
        val futureClock = Clock.fixed(Instant.now().plusSeconds(31 * 60), ZoneOffset.UTC)
        val worker = NotionPushWorker(
            db = db,
            integrationService = IntegrationService(db, null, FakeIntegrationCheckClient()),
            notionClient = FakeNotionClient(),
            storageClient = storage,
            storageTrashService = StorageTrashService(db, storage),
            publicAppUrl = "http://localhost",
            clock = futureClock
        )
        val cron = worker.runCronBatch()
        assertEquals(0, cron.purgedTrash)
        assertTrue(storage.deleted.isEmpty())
        assertTrue(storage.objects.containsKey(key))
        assertEquals(1L, transaction(db) { StorageTrashTable.selectAll().count() })
    }

    // A18: 31분 지난 copying 행 + 보류 행 회수 후 새 요청 성공
    @Test fun expiredCopyingRowIsReclaimedBeforeNewReplace() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val takeKey = "${a.id}/t.m4a"
        storage.objects[takeKey] = byteArrayOf(7, 8)
        val take = take(a, session, takeKey)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val staleId = UUID.randomUUID()
        val staleKey = "shared/$staleId.m4a"
        storage.objects[staleKey] = byteArrayOf(9, 9)
        transaction(db) {
            SharedCardAttachmentsTable.insert {
                it[id] = staleId; it[SharedCardAttachmentsTable.sessionId] = session; it[userId] = a.id
                it[kind] = "audio_copy"; it[sourceTakeId] = take; it[storageKey] = staleKey
                it[mime] = "audio/mp4"; it[sizeBytes] = 2L; it[durationSec] = 12
                it[status] = "copying"; it[originalConfirmedAt] = OffsetDateTime.now(ZoneOffset.UTC)
                it[createdAt] = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(31)
            }
            StorageTrashTable.insert {
                it[storageKey] = staleKey
                it[nextAttemptAt] = ShareAttachmentService.GUARD_HOLD
            }
        }

        val res = client.post(a, session, replacement(take)).checked(HttpStatusCode.Created)
        val newAttId = res["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content
        assertNotEquals(staleId.toString(), newAttId)
        assertTrue(storage.deleted.contains(staleKey))
        assertFalse(storage.objects.containsKey(staleKey))
        assertTrue(storage.objects.containsKey("shared/$newAttId.m4a"))
        assertEquals(1L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
    }

    // A20: audio/webm 녹음 첨부 → .weba 확장자 사본 생성
    @Test fun webmTakeCopiesToWebaExtension() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val key = "${a.id}/rec.webm"
        val bytes = byteArrayOf(11, 22, 33, 44)
        storage.objects[key] = bytes
        val take = take(a, session, key, mime = "audio/webm")
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        val res = client.post(a, session, replacement(take)).checked(HttpStatusCode.Created)
        val attId = res["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content
        assertContentEquals(bytes, storage.objects["shared/$attId.weba"])
    }

    // A21: 회수·확정 직렬화 — 회수 purge 뒤 늦게 끝난 첫 upload도 최종 정리되고 ready 파일은 보존
    @Test fun reclaimAndConfirmSerializationPreventsOrphanAndDeletedReadyFile() = testApplication {
        transaction(db) { StorageTrashTable.deleteAll() }
        val storage = FakeStorageClient()
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        var firstKey: String? = null
        storage.onUploadStart = { key ->
            if (firstKey == null) {
                firstKey = key
                firstStarted.complete(Unit)
                releaseFirst.await()
            }
        }
        configureApiTestApp(config, storageClient = storage)
        val a = client.user()
        val session = session(a)
        val k1 = "${a.id}/first.m4a"; val k2 = "${a.id}/second.m4a"
        storage.objects[k1] = byteArrayOf(1, 2); storage.objects[k2] = byteArrayOf(3, 4)
        val t1 = take(a, session, k1); val t2 = take(a, session, k2)
        client.send(HttpMethod.Post, "/community/me/share-consent", a, """{"noticeVersion":1}""").checked(HttpStatusCode.OK)

        coroutineScope {
            val firstJob = async { client.post(a, session, replacement(t1)) }
            firstStarted.await()

            // 첫 요청 copying 행을 31분 전으로 변경 후 두 번째 요청으로 회수 + 확정
            transaction(db) {
                SharedCardAttachmentsTable.update({ SharedCardAttachmentsTable.storageKey eq requireNotNull(firstKey) }) {
                    it[createdAt] = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(31)
                }
            }
            val secondRes = client.post(a, session, replacement(t2)).checked(HttpStatusCode.Created)
            val readyAttId = secondRes["post"]!!.jsonObject["attachment"]!!.jsonObject["attachmentId"]!!.jsonPrimitive.content
            val readyKey = "shared/$readyAttId.m4a"

            // 이제 첫 요청 upload가 늦게 완료되더라도 tx2는 409로 끝나고 보상 정리가 첫 키를 다시 삭제한다
            releaseFirst.complete(Unit)
            firstJob.await().error(HttpStatusCode.Conflict, "ATTACHMENT_COPY_EXPIRED")

            assertFalse(storage.objects.containsKey(requireNotNull(firstKey)))
            assertTrue(storage.objects.containsKey(readyKey))
            assertFalse(storage.deleted.contains(readyKey))
            assertEquals(0L, transaction(db) { StorageTrashTable.selectAll().count() })
            assertEquals(1L, transaction(db) { SharedCardAttachmentsTable.selectAll().count() })
        }
    }
}
