package ulevelp.service

import io.ktor.http.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.neq
import org.slf4j.LoggerFactory
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.DatabaseFactory
import ulevelp.db.OutboxRepository
import ulevelp.db.SessionsTable
import ulevelp.db.SongsTable
import ulevelp.db.NotionSyncTable
import ulevelp.db.StorageTrashTable
import ulevelp.db.TakesTable
import ulevelp.db.SongPresetsTable
import ulevelp.storage.StorageClient
import ulevelp.storage.StorageException
import java.math.BigDecimal
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

@Serializable
data class TakeDto(
    val id: String,
    val sessionId: String,
    val recordedAt: String,
    val a: Double?,
    val b: Double?,
    val rate: Double?,
    val durationSec: Int,
    val mime: String,
    val sizeBytes: Long,
    val storage: String,
    val storageKey: String,
    val memo: String,
    val partName: String = "",
    val completed: Boolean = false
)

@Serializable
data class TakeEnvelope(val ok: Boolean = true, val take: TakeDto)

@Serializable
data class SignedUrlResponse(val url: String, val expiresIn: Int)

data class TakeUploadInput(
    val songId: UUID,
    val date: LocalDate,
    val recordedAt: OffsetDateTime,
    val a: BigDecimal?,
    val b: BigDecimal?,
    val rate: BigDecimal?,
    val durationSec: Int,
    val mime: String,
    val bytes: ByteArray,
    val replaceOldSongTakes: Boolean = false,
    val partName: String = "",
    val completed: Boolean = false
)

data class DriveTakeRegisterInput(
    val songId: UUID,
    val date: LocalDate,
    val recordedAt: OffsetDateTime,
    val a: BigDecimal?,
    val b: BigDecimal?,
    val rate: BigDecimal?,
    val durationSec: Int,
    val mime: String,
    val sizeBytes: Long,
    val driveFileId: String,
    val partName: String = "",
    val completed: Boolean = false
)

data class TakeDownloadData(
    val bytes: ByteArray,
    val mime: String,
    val filename: String
)

