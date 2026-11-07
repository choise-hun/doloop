package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import ulevelp.api.ApiException
import ulevelp.api.NotFoundException
import ulevelp.db.DatabaseFactory
import ulevelp.db.OutboxRepository
import ulevelp.db.SessionsTable
import ulevelp.db.SongsTable
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

@Serializable
data class SaveProgressResponse(
    val ok: Boolean = true,
    val keep: Boolean,
    val sessionId: String?,
    val totalSeconds: Int?,
    val minutes: Double?,
    val pendingSeconds: Int?,
    val coveragePct: Int? = null
)

data class SaveProgressInput(
    val songId: UUID,
    val pos: BigDecimal,
    val a: BigDecimal?,
    val b: BigDecimal?,
    val rate: BigDecimal?,
    val date: LocalDate,
    val addSeconds: Int,
    val addLoops: Int,
    val partName: String? = null,
    val durationSec: Int? = null,
    val completed: Boolean? = null
)

class PracticeService(private val db: Database?) {

    private fun requireDb(): Database =
        db ?: throw ApiException(
            status = HttpStatusCode.ServiceUnavailable,
            code = "DB_UNAVAILABLE",
            message = "데이터베이스가 연결되어 있지 않습니다."
        )

    private fun Transaction.updateSessionInTransaction(
        userId: UUID,
        input: SaveProgressInput,
        durationSec: Int
    ): Pair<Int, Int> {
        val existingSession = SessionsTable.selectAll()
            .where {
                (SessionsTable.userId eq userId) and
                (SessionsTable.songId eq input.songId) and
                (SessionsTable.date eq input.date)
            }
            .singleOrNull() ?: return 0 to 0

        val (newPartStats, coverage) = mergePartStats(
            existingJson = existingSession[SessionsTable.partStats],
            partName = input.partName,
            a = input.a,
            b = input.b,
            rate = input.rate,
            completed = input.completed,
            durationSec = durationSec,
            addSeconds = input.addSeconds,
            addLoops = input.addLoops
        )

        val updatedCount = SessionsTable.update({
            (SessionsTable.userId eq userId) and
            (SessionsTable.songId eq input.songId) and
            (SessionsTable.date eq input.date)
        }) {
            with(SqlExpressionBuilder) {
                it[seconds] = seconds + input.addSeconds
                it[loops] = loops + input.addLoops
            }
            if (input.rate != null) {
                it[rate] = input.rate
            }
            it[a] = input.a
            it[b] = input.b
            it[partStats] = newPartStats
            it[coveragePct] = coverage
        }

        return updatedCount to coverage
    }

