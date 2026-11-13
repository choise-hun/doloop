package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import org.slf4j.LoggerFactory
import ulevelp.api.*
import ulevelp.db.*
import ulevelp.db.SharedCardAttachmentsTable as A
import ulevelp.db.CommunityShareConsentsTable as S
import ulevelp.storage.StorageClient
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

object ShareNotice {
    const val CURRENT_VERSION = 1
    const val REQUIRED_VERSION = 1
}

/** DB 밖에서 복사하며, 보류 정리 행은 확정/회수/보상만 해제한다. */
class ShareAttachmentService(private val db: Database?, private val storage: StorageClient?, private val trash: StorageTrashService) {
    companion object {
        val GUARD_HOLD: OffsetDateTime = OffsetDateTime.parse("9999-12-31T00:00:00Z")
        const val MAX_BYTES = 10_485_760
    }
    private val log = LoggerFactory.getLogger(ShareAttachmentService::class.java)
    private fun requireDb() = db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")
    private fun requireStorage() = storage ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "STORAGE_UNAVAILABLE", "저장소가 연결되어 있지 않습니다.")
    private fun now() = OffsetDateTime.now(ZoneOffset.UTC)
    private fun conflict(code: String, detail: JsonObject? = null): Nothing = throw ApiException(HttpStatusCode.Conflict, code, "첨부 요청을 완료할 수 없습니다.", detail = detail)
    private fun limit(kind: String, limit: Int): Nothing = conflict("ATTACHMENT_LIMIT_EXCEEDED", buildJsonObject { put("kind", kind); put("limit", limit) })
    private fun Transaction.latest(userId: UUID) = S.selectAll().where { S.userId eq userId }.orderBy(S.id to SortOrder.DESC).limit(1).singleOrNull()
    private fun Transaction.consentDto(userId: UUID): ShareConsentDto {
        val last = latest(userId)
        val agree = S.selectAll().where { (S.userId eq userId) and (S.action eq "agree") }.orderBy(S.id to SortOrder.DESC).limit(1).singleOrNull()
        val allowed = agree != null && agree[S.noticeVersion] >= ShareNotice.REQUIRED_VERSION
        return ShareConsentDto(ShareNotice.CURRENT_VERSION, ShareNotice.REQUIRED_VERSION, allowed,
            last?.get(S.action) == "agree" && last[S.noticeVersion] >= ShareNotice.REQUIRED_VERSION,
            agree?.get(S.noticeVersion), episodeTs(agree?.get(S.createdAt)),
            if (last?.get(S.action) == "withdraw_recording") episodeTs(last[S.createdAt]) else null)
    }
    internal fun Transaction.requireRecordingConsent(userId: UUID) {
        if (!consentDto(userId).recordingAllowed) conflict("SHARE_CONSENT_REQUIRED", buildJsonObject { put("scope", "recording"); put("requiredVersion", ShareNotice.REQUIRED_VERSION) })
    }
    suspend fun consent(userId: UUID): ShareConsentDto = DatabaseFactory.dbQuery(requireDb()) { consentDto(userId) }
    suspend fun agree(userId: UUID, version: Int): ShareConsentDto = DatabaseFactory.dbQuery(requireDb()) {
        tierContext(userId, lock = true)
        if (version != ShareNotice.CURRENT_VERSION) conflict("SHARE_NOTICE_OUTDATED", buildJsonObject { put("noticeVersion", ShareNotice.CURRENT_VERSION) })
        val last = latest(userId)
        if (last?.get(S.action) != "agree" || last[S.noticeVersion] != version) S.insert {
            it[S.userId] = userId; it[action] = "agree"; it[noticeVersion] = version
        }
        consentDto(userId)
    }
    internal suspend fun withdrawConsent(userId: UUID, removeExisting: Boolean, lockSources: Transaction.() -> Unit): WithdrawRecordingConsentResponse {
        val (response, ids) = DatabaseFactory.dbQuery(requireDb()) {
            tierContext(userId, lock = true)
            lockSources()
            S.insert { it[S.userId] = userId; it[action] = "withdraw_recording"; it[noticeVersion] = ShareNotice.CURRENT_VERSION }
            val count = if (removeExisting) A.selectAll().where { A.userId eq userId }.count().toInt() else 0
            val ids = if (removeExisting) removeShareAttachments { A.userId eq userId } else emptyList()
            WithdrawRecordingConsentResponse(consentDto(userId), count) to ids
        }
        trash.purge(ids)
        return response
    }

    /** 호출자는 프로필 → 곡 → 세션 → 카드 순으로 잠근다. 첨부 행 잠금은 확정과 회수를 직렬화한다. */
    internal fun Transaction.removeShareAttachments(condition: SqlExpressionBuilder.() -> Op<Boolean>): List<Long> {
        val rows = A.selectAll().where(condition).orderBy(A.id).forUpdate(ForUpdateOption.ForUpdate).toList()
        val ids = rows.flatMap { row ->
            val key = row[A.storageKey]
            if (row[A.status] == "ready") listOf(StorageTrashTable.insert { it[storageKey] = key } get StorageTrashTable.id)
            else releaseGuard(key)
        }
        val attachments = rows.map { it[A.id] }
        if (attachments.isNotEmpty()) A.deleteWhere { A.id inList attachments }
        return ids
    }
    private fun Transaction.releaseGuard(key: String): List<Long> {
        val ids = StorageTrashTable.selectAll().where { StorageTrashTable.storageKey eq key }.map { it[StorageTrashTable.id] }
        if (ids.isEmpty()) return listOf(StorageTrashTable.insert { it[storageKey] = key } get StorageTrashTable.id)
        StorageTrashTable.update({ StorageTrashTable.id inList ids }) { it[nextAttemptAt] = now() }
        return ids
    }
    internal fun Transaction.ready(sessionId: UUID): ResultRow? = A.selectAll().where { (A.sessionId eq sessionId) and (A.status eq "ready") }.singleOrNull()
    internal fun Transaction.publicAttachments(sessionId: UUID): List<PublicCardAttachmentDto> = ready(sessionId)?.let {
        listOf(PublicCardAttachmentDto(it[A.id].toString(), it[A.kind], it[A.mime], it[A.durationSec]))
    } ?: emptyList()
    internal fun Transaction.myAttachment(sessionId: UUID): MyCardAttachmentDto? = ready(sessionId)?.let {
        MyCardAttachmentDto(it[A.id].toString(), it[A.sourceTakeId].toString(), it[A.mime], it[A.durationSec], episodeTs(it[A.readyAt])!!)
    }

    private data class CopyPlan(val id: UUID, val key: String, val take: ResultRow, val reclaimIds: List<Long>)
    internal suspend fun <T : Any> replace(userId: UUID, sessionId: UUID, input: ShareAttachmentInput,
        validate: Transaction.() -> Unit, publish: Transaction.() -> T): T {
        val attId = UUID.randomUUID()
        var committedPlan: CopyPlan? = null
        try {
            val (kept, plan) = DatabaseFactory.dbQuery(requireDb()) {
                validate()
                requireRecordingConsent(userId)
                val takeId = requireNotNull(input.takeId)
                val take = TakesTable.selectAll().where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) and (TakesTable.sessionId eq sessionId) }
                    .singleOrNull() ?: throw NotFoundException()
                if (input.uploadId != null && take[TakesTable.storage] != "drive") throw InvalidInputException("uploadId는 Drive 녹음에만 사용할 수 있습니다.")
                if (ready(sessionId)?.get(A.sourceTakeId) == takeId) return@dbQuery publish() to null
                if (take[TakesTable.storage] == "drive") conflict("ATTACHMENT_UPLOAD_REQUIRED")
                if (input.uploadId != null) throw InvalidInputException("uploadId는 Drive 녹음에만 사용할 수 있습니다.")
                if (take[TakesTable.durationSec] > 300) limit("duration", 300)
                if (take[TakesTable.sizeBytes] > MAX_BYTES) limit("size", MAX_BYTES)
                requireStorage()
                val pending = A.selectAll().where { (A.userId eq userId) and (A.status inList listOf("copying", "uploaded")) }
                    .forUpdate(ForUpdateOption.ForUpdate).toList()
                // 실패로 회수까지 롤백되지 않게, 유효한 진행 행은 회수 전에 검사한다.
                if (pending.any { !it[A.createdAt].isBefore(now().minusMinutes(30)) }) conflict("ATTACHMENT_COPY_IN_PROGRESS")
                val expired = pending.map { it[A.id] }
                val reclaimIds = removeShareAttachments { A.id inList expired }
                val ext = TakeService.MIME_EXT[take[TakesTable.mime]] ?: throw InvalidInputException("mime 형식이 올바르지 않습니다.")
                val key = "shared/$attId.$ext"
                A.insert {
                    it[A.id] = attId; it[A.sessionId] = sessionId; it[A.userId] = userId; it[kind] = "audio_copy"
                    it[sourceTakeId] = takeId; it[storageKey] = key; it[mime] = take[TakesTable.mime]
                    it[sizeBytes] = take[TakesTable.sizeBytes]; it[durationSec] = take[TakesTable.durationSec]
                    it[status] = "copying"; it[originalConfirmedAt] = now()
                }
                StorageTrashTable.insert { it[storageKey] = key; it[nextAttemptAt] = GUARD_HOLD }
                null to CopyPlan(attId, key, take, reclaimIds)
            }
            if (kept != null) return kept
            val p = requireNotNull(plan)
            committedPlan = p
            trash.purge(p.reclaimIds)
            val bytes = storageIo { requireStorage().download(p.take[TakesTable.storageKey]) }
            if (bytes.size !in 1..MAX_BYTES) limit("size", MAX_BYTES)
            storageIo { requireStorage().upload(p.key, bytes, p.take[TakesTable.mime]) }
            val (result, trashIds) = DatabaseFactory.dbQuery(requireDb()) {
                validate()
                requireRecordingConsent(userId)
                TakesTable.selectAll().where { (TakesTable.id eq p.take[TakesTable.id]) and (TakesTable.userId eq userId) and (TakesTable.sessionId eq sessionId) }
                    .singleOrNull() ?: conflict("ATTACHMENT_SOURCE_GONE")
                A.selectAll().where { (A.id eq p.id) and (A.status eq "copying") }.forUpdate(ForUpdateOption.ForUpdate)
                    .singleOrNull() ?: conflict("ATTACHMENT_COPY_EXPIRED")
                val ids = removeShareAttachments { (A.sessionId eq sessionId) and (A.status eq "ready") and (A.id neq p.id) }
                A.update({ A.id eq p.id }) { it[status] = "ready"; it[readyAt] = now(); it[sizeBytes] = bytes.size.toLong() }
                StorageTrashTable.deleteWhere { storageKey eq p.key }
                publish() to ids
            }
            trash.purge(trashIds)
            return result
        } catch (t: Throwable) {
            withContext(NonCancellable) {
                try {
                    val ids = DatabaseFactory.dbQuery(requireDb()) {
                        val att = A.selectAll().where { A.id eq attId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull()
                        val key = committedPlan?.key ?: att?.get(A.storageKey)
                        // 이미 공개(ready)되었거나 tx1이 커밋되지 않았으면 보상 삭제하지 않는다.
                        if (att?.get(A.status) == "ready" || key == null) emptyList()
                        else {
                            A.deleteWhere { A.id eq attId }
                            // 회수 purge가 먼저 끝나도 늦은 upload를 다시 대기열에 넣는다.
                            releaseGuard(key)
                        }
                    }
                    trash.purge(ids)
                } catch (cleanup: CancellationException) {
                    throw cleanup
                } catch (cleanup: Exception) {
                    log.error("공유 첨부 보상 정리 실패", cleanup)
                    t.addSuppressed(cleanup)
                }
            }
            throw t
        }
    }
    internal suspend fun purge(ids: List<Long>) = trash.purge(ids)
    private suspend fun <T> storageIo(block: suspend () -> T): T = try { block() }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { throw ApiException(HttpStatusCode.BadGateway, "STORAGE_ERROR", "저장소 요청에 실패했습니다.") }

    internal suspend fun signedUrl(key: String): AttachmentUrlResponse {
        val client = requireStorage()
        return AttachmentUrlResponse(storageIo { client.createSignedUrl(key, 300) }, 300)
    }
}
