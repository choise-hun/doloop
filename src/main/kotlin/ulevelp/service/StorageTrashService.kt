package ulevelp.service

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import org.slf4j.LoggerFactory
import ulevelp.db.DatabaseFactory
import ulevelp.db.StorageTrashTable
import ulevelp.storage.StorageClient
import ulevelp.storage.StorageException
import java.time.OffsetDateTime
import kotlin.math.min

class StorageTrashService(
    private val db: Database?,
    private val storageClient: StorageClient?
) {
    private val log = LoggerFactory.getLogger(StorageTrashService::class.java)

    /** 커밋된 storage_trash 행을 바로 지운다. 예외를 밖으로 던지지 않는다(CancellationException 제외). */
    suspend fun purge(ids: List<Long>) {
        if (ids.isEmpty() || db == null || storageClient == null) {
            return
        }

        for (trashId in ids) {
            val key = try {
                DatabaseFactory.dbQuery(db) {
                    StorageTrashTable
                        .select(StorageTrashTable.storageKey)
                        .where { StorageTrashTable.id eq trashId }
                        .singleOrNull()
                        ?.get(StorageTrashTable.storageKey)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                log.warn("storage_trash 행($trashId) 조회 실패", e)
                continue
            } ?: continue

            try {
                storageClient.delete(key)
                // 성공 시 행 삭제
                DatabaseFactory.dbQuery(db) {
                    StorageTrashTable.deleteWhere { StorageTrashTable.id eq trashId }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: StorageException) {
                val errorMsg = (e.message ?: "스토리지 파일 삭제 실패").take(500)
                log.warn("스토리지 파일($key) 삭제 실패 (trashId=$trashId): {}", errorMsg)
                try {
                    DatabaseFactory.dbQuery(db) {
                        StorageTrashTable.update({ StorageTrashTable.id eq trashId }) {
                            it[attempts] = attempts + 1
                            it[lastError] = errorMsg
                        }
                    }
                } catch (updateEx: CancellationException) {
                    throw updateEx
                } catch (updateEx: Exception) {
                    log.warn("storage_trash 상태 갱신 실패 (trashId=$trashId)", updateEx)
                }
            } catch (e: Exception) {
                log.warn("스토리지 삭제 중 예기치 않은 오류 (trashId=$trashId, key=$key)", e)
            }
        }
    }
    suspend fun runSharedRetryBatch(now: OffsetDateTime): JsonObject {
        val database = db ?: throw ulevelp.api.ApiException(io.ktor.http.HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")
        val t = StorageTrashTable
        val ids = DatabaseFactory.dbQuery(database) {
            val rows = t.selectAll().where { (t.storageKey like "shared/%") and (t.nextAttemptAt lessEq now) }
                .orderBy(t.id).limit(50).forUpdate(ForUpdateOption.PostgreSQL.ForUpdate(ForUpdateOption.PostgreSQL.MODE.SKIP_LOCKED)).toList()
            rows.forEach { row ->
                val minutes = min(1L shl row[t.attempts].coerceIn(0, 4), 10L)
                t.update({ t.id eq row[t.id] }) { it[nextAttemptAt] = now.plusMinutes(minutes) }
            }
            rows.map { it[t.id] }
        }
        purge(ids)
        return DatabaseFactory.dbQuery(database) {
            val failed = if (ids.isEmpty()) 0 else t.selectAll().where { t.id inList ids }.count().toInt()
            val stuck = t.selectAll().where { (t.storageKey like "shared/%") and (t.attempts greaterEq 5) }.count()
            val overdue = t.selectAll().where { (t.storageKey like "shared/%") and (t.createdAt less now.minusHours(24)) }.count()
            if (stuck > 0) log.warn("공유 사본 정리 재시도 누적: {}", stuck)
            if (overdue > 0) log.error("공유 사본 정리 24시간 초과: {}", overdue)
            buildJsonObject { put("processed", ids.size); put("deleted", ids.size - failed); put("failed", failed); put("stuck", stuck); put("overdue", overdue) }
        }
    }

}

