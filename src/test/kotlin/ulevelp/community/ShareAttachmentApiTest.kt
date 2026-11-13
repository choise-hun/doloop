package ulevelp.community

import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.support.*
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.test.*

class ShareAttachmentApiTest : EpisodeTestSupport() {
    private fun take(user: User, session: UUID, key: String): UUID = transaction(db) {
        val song = SessionsTable.selectAll().where { SessionsTable.id eq session }.single()[SessionsTable.songId]
        TakesTable.insert {
            it[userId] = user.id; it[sessionId] = session; it[songId] = song
            it[recordedAt] = OffsetDateTime.now(); it[durationSec] = 12; it[mime] = "audio/mp4"
            it[sizeBytes] = 4; it[storage] = "supabase"; it[storageKey] = key
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
}
