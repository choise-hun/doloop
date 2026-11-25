package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.slf4j.LoggerFactory
import ulevelp.api.ApiException
import ulevelp.api.NotFoundException
import ulevelp.db.DatabaseFactory
import ulevelp.db.SongsTable
import ulevelp.db.StorageTrashTable
import ulevelp.storage.StorageClient
import ulevelp.storage.StorageException
import java.util.UUID

/** `POST /songs/tab` 입력. [fileName]은 [TabFileValidator.sanitizeFileName], [format]은 [TabFileValidator.detect]를 거친 값 */
data class TabUploadInput(
    val fileName: String,
    val format: TabFormat,
    val bytes: ByteArray,
    val title: String,
    val artist: String
)

@Serializable
data class TabFileResponse(
    val url: String,
    val expiresIn: Int,
    val fileName: String,
    val format: String,
    val sizeBytes: Long
)

/**
 * TB-1 TAB 곡 업로드·파일 주소(명세 §5·§6). 녹음 업로드(`TakeService.upload`)와 같은 3단계:
 * 트랜잭션 A 사전 검사 → 트랜잭션 밖 스토리지 업로드 → 트랜잭션 B(프로필 잠금 재검사 + INSERT), 실패하면 보상 정리.
 * 새 경로라 outbox(폐기 기능) 호출은 넣지 않는다.
 */
class TabSongService(
    private val db: Database?,
    private val storageClient: StorageClient?,
    private val songService: SongService
) {
    private val log = LoggerFactory.getLogger(TabSongService::class.java)

    val isStorageConfigured: Boolean get() = storageClient != null

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    private fun requireStorage(): StorageClient =
        storageClient ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "STORAGE_UNAVAILABLE", "파일 저장소가 설정되어 있지 않습니다.")

    private fun org.jetbrains.exposed.sql.Transaction.checkLimits(ctx: TierContext, size: Long) {
        requireSongSlots(ctx, 1)
        requireTabSlots(ctx)
        requireTabBytes(ctx, size)
    }

    suspend fun create(userId: UUID, input: TabUploadInput): SongDto {
        val client = requireStorage()
        val database = requireDb()
        val size = input.bytes.size.toLong()

        // 1. 트랜잭션 A(읽기): 빨리 실패하게 하는 사전 검사
        DatabaseFactory.dbQuery(database) { checkLimits(tierContext(userId), size) }

        // 2. 트랜잭션 밖: 스토리지 업로드
        val songId = UUID.randomUUID()
        val key = "tabs/$userId/$songId.${input.format.ext}"
        try {
            client.upload(key, input.bytes, CONTENT_TYPE)
        } catch (e: CancellationException) {
            throw e
        } catch (e: StorageException) {
            throw ApiException(HttpStatusCode.BadGateway, "STORAGE_ERROR", "악보 파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        }

        // 3. 트랜잭션 B: 프로필 잠금 뒤 한도 재검사(동시 업로드 대비) + INSERT
        try {
            return DatabaseFactory.dbQuery(database) {
                checkLimits(tierContext(userId, lock = true), size)
                SongsTable.insert {
                    it[id] = songId
                    it[SongsTable.userId] = userId
                    it[title] = input.title
                    it[artist] = input.artist
                    it[mediaType] = SongsTable.MEDIA_TAB
                    it[videoId] = null
                    it[tabStorageKey] = key
                    it[tabFileName] = input.fileName
                    it[tabFileSize] = size
                    it[tabFormat] = input.format.ext
                }
                val row = SongsTable.selectAll().where { SongsTable.id eq songId }.single()
                songService.rowToDto(row, 0L, emptyList())
            }
        } catch (t: Throwable) {
            cleanupUploadedFile(client, database, key)
            throw t
        }
    }

    /**
     * 4. 보상 정리(backend-kotlin §3). 커밋됐는지 키로 확인한다. 확인 자체가 실패하면 커밋됐을 수도 있으므로
     * 지우지도 휴지통에 넣지도 않는다(커밋된 파일 오삭제 < 고아 파일 하나, 명세 §5.3-4)
     */
    private suspend fun cleanupUploadedFile(client: StorageClient, database: Database, key: String) {
        withContext(NonCancellable) {
            val committed = try {
                DatabaseFactory.dbQuery(database) {
                    SongsTable.select(SongsTable.id).where { SongsTable.tabStorageKey eq key }.limit(1).any()
                }
            } catch (e: Throwable) {
                log.warn("TAB 업로드 보상 정리: 커밋 여부를 확인하지 못해 파일($key)을 보존합니다.", e)
                return@withContext
            }
            if (committed) {
                log.info("트랜잭션이 이미 커밋되었으므로 TAB 파일($key)을 보존합니다.")
                return@withContext
            }
            try {
                client.delete(key)
            } catch (delEx: Throwable) {
                log.warn("TAB 업로드 실패 후 파일($key) 삭제 실패, storage_trash에 등록합니다.", delEx)
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

    /** 본인 TAB 곡의 서명 주소. 없음·남의 곡·유튜브 곡은 모두 404(존재를 드러내지 않는다) */
    suspend fun fileUrl(userId: UUID, songId: UUID): TabFileResponse {
        val client = requireStorage()
        val database = requireDb()
        val row = DatabaseFactory.dbQuery(database) {
            SongsTable.select(SongsTable.tabStorageKey, SongsTable.tabFileName, SongsTable.tabFormat, SongsTable.tabFileSize)
                .where {
                    (SongsTable.id eq songId) and (SongsTable.userId eq userId) and (SongsTable.mediaType eq SongsTable.MEDIA_TAB)
                }
                .singleOrNull()
        } ?: throw NotFoundException("곡을 찾을 수 없습니다.")

        val url = try {
            client.createSignedUrl(row[SongsTable.tabStorageKey]!!, SIGNED_URL_TTL_SEC)
        } catch (e: CancellationException) {
            throw e
        } catch (e: StorageException) {
            throw ApiException(HttpStatusCode.BadGateway, "STORAGE_ERROR", "악보 파일 주소를 만들지 못했습니다.")
        }
        return TabFileResponse(
            url = url,
            expiresIn = SIGNED_URL_TTL_SEC,
            fileName = row[SongsTable.tabFileName]!!,
            format = row[SongsTable.tabFormat]!!,
            sizeBytes = row[SongsTable.tabFileSize]!!
        )
    }

    companion object {
        /** T3: 클라이언트가 받자마자 기기 캐시에 넣으므로 녹음(3600초)보다 짧게 */
        const val SIGNED_URL_TTL_SEC = 300
        /** 브라우저가 Supabase 출처에서 XML을 렌더하지 않게 셋 다 octet-stream(명세 §4) */
        const val CONTENT_TYPE = "application/octet-stream"
        const val MAX_TITLE = 300
        const val MAX_ARTIST = 200
    }
}