class TakeService(
    private val db: Database?,
    private val storageClient: StorageClient?,
    private val storageTrashService: StorageTrashService? = null
) {
    private val log = LoggerFactory.getLogger(TakeService::class.java)

    val isStorageConfigured: Boolean get() = storageClient != null

    private fun requireDb(): Database =
        db ?: throw ApiException(
            status = HttpStatusCode.ServiceUnavailable,
            code = "DB_UNAVAILABLE",
            message = "데이터베이스가 연결되어 있지 않습니다."
        )

    private data class SessionEnsureResult(val sessionId: UUID, val created: Boolean)

    private fun Transaction.ensureSession(
        userId: UUID,
        songId: UUID,
        date: LocalDate,
        rate: BigDecimal?,
        a: BigDecimal?,
        b: BigDecimal?
    ): SessionEnsureResult {
        val existingSession = SessionsTable
            .select(SessionsTable.id)
            .where {
                (SessionsTable.userId eq userId) and
                (SessionsTable.songId eq songId) and
                (SessionsTable.date eq date)
            }
            .singleOrNull()

        if (existingSession != null) {
            return SessionEnsureResult(existingSession[SessionsTable.id], created = false)
        }

        val newId = UUID.randomUUID()
        val insCount = SessionsTable.insertIgnore {
            it[id] = newId
            it[SessionsTable.userId] = userId
            it[SessionsTable.songId] = songId
            it[SessionsTable.date] = date
            it[seconds] = 0
            it[loops] = 0
            if (rate != null) {
                it[SessionsTable.rate] = rate
            }
            it[SessionsTable.a] = a
            it[SessionsTable.b] = b
        }.insertedCount

        return if (insCount == 1) {
            SessionEnsureResult(newId, created = true)
        } else {
            val foundId = SessionsTable
                .select(SessionsTable.id)
                .where {
                    (SessionsTable.userId eq userId) and
                    (SessionsTable.songId eq songId) and
                    (SessionsTable.date eq date)
                }
                .single()[SessionsTable.id]
            SessionEnsureResult(foundId, created = false)
        }
    }

    private suspend fun cleanupUploadedFile(
        client: StorageClient,
        database: Database,
        key: String
    ) {
        withContext(NonCancellable) {
            val committed = runCatching {
                DatabaseFactory.dbQuery(database) {
                    TakesTable.select(TakesTable.id).where { TakesTable.storageKey eq key }.limit(1).any()
                }
            }.getOrDefault(false)
            if (committed) {
                log.info("트랜잭션이 이미 커밋되었으므로 스토리지 파일($key)을 보존합니다.")
                return@withContext
            }

            try {
                client.delete(key)
            } catch (delEx: Throwable) {
                log.warn("트랜잭션 실패 후 스토리지 파일($key) 삭제 실패, storage_trash에 등록합니다.", delEx)
                try {
                    DatabaseFactory.dbQuery(database) {
                        StorageTrashTable.insert {
                            it[storageKey] = key
                        }
                    }
                } catch (trashEx: Throwable) {
                    log.warn("storage_trash 등록 실패: key=$key", trashEx)
                }
            }
        }
    }

    /**
     * 서버 녹음 티어 규칙 (M1-1 §1-2·A1). `replaceOldSongTakes`면 다른 곡의 서버 녹음을 지운 뒤 상태로 계산한다
     * (옛 화면의 "이전 곡 녹음 교체" 흐름 유지).
     */
    private fun Transaction.checkUploadLimits(ctx: TierContext, userId: UUID, input: TakeUploadInput) {
        requireTakeDuration(ctx, input.durationSec)

        val songIds = serverTakeSongIds(userId)
        val totalUsed = serverTakeBytes(userId)
        val (songsAfterReplace, usedAfterReplace) = if (input.replaceOldSongTakes) {
            val sumExpr = TakesTable.sizeBytes.sum()
            val otherBytes = TakesTable.select(sumExpr)
                .where {
                    (TakesTable.userId eq userId) and
                    (TakesTable.storage eq "supabase") and
                    (TakesTable.songId neq input.songId)
                }
                .singleOrNull()?.get(sumExpr) ?: 0L
            songIds.filter { it == input.songId }.toSet() to (totalUsed - otherBytes)
        } else {
            songIds to totalUsed
        }

        requireTakeSongs(ctx, songsAfterReplace, input.songId)
        if (usedAfterReplace + input.bytes.size > ctx.limits.takeBytes) {
            throw takeQuotaExceeded(ctx, usedAfterReplace)
        }
    }

    suspend fun upload(userId: UUID, input: TakeUploadInput): TakeDto {
        val client = storageClient
            ?: throw ApiException(
                HttpStatusCode.ServiceUnavailable,
                "STORAGE_UNAVAILABLE",
                "녹음 저장소가 설정되어 있지 않습니다."
            )
        val database = requireDb()

        // 1. 트랜잭션 A (읽기만): 곡 존재 확인, 티어 녹음 규칙(무료 2곡·2분·총량 — M1-1 A1) 사전 검사
        DatabaseFactory.dbQuery(database) {
            val songExists = SongsTable
                .select(SongsTable.id)
                .where { (SongsTable.id eq input.songId) and (SongsTable.userId eq userId) }
                .singleOrNull() != null
            if (!songExists) {
                throw NotFoundException("곡을 찾을 수 없습니다.")
            }
            checkUploadLimits(tierContext(userId), userId, input)
        }

        // 2. 트랜잭션 밖: 스토리지 업로드
        val takeId = UUID.randomUUID()
        val ext = MIME_EXT[input.mime] ?: throw InvalidInputException("mime 값이 올바르지 않습니다.")
        val key = "$userId/$takeId.$ext"

        try {
            client.upload(key, input.bytes, input.mime)
        } catch (e: CancellationException) {
            throw e
        } catch (e: StorageException) {
            throw ApiException(
                HttpStatusCode.BadGateway,
                "STORAGE_ERROR",
                "녹음 파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )
        }

        // 3. 트랜잭션 B: DB 기록 및 이전 곡 녹음 원자적 교체
        val (takeDto, trashIdsToPurge) = try {
            DatabaseFactory.dbQuery(database) {
                // 1) 곡 소유 재확인
                val songRow = SongsTable
                    .select(SongsTable.id, SongsTable.lastDate)
                    .where { (SongsTable.id eq input.songId) and (SongsTable.userId eq userId) }
                    .singleOrNull() ?: throw NotFoundException("곡을 찾을 수 없습니다.")

                // 2) profiles FOR UPDATE 잠금 선획득 (동시 업로드 정합성 보장) 후 티어 규칙 재검사
                val ctx = tierContext(userId, lock = true)
                checkUploadLimits(ctx, userId, input)

                val otherSongTakes = if (input.replaceOldSongTakes) {
                    TakesTable
                        .select(TakesTable.id, TakesTable.storageKey)
                        .where {
                            (TakesTable.userId eq userId) and
                            (TakesTable.storage eq "supabase") and
                            (TakesTable.songId neq input.songId)
                        }
                        .toList()
                } else {
                    emptyList()
                }

                // 6) 타 곡 supabase 녹음 교체: 조회한 id 목록(oldIds)으로 원자적 삭제 및 trash 적재
                val trashIds = mutableListOf<Long>()
                if (input.replaceOldSongTakes && otherSongTakes.isNotEmpty()) {
                    val oldIds = otherSongTakes.map { it[TakesTable.id] }
                    for (oldTake in otherSongTakes) {
                        val oldTakeId = oldTake[TakesTable.id]
                        val oldStorageKey = oldTake[TakesTable.storageKey]
                        val trashId = StorageTrashTable.insert {
                            it[storageKey] = oldStorageKey
                        } get StorageTrashTable.id
                        trashIds.add(trashId)
                        OutboxRepository.enqueueIfSyncEnabled(userId, "take", oldTakeId, "delete")
                    }
                    TakesTable.deleteWhere {
                        (TakesTable.userId eq userId) and
                        (TakesTable.storage eq "supabase") and
                        (TakesTable.id inList oldIds)
                    }
                }

                // 7) SongsTable.lastDate 및 updatedAt 갱신
                val currentLastDate = songRow[SongsTable.lastDate]
                if (currentLastDate == null || currentLastDate < input.date) {
                    SongsTable.update({ (SongsTable.id eq input.songId) and (SongsTable.userId eq userId) }) {
                        it[lastDate] = input.date
                        it[updatedAt] = OffsetDateTime.now(ZoneOffset.UTC)
                    }
                    SharedFolderSync.resyncCategories(this, userId, null) // 자동 연동(M1-4a): 순서(마지막 연습일)
                }

                // 8) ensureSession
                val sessionResult = ensureSession(userId, input.songId, input.date, input.rate, input.a, input.b)
                val sessionId = sessionResult.sessionId

                // 9) TakesTable.insert
                TakesTable.insert {
                    it[id] = takeId
                    it[TakesTable.userId] = userId
                    it[TakesTable.sessionId] = sessionId
                    it[TakesTable.songId] = input.songId
                    it[recordedAt] = input.recordedAt
                    it[a] = input.a
                    it[b] = input.b
                    if (input.rate != null) {
                        it[rate] = input.rate
                    }
                    it[durationSec] = input.durationSec
                    it[mime] = input.mime
                    it[sizeBytes] = input.bytes.size.toLong()
                    it[storage] = "supabase"
                    it[storageKey] = key
                    it[memo] = ""
                    it[partName] = input.partName
                    it[completed] = input.completed
                }

                // 10) Outbox 적재
                if (sessionResult.created) {
                    OutboxRepository.enqueueIfSyncEnabled(userId, "session", sessionId, "upsert")
                }
                OutboxRepository.enqueueIfSyncEnabled(userId, "take", takeId, "upsert")

                // 11) TakeDto 생성
                val dto = TakeDto(
                    id = takeId.toString(),
                    sessionId = sessionId.toString(),
                    recordedAt = DateTimeFormatter.ISO_INSTANT.format(input.recordedAt.toInstant()),
                    a = input.a?.toDouble(),
                    b = input.b?.toDouble(),
                    rate = input.rate?.toDouble(),
                    durationSec = input.durationSec,
                    mime = input.mime,
                    sizeBytes = input.bytes.size.toLong(),
                    storage = "supabase",
                    storageKey = key,
                    memo = "",
                    partName = input.partName,
                    completed = input.completed
                )
                Pair(dto, trashIds)
            }
        } catch (originalEx: Throwable) {
            // 4. 트랜잭션 B 실패/취소 시 보상 트랜잭션: NonCancellable 안에서 스토리지 파일 삭제/trash 등록
            cleanupUploadedFile(client, database, key)
            throw originalEx
        }

        // 4. 트랜잭션 B 커밋 직후 (트랜잭션 밖): storageTrashService.purge
        if (trashIdsToPurge.isNotEmpty()) {
            (storageTrashService ?: StorageTrashService(database, client)).purge(trashIdsToPurge)
        }

        return takeDto
    }

    suspend fun signedUrl(userId: UUID, takeId: UUID): SignedUrlResponse {
        val client = storageClient
            ?: throw ApiException(
                HttpStatusCode.ServiceUnavailable,
                "STORAGE_UNAVAILABLE",
                "녹음 저장소가 설정되어 있지 않습니다."
            )
        val database = requireDb()

        val row = DatabaseFactory.dbQuery(database) {
            TakesTable
                .select(TakesTable.storage, TakesTable.storageKey)
                .where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) }
                .singleOrNull() ?: throw NotFoundException("녹음을 찾을 수 없습니다.")
        }

        val storage = row[TakesTable.storage]
        val storageKey = row[TakesTable.storageKey]
        if (storage == "drive") {
            throw InvalidInputException("Google Drive에 저장된 녹음은 브라우저에서 직접 재생합니다.")
        }

        val signedUrl = try {
            client.createSignedUrl(storageKey, SIGNED_URL_TTL_SEC)
        } catch (e: CancellationException) {
            throw e
        } catch (e: StorageException) {
            throw ApiException(
                HttpStatusCode.BadGateway,
                "STORAGE_ERROR",
                "재생 주소를 만들지 못했습니다."
            )
        }

        return SignedUrlResponse(url = signedUrl, expiresIn = SIGNED_URL_TTL_SEC)
    }

    suspend fun delete(userId: UUID, takeId: UUID): List<Long> {
        val database = requireDb()

        return DatabaseFactory.dbQuery(database) {
            val row = TakesTable
                .select(TakesTable.storage, TakesTable.storageKey)
                .where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) }
                .singleOrNull() ?: throw NotFoundException("녹음을 찾을 수 없습니다.")

            val storage = row[TakesTable.storage]
            val storageKey = row[TakesTable.storageKey]

            val trashIds = mutableListOf<Long>()
            if (storage == "supabase") {
                val trashId = StorageTrashTable.insert {
                    it[StorageTrashTable.storageKey] = storageKey
                } get StorageTrashTable.id
                trashIds.add(trashId)
            }

            OutboxRepository.enqueueIfSyncEnabled(userId, "take", takeId, "delete")
            TakesTable.deleteWhere { (id eq takeId) and (TakesTable.userId eq userId) }

            trashIds
        }
    }

    suspend fun registerDriveTake(userId: UUID, input: DriveTakeRegisterInput): TakeDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            requireDrive(tierContext(userId))
            val songExists = SongsTable
                .select(SongsTable.id)
                .where { (SongsTable.id eq input.songId) and (SongsTable.userId eq userId) }
                .singleOrNull() != null
            if (!songExists) {
                throw NotFoundException("곡을 찾을 수 없습니다.")
            }

            val notionSyncEnabled = NotionSyncTable
                .select(NotionSyncTable.enabled)
                .where { (NotionSyncTable.userId eq userId) and (NotionSyncTable.enabled eq true) }
                .singleOrNull() != null
            if (notionSyncEnabled) {
                throw ApiException(
                    HttpStatusCode.Conflict,
                    "NOTION_SYNC_CONFLICT",
                    "노션 실시간 연동이 켜져 있는 동안에는 Google Drive 저장소를 사용할 수 없습니다."
                )
            }

            val sessionResult = ensureSession(userId, input.songId, input.date, input.rate, input.a, input.b)
            val sessionId = sessionResult.sessionId
            val takeId = UUID.randomUUID()

            TakesTable.insert {
                it[id] = takeId
                it[TakesTable.userId] = userId
                it[TakesTable.sessionId] = sessionId
                it[TakesTable.songId] = input.songId
                it[recordedAt] = input.recordedAt
                it[a] = input.a
                it[b] = input.b
                if (input.rate != null) {
                    it[rate] = input.rate
                }
                it[durationSec] = input.durationSec
                it[mime] = input.mime
                it[sizeBytes] = input.sizeBytes
                it[storage] = "drive"
                it[storageKey] = input.driveFileId
                it[memo] = ""
                it[partName] = input.partName
                it[completed] = input.completed
            }

            if (sessionResult.created) {
                OutboxRepository.enqueueIfSyncEnabled(userId, "session", sessionId, "upsert")
            }

            TakeDto(
                id = takeId.toString(),
                sessionId = sessionId.toString(),
                recordedAt = DateTimeFormatter.ISO_INSTANT.format(input.recordedAt.toInstant()),
                a = input.a?.toDouble(),
                b = input.b?.toDouble(),
                rate = input.rate?.toDouble(),
                durationSec = input.durationSec,
                mime = input.mime,
                sizeBytes = input.sizeBytes,
                storage = "drive",
                storageKey = input.driveFileId,
                memo = "",
                partName = input.partName,
                completed = input.completed
            )
        }
    }

    suspend fun downloadBytes(userId: UUID, takeId: UUID): TakeDownloadData {
        val client = storageClient
            ?: throw ApiException(
                HttpStatusCode.ServiceUnavailable,
                "STORAGE_UNAVAILABLE",
                "녹음 저장소가 설정되어 있지 않습니다."
            )
        val database = requireDb()

        val row = DatabaseFactory.dbQuery(database) {
            TakesTable
                .select(TakesTable.storage, TakesTable.storageKey, TakesTable.mime)
                .where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) }
                .singleOrNull() ?: throw NotFoundException("녹음을 찾을 수 없습니다.")
        }

        val storage = row[TakesTable.storage]
        val storageKey = row[TakesTable.storageKey]
        val mime = row[TakesTable.mime]

        if (storage == "drive") {
            throw InvalidInputException("이미 Google Drive에 저장된 녹음입니다.")
        }

        val bytes = try {
            client.download(storageKey)
        } catch (e: CancellationException) {
            throw e
        } catch (e: StorageException) {
            throw ApiException(
                HttpStatusCode.BadGateway,
                "STORAGE_ERROR",
                "녹음 파일을 다운로드하지 못했습니다."
            )
        }

        val ext = MIME_EXT[mime] ?: "bin"
        val filename = "take-$takeId.$ext"
        return TakeDownloadData(bytes = bytes, mime = mime, filename = filename)
    }

    suspend fun migrateToDrive(userId: UUID, takeId: UUID, driveFileId: String): Pair<TakeDto, List<Long>> {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            requireDrive(tierContext(userId))
            val row = TakesTable
                .selectAll()
                .where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) }
                .singleOrNull() ?: throw NotFoundException("녹음을 찾을 수 없습니다.")

            val notionSyncEnabled = NotionSyncTable
                .select(NotionSyncTable.enabled)
                .where { (NotionSyncTable.userId eq userId) and (NotionSyncTable.enabled eq true) }
                .singleOrNull() != null
            if (notionSyncEnabled) {
                throw ApiException(
                    HttpStatusCode.Conflict,
                    "NOTION_SYNC_CONFLICT",
                    "노션 실시간 연동이 켜져 있는 동안에는 Google Drive 저장소를 사용할 수 없습니다."
                )
            }

            val oldStorage = row[TakesTable.storage]
            val oldKey = row[TakesTable.storageKey]
            val trashIds = mutableListOf<Long>()

            if (oldStorage == "supabase") {
                val trashId = StorageTrashTable.insert {
                    it[StorageTrashTable.storageKey] = oldKey
                } get StorageTrashTable.id
                trashIds.add(trashId)
            }

            TakesTable.update({ (TakesTable.id eq takeId) and (TakesTable.userId eq userId) }) {
                it[storage] = "drive"
                it[storageKey] = driveFileId
            }

            val takeDto = TakeDto(
                id = row[TakesTable.id].toString(),
                sessionId = row[TakesTable.sessionId].toString(),
                recordedAt = DateTimeFormatter.ISO_INSTANT.format(row[TakesTable.recordedAt].toInstant()),
                a = row[TakesTable.a]?.toDouble(),
                b = row[TakesTable.b]?.toDouble(),
                rate = row[TakesTable.rate]?.toDouble(),
                durationSec = row[TakesTable.durationSec],
                mime = row[TakesTable.mime],
                sizeBytes = row[TakesTable.sizeBytes],
                storage = "drive",
                storageKey = driveFileId,
                memo = row[TakesTable.memo],
                partName = row[TakesTable.partName],
                completed = row[TakesTable.completed]
            )

            Pair(takeDto, trashIds)
        }
    }

    suspend fun toggleComplete(userId: UUID, takeId: UUID, completed: Boolean): TakeDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val takeRow = TakesTable.selectAll()
                .where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) }
                .singleOrNull() ?: throw NotFoundException("녹음 테이크를 찾을 수 없습니다.")

            TakesTable.update({ (TakesTable.id eq takeId) and (TakesTable.userId eq userId) }) {
                it[TakesTable.completed] = completed
            }

            val partName = takeRow[TakesTable.partName]
            val songId = takeRow[TakesTable.songId]
            if (partName.isNotBlank()) {
                // 연관된 프리셋 상태 동기화 (V9)
                SongPresetsTable.update({ (SongPresetsTable.songId eq songId) and (SongPresetsTable.name eq partName) }) {
                    it[SongPresetsTable.completed] = completed
                }
            }

            val updatedRow = TakesTable.selectAll()
                .where { (TakesTable.id eq takeId) and (TakesTable.userId eq userId) }
                .single()

            SessionService.rowToTakeDto(updatedRow)
        }
    }

    companion object {
        val DRIVE_FILE_ID_REGEX = Regex("^[A-Za-z0-9_-]{5,200}$")
        const val MAX_METADATA_BYTES = 65_536L             // 64KB
        const val MAX_FILE_BYTES = 52_428_800L            // 50MB
        const val MAX_REQUEST_BYTES = 53_477_376L         // 51MB (Content-Length 사전 거부·formFieldLimit)
        const val SIGNED_URL_TTL_SEC = 3600
        val MIME_EXT: Map<String, String> = mapOf(
            "audio/mp4" to "m4a",
            "audio/webm" to "weba",
            "audio/ogg" to "ogg",
            "audio/mpeg" to "mp3",
            "audio/wav" to "wav",
            "audio/aac" to "aac"
        )
    }
}
