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
    /** S3b-3 D12: 카드 공유(녹음 유무 무관) 계정 단위 동의. */
    internal fun Transaction.requireCardConsent(userId: UUID) {
        if (!consentDto(userId).cardShareAllowed) conflict("SHARE_CONSENT_REQUIRED", buildJsonObject { put("scope", "card"); put("requiredVersion", ShareNotice.REQUIRED_VERSION) })
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
        if (input.uploadId != null) return confirmDrive(userId, sessionId, input, validate, publish)
        val attId = UUID.randomUUID()
        var committedPlan: CopyPlan? = null
        var preparedKey: String? = null
        try {
            val (kept, plan) = DatabaseFactory.dbQuery(requireDb()) {
                validate()
                requireRecordingConsent(userId)
                val takeId = requireNotNull(input.takeId)
                val take = TakesTable.selectAll().where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) and (TakesTable.sessionId eq sessionId) }
                    .singleOrNull() ?: throw NotFoundException()
                if (ready(sessionId)?.get(A.sourceTakeId) == takeId) return@dbQuery publish() to null
                if (take[TakesTable.storage] == "drive") conflict("ATTACHMENT_UPLOAD_REQUIRED")
                if (take[TakesTable.durationSec] > 300) limit("duration", 300)
                if (take[TakesTable.sizeBytes] > MAX_BYTES) limit("size", MAX_BYTES)
                requireStorage()
                checkLimits(userId, sessionId)
                val pending = A.selectAll().where { (A.userId eq userId) and (A.status inList listOf("copying", "uploaded")) }
                    .forUpdate(ForUpdateOption.ForUpdate).toList()
                // 실패로 회수까지 롤백되지 않게, 유효한 진행 행은 회수 전에 검사한다.
                if (pending.any { !it[A.createdAt].isBefore(now().minusMinutes(30)) }) conflict("ATTACHMENT_COPY_IN_PROGRESS")
                val expired = pending.map { it[A.id] }
                val reclaimIds = removeShareAttachments { A.id inList expired }
                val ext = TakeService.MIME_EXT[take[TakesTable.mime]] ?: throw InvalidInputException("mime 형식이 올바르지 않습니다.")
                val key = "shared/$attId.$ext"
                // tx1 커밋 뒤 결과 전달이 취소되고 첨부가 CASCADE 삭제되어도 키는 보존한다.
                preparedKey = key
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
                checkLimits(userId, sessionId)
                val ids = removeShareAttachments { (A.sessionId eq sessionId) and (A.status eq "ready") and (A.id neq p.id) }
                A.update({ A.id eq p.id }) { it[status] = "ready"; it[readyAt] = now(); it[sizeBytes] = bytes.size.toLong() }
                StorageTrashTable.deleteWhere { storageKey eq p.key }
                SharedAttachmentCopyLogTable.insert { it[SharedAttachmentCopyLogTable.userId] = userId }
                publish() to ids
            }
            trash.purge(trashIds)
            return result
        } catch (t: Throwable) {
            withContext(NonCancellable) {
                try {
                    val ids = DatabaseFactory.dbQuery(requireDb()) {
                        val att = A.selectAll().where { A.id eq attId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull()
                        val key = committedPlan?.key ?: att?.get(A.storageKey) ?: preparedKey?.takeIf { candidate ->
                            // 결과를 받지 못했을 때는 실제 guard가 있어야 커밋된 준비로 판단한다.
                            // tx1 롤백이면 파일/정리 행을 새로 만들지 않는다.
                            StorageTrashTable.select(StorageTrashTable.id).where { StorageTrashTable.storageKey eq candidate }.limit(1).any()
                        }
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
    private fun Transaction.checkLimits(userId: UUID, sessionId: UUID) {
        if (A.selectAll().where { (A.userId eq userId) and (A.status eq "ready") and (A.sessionId neq sessionId) }.count() >= 20) limit("count", 20)
        val history = SharedAttachmentCopyLogTable
        if (history.selectAll().where { (history.userId eq userId) and (history.createdAt greaterEq now().minusHours(24)) }.count() >= 20) limit("daily", 20)
    }

    private suspend fun <T : Any> confirmDrive(userId: UUID, sessionId: UUID, input: ShareAttachmentInput,
        validate: Transaction.() -> Unit, publish: Transaction.() -> T): T {
        val (result, ids) = DatabaseFactory.dbQuery(requireDb()) {
            validate()
            requireRecordingConsent(userId)
            val takeId = requireNotNull(input.takeId)
            val take = TakesTable.selectAll().where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) and (TakesTable.sessionId eq sessionId) }
                .singleOrNull() ?: throw NotFoundException()
            if (take[TakesTable.storage] != "drive") conflict("ATTACHMENT_UPLOAD_INVALID")
            val upload = A.selectAll().where {
                (A.id eq requireNotNull(input.uploadId)) and (A.userId eq userId) and (A.sessionId eq sessionId) and
                    (A.sourceTakeId eq takeId) and (A.status eq "uploaded")
            }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull()
            if (ready(sessionId)?.get(A.sourceTakeId) == takeId) {
                // Keep the ready copy without logging another confirmation, but reclaim this request's unused upload.
                val ids = if (upload == null) emptyList() else removeShareAttachments { A.id eq upload[A.id] }
                return@dbQuery publish() to ids
            }
            if (upload == null || upload[A.userId] != userId || upload[A.sessionId] != sessionId || upload[A.sourceTakeId] != takeId ||
                upload[A.status] != "uploaded" || !upload[A.createdAt].isAfter(now().minusMinutes(30))) conflict("ATTACHMENT_UPLOAD_INVALID")
            checkLimits(userId, sessionId)
            val ids = removeShareAttachments { (A.sessionId eq sessionId) and (A.status eq "ready") }
            A.update({ A.id eq upload[A.id] }) { it[status] = "ready"; it[readyAt] = now() }
            StorageTrashTable.deleteWhere { storageKey eq upload[A.storageKey] }
            SharedAttachmentCopyLogTable.insert { it[SharedAttachmentCopyLogTable.userId] = userId }
            publish() to ids
        }
        trash.purge(ids)
        return result
    }

    /** 파일 reader는 tx1 커밋 뒤에만 실행한다. 원본 소유권과 저장 위치를 바이트보다 먼저 검사한다. */
    internal suspend fun uploadDrive(userId: UUID, sessionId: UUID, takeId: UUID, read: suspend () -> ByteArray): JsonObject {
        val id = UUID.randomUUID()
        var preparedKey: String? = null
        var committed: CopyPlan? = null
        try {
            val plan = DatabaseFactory.dbQuery(requireDb()) {
                validateUpload(userId, sessionId)
                requireRecordingConsent(userId)
                val take = TakesTable.selectAll().where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) and (TakesTable.sessionId eq sessionId) }
                    .singleOrNull() ?: throw NotFoundException()
                if (take[TakesTable.storage] != "drive") conflict("ATTACHMENT_UPLOAD_INVALID")
                if (take[TakesTable.durationSec] > 300) limit("duration", 300)
                if (take[TakesTable.sizeBytes] > MAX_BYTES) limit("size", MAX_BYTES)
                requireStorage()
                checkLimits(userId, sessionId)
                val pending = A.selectAll().where { (A.userId eq userId) and (A.status inList listOf("copying", "uploaded")) }
                    .forUpdate(ForUpdateOption.ForUpdate).toList()
                if (pending.any { !it[A.createdAt].isBefore(now().minusMinutes(30)) }) conflict("ATTACHMENT_COPY_IN_PROGRESS")
                val expired = pending.map { it[A.id] }
                val ids = removeShareAttachments { A.id inList expired }
                val ext = TakeService.MIME_EXT[take[TakesTable.mime]] ?: throw InvalidInputException("mime 형식이 올바르지 않습니다.")
                val key = "shared/$id.$ext"
                preparedKey = key
                A.insert {
                    it[A.id] = id; it[A.userId] = userId; it[A.sessionId] = sessionId; it[sourceTakeId] = takeId
                    it[kind] = "audio_copy"; it[storageKey] = key; it[mime] = take[TakesTable.mime]
                    it[sizeBytes] = take[TakesTable.sizeBytes]; it[durationSec] = take[TakesTable.durationSec]
                    it[status] = "copying"; it[originalConfirmedAt] = now()
                }
                StorageTrashTable.insert { it[storageKey] = key; it[nextAttemptAt] = GUARD_HOLD }
                CopyPlan(id, key, take, ids)
            }
            committed = plan
            trash.purge(plan.reclaimIds)
            val bytes = read()
            if (bytes.size > MAX_BYTES) limit("size", MAX_BYTES)
            if (bytes.isEmpty() || bytes.size.toLong() != plan.take[TakesTable.sizeBytes] || !AudioSignature.matches(plan.take[TakesTable.mime], bytes)) conflict("ATTACHMENT_UPLOAD_INVALID")
            storageIo { requireStorage().upload(plan.key, bytes, plan.take[TakesTable.mime]) }
            return DatabaseFactory.dbQuery(requireDb()) {
                validateUpload(userId, sessionId)
                requireRecordingConsent(userId)
                TakesTable.selectAll().where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) and (TakesTable.sessionId eq sessionId) }
                    .singleOrNull() ?: conflict("ATTACHMENT_SOURCE_GONE")
                val row = A.selectAll().where { (A.id eq id) and (A.status eq "copying") }.forUpdate(ForUpdateOption.ForUpdate)
                    .singleOrNull() ?: conflict("ATTACHMENT_COPY_EXPIRED")
                A.update({ A.id eq id }) { it[status] = "uploaded" }
                buildJsonObject { put("uploadId", id.toString()); put("expiresAt", episodeTs(row[A.createdAt].plusMinutes(30))) }
            }
        } catch (t: Throwable) {
            withContext(NonCancellable) {
                try {
                    val ids = DatabaseFactory.dbQuery(requireDb()) {
                        val row = A.selectAll().where { A.id eq id }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull()
                        val key = committed?.key ?: row?.get(A.storageKey) ?: preparedKey?.takeIf { candidate ->
                            StorageTrashTable.selectAll().where { StorageTrashTable.storageKey eq candidate }.any()
                        }
                        if (key == null || row?.get(A.status) == "ready") emptyList()
                        else { A.deleteWhere { A.id eq id }; releaseGuard(key) }
                    }
                    trash.purge(ids)
                } catch (cleanup: CancellationException) { throw cleanup }
                  catch (cleanup: Exception) { log.error("Drive 첨부 보상 정리 실패", cleanup); t.addSuppressed(cleanup) }
            }
            throw t
        }
    }

    private fun Transaction.validateUpload(userId: UUID, sessionId: UUID) {
        val ctx = tierContext(userId, lock = true)
        val songId = SessionsTable.selectAll().where { (SessionsTable.id eq sessionId) and (SessionsTable.userId eq userId) }
            .singleOrNull()?.get(SessionsTable.songId) ?: throw NotFoundException()
        SongsTable.selectAll().where { (SongsTable.id eq songId) and (SongsTable.userId eq userId) }.forUpdate(ForUpdateOption.ForUpdate)
            .singleOrNull() ?: throw NotFoundException()
        SessionsTable.selectAll().where { (SessionsTable.id eq sessionId) and (SessionsTable.userId eq userId) }.forUpdate(ForUpdateOption.ForUpdate)
            .singleOrNull() ?: throw NotFoundException()
        val c = SharedPracticeCardsTable
        if (c.selectAll().where { c.sessionId eq sessionId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull()?.get(c.status) == "moderation_hidden") conflict("POST_MODERATION_HIDDEN")
        requireCommunityWrite(ctx)
        if (ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.single()[ProfilesTable.publicName].isNullOrBlank()) conflict("PUBLIC_NAME_REQUIRED")
    }

    internal suspend fun impact(userId: UUID, songId: UUID?, takeId: UUID?): JsonObject = DatabaseFactory.dbQuery(requireDb()) {
        val sessions = if (songId != null) {
            if (!SongsTable.selectAll().where { (SongsTable.id eq songId) and (SongsTable.userId eq userId) }.any()) emptyList()
            else SessionsTable.selectAll().where { (SessionsTable.songId eq songId) and (SessionsTable.userId eq userId) }.map { it[SessionsTable.id] }
        } else emptyList()
        val c = SharedPracticeCardsTable
        val cards = if (songId == null || sessions.isEmpty()) 0L else c.selectAll().where { (c.userId eq userId) and (c.sessionId inList sessions) and c.withdrawnAt.isNull() }.count()
        val attachments = if (songId != null) {
            if (sessions.isEmpty()) 0L else A.selectAll().where { (A.userId eq userId) and (A.sessionId inList sessions) }.count()
        } else A.selectAll().where { (A.userId eq userId) and (A.sourceTakeId eq requireNotNull(takeId)) }.count()
        buildJsonObject { put("cards", cards); put("attachments", attachments) }
    }

    internal suspend fun reclaim(now: OffsetDateTime) {
        DatabaseFactory.dbQuery(requireDb()) {
            val expired = A.selectAll().where { (A.status inList listOf("copying", "uploaded")) and (A.createdAt lessEq now.minusMinutes(30)) }
                .forUpdate(ForUpdateOption.PostgreSQL.ForUpdate(ForUpdateOption.PostgreSQL.MODE.SKIP_LOCKED)).toList()
            val ids = expired.filter { it[A.status] in listOf("copying", "uploaded") && !it[A.createdAt].isAfter(now.minusMinutes(30)) }.map { it[A.id] }
            removeShareAttachments { A.id inList ids }
            val c = SharedPracticeCardsTable
            val hidden = c.selectAll().where { (c.status eq "moderation_hidden") and (c.hiddenAt less now.minusDays(30)) }
                .orderBy(c.id).forUpdate(ForUpdateOption.PostgreSQL.ForUpdate(ForUpdateOption.PostgreSQL.MODE.SKIP_LOCKED)).map { it[c.sessionId] }
            removeShareAttachments { A.sessionId inList hidden }
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
