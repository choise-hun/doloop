package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.slf4j.LoggerFactory
import ulevelp.api.ApiException
import ulevelp.api.NotFoundException
import ulevelp.db.DatabaseFactory
import ulevelp.db.NoteDocsTable
import ulevelp.db.NoteFilesTable
import ulevelp.db.StorageTrashTable
import ulevelp.storage.StorageClient
import ulevelp.storage.StorageException
import java.util.UUID

/** Drive 참조 등록 입력(클라이언트가 Drive에 올린 뒤 파일 ID만 보낸다, 명세 §5.3) */
data class NoteDriveFileInput(
    val storageKey: String,
    val fileName: String,
    val type: NoteFileType,
    val sizeBytes: Long
)

@Serializable
data class NoteFileEnvelope(val file: NoteFileDto)

@Serializable
data class NoteFileUrlResponse(
    val storage: String,
    val url: String? = null,
    val expiresIn: Int? = null,
    val storageKey: String? = null,
    val fileName: String,
    val mime: String,
    val sizeBytes: Long
)

/**
 * NT-1 노트 첨부(명세 §5.3·§7). 업로드는 TB-1 `TabSongService.create`와 같은 3단계:
 * 트랜잭션 A 사전 검사 → 트랜잭션 밖 업로드 → 트랜잭션 B(프로필 잠금 재검사 + INSERT), 실패하면 보상 정리.
 * 새 경로라 outbox(폐기 기능) 호출은 넣지 않는다
 */