    suspend fun saveProgress(userId: UUID, input: SaveProgressInput): SaveProgressResponse {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            // 1. 곡 존재 확인 및 배타적 행 잠금 (FOR UPDATE)
            val songRow = SongsTable
                .select(SongsTable.lastDate, SongsTable.durationSec)
                .where { (SongsTable.id eq input.songId) and (SongsTable.userId eq userId) }
                .forUpdate(ForUpdateOption.ForUpdate)
                .singleOrNull() ?: throw NotFoundException("곡을 찾을 수 없습니다.")

            val existingLastDate = songRow[SongsTable.lastDate]
            val existingDuration = songRow[SongsTable.durationSec]
            val finalDuration = if (existingDuration > 0) {
                existingDuration
            } else {
                input.durationSec ?: 0
            }

            val newLast = if (existingLastDate != null) {
                if (existingLastDate > input.date) existingLastDate else input.date
            } else {
                input.date
            }

            // 2. 곡 위치·구간·배속·마지막 연습일·영상 길이 갱신
            SongsTable.update({ (SongsTable.id eq input.songId) and (SongsTable.userId eq userId) }) {
                it[pos] = input.pos
                it[a] = input.a
                it[b] = input.b
                if (input.rate != null) {
                    it[rate] = input.rate
                }
                it[lastDate] = newLast
                if (finalDuration > 0 && existingDuration == 0) {
                    it[durationSec] = finalDuration
                }
            }
            // 자동 연동(M1-4a): 구간·배속·순서(마지막 연습일)가 공개본에 반영된다
            SharedFolderSync.resyncCategories(this, userId, null)

            // 3. 추가 초/루프가 0이면 곡만 갱신하고 종료
            if (input.addSeconds == 0 && input.addLoops == 0) {
                OutboxRepository.enqueueIfSyncEnabled(userId, "song", input.songId, "upsert")
                return@dbQuery SaveProgressResponse(
                    ok = true,
                    keep = false,
                    sessionId = null,
                    totalSeconds = null,
                    minutes = null,
                    pendingSeconds = null
                )
            }

            // 4. 당일 세션 합산 UPDATE 시도
            val (updatedSessionCount, coverageFromUpdate) = updateSessionInTransaction(userId, input, finalDuration)
            var finalCoverage = coverageFromUpdate

            // 5. 합산 대상 행이 없는 경우 (당일 첫 연습 기록)
            if (updatedSessionCount == 0) {
                if (input.addSeconds < MIN_NEW_SESSION_SECONDS) {
                    OutboxRepository.enqueueIfSyncEnabled(userId, "song", input.songId, "upsert")
                    return@dbQuery SaveProgressResponse(
                        ok = true,
                        keep = true,
                        sessionId = null,
                        totalSeconds = null,
                        minutes = null,
                        pendingSeconds = input.addSeconds
                    )
                }

                val (initialPartStats, initialCoverage) = mergePartStats(
                    existingJson = null,
                    partName = input.partName,
                    a = input.a,
                    b = input.b,
                    rate = input.rate,
                    completed = input.completed,
                    durationSec = finalDuration,
                    addSeconds = input.addSeconds,
                    addLoops = input.addLoops
                )
                finalCoverage = initialCoverage

                val newSessionId = UUID.randomUUID()
                val insCount = SessionsTable.insertIgnore {
                    it[id] = newSessionId
                    it[SessionsTable.userId] = userId
                    it[SessionsTable.songId] = input.songId
                    it[date] = input.date
                    it[seconds] = input.addSeconds
                    it[loops] = input.addLoops
                    if (input.rate != null) {
                        it[rate] = input.rate
                    }
                    it[a] = input.a
                    it[b] = input.b
                    it[partStats] = initialPartStats
                    it[coveragePct] = initialCoverage
                }.insertedCount

                if (insCount == 0) {
                    // 동시 요청으로 다른 트랜잭션이 이미 INSERT한 경우 다시 UPDATE
                    val (_, cov) = updateSessionInTransaction(userId, input, finalDuration)
                    finalCoverage = cov
                }
            }

            // 6. 당일 세션 읽기
            val sessionRow = SessionsTable.selectAll()
                .where {
                    (SessionsTable.userId eq userId) and
                    (SessionsTable.songId eq input.songId) and
                    (SessionsTable.date eq input.date)
                }
                .single()

            val sessionId = sessionRow[SessionsTable.id]
            val totalSeconds = sessionRow[SessionsTable.seconds]

            // 7. Outbox 적재
            OutboxRepository.enqueueIfSyncEnabled(userId, "song", input.songId, "upsert")
            OutboxRepository.enqueueIfSyncEnabled(userId, "session", sessionId, "upsert")

            // 8. 응답 반환
            val minutes = Math.round(totalSeconds / 60.0 * 10) / 10.0
            SaveProgressResponse(
                ok = true,
                keep = false,
                sessionId = sessionId.toString(),
                totalSeconds = totalSeconds,
                minutes = minutes,
                pendingSeconds = null,
                coveragePct = sessionRow[SessionsTable.coveragePct]
            )
        }
    }

    companion object {
        const val MIN_NEW_SESSION_SECONDS = 60

        fun computeCoverage(ranges: List<Pair<Double, Double>>, durationSec: Int): Int {
            if (durationSec <= 0 || ranges.isEmpty()) return 0
            val valid = ranges.map { (a, b) -> Math.max(0.0, a) to Math.min(durationSec.toDouble(), b) }
                .filter { it.first < it.second }
                .sortedBy { it.first }
            if (valid.isEmpty()) return 0

            var totalLen = 0.0
            var curStart = valid[0].first
            var curEnd = valid[0].second

            for (i in 1 until valid.size) {
                val next = valid[i]
                if (next.first <= curEnd) {
                    curEnd = Math.max(curEnd, next.second)
                } else {
                    totalLen += (curEnd - curStart)
                    curStart = next.first
                    curEnd = next.second
                }
            }
            totalLen += (curEnd - curStart)
            val pct = Math.round((totalLen / durationSec.toDouble()) * 100.0).toInt()
            return Math.min(100, Math.max(0, pct))
        }

        fun mergePartStats(
            existingJson: JsonElement?,
            partName: String?,
            a: BigDecimal?,
            b: BigDecimal?,
            rate: BigDecimal?,
            completed: Boolean?,
            durationSec: Int,
            addSeconds: Int = 0,
            addLoops: Int = 0
        ): Pair<JsonElement, Int> {
            val arr = (existingJson as? JsonArray)?.toList() ?: emptyList()
            if (partName.isNullOrBlank()) {
                val ranges = arr.mapNotNull { elem ->
                    val obj = elem as? JsonObject ?: return@mapNotNull null
                    val aVal = obj["a"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
                    val bVal = obj["b"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
                    aVal to bVal
                }.toMutableList()
                if (a != null && b != null && a < b) {
                    ranges.add(a.toDouble() to b.toDouble())
                }
                return (existingJson ?: JsonArray(emptyList())) to computeCoverage(ranges, durationSec)
            }

            val currentList = mutableListOf<JsonObject>()
            var found = false

            val newA = a?.toDouble() ?: 0.0
            val newB = b?.toDouble() ?: 0.0
            val newRate = rate?.toDouble() ?: 1.0
            val isCompleted = completed ?: false

            for (elem in arr) {
                val obj = elem as? JsonObject ?: continue
                val name = obj["name"]?.jsonPrimitive?.contentOrNull
                if (name == partName) {
                    found = true
                    val exA = obj["a"]?.jsonPrimitive?.doubleOrNull ?: newA
                    val exB = obj["b"]?.jsonPrimitive?.doubleOrNull ?: newB
                    val exComp = obj["completed"]?.jsonPrimitive?.booleanOrNull ?: false
                    val exSeconds = obj["seconds"]?.jsonPrimitive?.intOrNull ?: 0
                    val exLoops = obj["loops"]?.jsonPrimitive?.intOrNull ?: 0

                    val mergedA = if (newA < exA) newA else exA
                    val mergedB = if (newB > exB) newB else exB
                    val mergedComp = isCompleted || exComp

                    currentList.add(buildJsonObject {
                        put("name", partName)
                        put("a", mergedA)
                        put("b", mergedB)
                        put("rate", newRate)
                        put("completed", mergedComp)
                        put("seconds", exSeconds + addSeconds)
                        put("loops", exLoops + addLoops)
                    })
                } else {
                    currentList.add(obj)
                }
            }

            if (!found) {
                currentList.add(buildJsonObject {
                    put("name", partName)
                    put("a", newA)
                    put("b", newB)
                    put("rate", newRate)
                    put("completed", isCompleted)
                    put("seconds", addSeconds)
                    put("loops", addLoops)
                })
            }

            val ranges = currentList.mapNotNull { obj ->
                val aVal = obj["a"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
                val bVal = obj["b"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
                aVal to bVal
            }

            val newJson = JsonArray(currentList)
            val coverage = computeCoverage(ranges, durationSec)
            return newJson to coverage
        }
    }
}