class NoteFileService(
    private val db: Database?,
    private val storageClient: StorageClient?
) {
    private val log = LoggerFactory.getLogger(NoteFileService::class.java)

    val isStorageConfigured: Boolean get() = storageClient != null

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    private fun requireStorage(): StorageClient =
        storageClient ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "STORAGE_UNAVAILABLE", "파일 저장소가 설정되어 있지 않습니다.")

    /** 노트가 내 것인지(없음·남의 것 404) */
    private fun Transaction.requireOwnDoc(userId: UUID, docId: UUID) {
        val mine = NoteDocsTable.select(NoteDocsTable.id)
            .where { (NoteDocsTable.id eq docId) and (NoteDocsTable.userId eq userId) }
            .limit(1).any()
        if (!mine) throw NotFoundException("노트를 찾을 수 없습니다.")
    }

    private fun Transaction.requireFileSlot(docId: UUID) {
        val count = NoteFilesTable.selectAll().where { NoteFilesTable.docId eq docId }.count()
        if (count + 1 > NoteFileValidator.MAX_FILES_PER_DOC) {
            throw ApiException(
                HttpStatusCode.Forbidden,
                "NOTE_FILE_COUNT_EXCEEDED",
                "노트 하나에는 파일을 ${NoteFileValidator.MAX_FILES_PER_DOC}개까지 붙일 수 있습니다."
            )
        }
    }

    private fun Transaction.nextSortOrder(docId: UUID): Int {
        val maxExpr = NoteFilesTable.sortOrder.max()
        return (NoteFilesTable.select(maxExpr).where { NoteFilesTable.docId eq docId }.singleOrNull()?.get(maxExpr) ?: -1) + 1
    }

    private fun Transaction.checkUpload(userId: UUID, docId: UUID, size: Long, lock: Boolean) {
        val ctx = tierContext(userId, lock = lock)
        requireOwnDoc(userId, docId)
        requireNoteFiles(ctx)
        requireFileSlot(docId)
        requireFileBytes(ctx, size)
    }

    suspend fun upload(userId: UUID, docId: UUID, fileName: String, type: NoteFileType, bytes: ByteArray): NoteFileDto {
        val client = requireStorage()
        val database = requireDb()
        val size = bytes.size.toLong()

        // 1. 트랜잭션 A(읽기): 빨리 실패하게 하는 사전 검사
        DatabaseFactory.dbQuery(database) { checkUpload(userId, docId, size, lock = false) }

        // 2. 트랜잭션 밖: 스토리지 업로드
        val fileId = UUID.randomUUID()
        val key = "notes/$userId/$docId/$fileId.${type.ext}"
        try {
            client.upload(key, bytes, CONTENT_TYPE)
        } catch (t: Throwable) {
            // 응답을 받기 전에 실패하거나 취소돼도 객체는 이미 저장됐을 수 있다
            cleanupUploadedFile(client, database, key)
            if (t is StorageException) {
                throw ApiException(HttpStatusCode.BadGateway, "STORAGE_ERROR", "파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
            }
            throw t
        }

        // 3. 트랜잭션 B: 프로필 잠금 뒤 재검사(동시 업로드·노트 삭제 대비) + INSERT
        try {
            return DatabaseFactory.dbQuery(database) {
                checkUpload(userId, docId, size, lock = true)
                NoteFilesTable.insert {
                    it[id] = fileId
                    it[NoteFilesTable.userId] = userId
                    it[NoteFilesTable.docId] = docId
                    it[storage] = STORAGE_SUPABASE
                    it[storageKey] = key
                    it[NoteFilesTable.fileName] = fileName
                    it[mime] = type.mime
                    it[sizeBytes] = size
                    it[sortOrder] = nextSortOrder(docId)
                }
                rowToNoteFileDto(NoteFilesTable.selectAll().where { NoteFilesTable.id eq fileId }.single())
            }
        } catch (t: Throwable) {
            cleanupUploadedFile(client, database, key)
            throw t
        }
    }

    /**
     * 4. 보상 정리(backend-kotlin §3, TB-1과 같은 3갈래). 커밋 여부 확인 자체가 실패하면
     * 커밋됐을 수도 있으므로 지우지도 휴지통에 넣지도 않는다
     */
    private suspend fun cleanupUploadedFile(client: StorageClient, database: Database, key: String) {
        withContext(NonCancellable) {
            val committed = try {
                DatabaseFactory.dbQuery(database) {
                    NoteFilesTable.select(NoteFilesTable.id)
                        .where { (NoteFilesTable.storage eq STORAGE_SUPABASE) and (NoteFilesTable.storageKey eq key) }
                        .limit(1).any()
                }
            } catch (e: Throwable) {
                log.warn("노트 첨부 보상 정리: 커밋 여부를 확인하지 못해 파일($key)을 보존합니다.", e)
                return@withContext
            }
            if (committed) {
                log.info("트랜잭션이 이미 커밋되었으므로 노트 첨부($key)를 보존합니다.")
                return@withContext
            }
            try {
                client.delete(key)
            } catch (delEx: Throwable) {
                log.warn("노트 첨부 업로드 실패 후 파일($key) 삭제 실패, storage_trash에 등록합니다.", delEx)
                try {
                    DatabaseFactory.dbQuery(database) {
                        StorageTrashTable.insert { it[storageKey] = key }
                    }
                } catch (trashEx: Throwable) {
                    log.warn("storage_trash 등록 실패: key=$key", trashEx)
                }
            }
        }
    }

    /** Drive 참조 등록(N7). 유료만, 서버 총량에 세지 않는다. 내용은 서버가 확인할 수 없다(녹음 Drive와 같음) */
    suspend fun registerDrive(userId: UUID, docId: UUID, input: NoteDriveFileInput): NoteFileDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val ctx = tierContext(userId, lock = true)
            requireOwnDoc(userId, docId)
            requireDrive(ctx)
            requireFileSlot(docId)
            val fileId = UUID.randomUUID()
            NoteFilesTable.insert {
                it[id] = fileId
                it[NoteFilesTable.userId] = userId
                it[NoteFilesTable.docId] = docId
                it[storage] = STORAGE_DRIVE
                it[storageKey] = input.storageKey
                it[fileName] = input.fileName
                it[mime] = input.type.mime
                it[sizeBytes] = input.sizeBytes
                it[sortOrder] = nextSortOrder(docId)
            }
            rowToNoteFileDto(NoteFilesTable.selectAll().where { NoteFilesTable.id eq fileId }.single())
        }
    }

    /** 본인 파일 주소. supabase는 서명 주소, drive는 파일 ID(클라이언트가 Drive 토큰으로 받는다) */
    suspend fun fileUrl(userId: UUID, fileId: UUID): NoteFileUrlResponse {
        val database = requireDb()
        val row = DatabaseFactory.dbQuery(database) {
            NoteFilesTable.selectAll()
                .where { (NoteFilesTable.id eq fileId) and (NoteFilesTable.userId eq userId) }
                .singleOrNull()
        } ?: throw NotFoundException("파일을 찾을 수 없습니다.")

        val storage = row[NoteFilesTable.storage]
        if (storage == STORAGE_DRIVE) {
            return NoteFileUrlResponse(
                storage = STORAGE_DRIVE,
                storageKey = row[NoteFilesTable.storageKey],
                fileName = row[NoteFilesTable.fileName],
                mime = row[NoteFilesTable.mime],
                sizeBytes = row[NoteFilesTable.sizeBytes]
            )
        }
        val client = requireStorage()
        val url = try {
            client.createSignedUrl(row[NoteFilesTable.storageKey], SIGNED_URL_TTL_SEC)
        } catch (e: CancellationException) {
            throw e
        } catch (e: StorageException) {
            throw ApiException(HttpStatusCode.BadGateway, "STORAGE_ERROR", "파일 주소를 만들지 못했습니다.")
        }
        return NoteFileUrlResponse(
            storage = STORAGE_SUPABASE,
            url = url,
            expiresIn = SIGNED_URL_TTL_SEC,
            fileName = row[NoteFilesTable.fileName],
            mime = row[NoteFilesTable.mime],
            sizeBytes = row[NoteFilesTable.sizeBytes]
        )
    }

    /** 프로필 잠금 → 소유 확인 → supabase면 휴지통 → 행 삭제(주석 CASCADE). 반환 = 커밋 뒤 purge할 id */
    suspend fun delete(userId: UUID, fileId: UUID): List<Long> {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            tierContext(userId, lock = true)
            val row = NoteFilesTable.select(NoteFilesTable.storage, NoteFilesTable.storageKey)
                .where { (NoteFilesTable.id eq fileId) and (NoteFilesTable.userId eq userId) }
                .forUpdate()
                .singleOrNull() ?: throw NotFoundException("파일을 찾을 수 없습니다.")
            val trashIds = if (row[NoteFilesTable.storage] == STORAGE_SUPABASE) {
                listOf(StorageTrashTable.insert { it[storageKey] = row[NoteFilesTable.storageKey] } get StorageTrashTable.id)
            } else {
                emptyList()
            }
            NoteFilesTable.deleteWhere { (NoteFilesTable.id eq fileId) and (NoteFilesTable.userId eq userId) }
            trashIds
        }
    }

    companion object {
        const val STORAGE_SUPABASE = "supabase"
        const val STORAGE_DRIVE = "drive"
        /** TB-1 T3와 같음: 클라이언트가 받자마자 기기 캐시에 넣는다 */
        const val SIGNED_URL_TTL_SEC = 300
        /** Supabase 출처에서 브라우저가 열지 않게 모두 octet-stream(TB-1과 같음) */
        const val CONTENT_TYPE = "application/octet-stream"
    }
}
