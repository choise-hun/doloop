package ulevelp.service

import io.ktor.http.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import org.slf4j.LoggerFactory
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.AnalysisJobsTable
import ulevelp.db.DatabaseFactory
import ulevelp.db.NotesTable
import ulevelp.db.OutboxRepository
import ulevelp.db.ProfilesTable
import ulevelp.note.AnalyzeJobDispatcher
import ulevelp.note.GeminiClient
import ulevelp.note.GeminiSchemas
import ulevelp.note.GuitarSvgRenderer
import ulevelp.note.HarmonyChordDto
import ulevelp.note.KeyboardSvgRenderer
import java.time.Clock
import java.time.Duration
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

@Serializable
data class AnalyzeJobCreateResponse(
    val jobId: String,
    val status: String = "queued"
)

@Serializable
data class AnalysisJobDto(
    val id: String,
    val url: String,
    val tags: List<String>,
    val status: String,
    val error: String? = null,
    val noteId: String? = null,
    val createdAt: String,
    val startedAt: String? = null,
    val finishedAt: String? = null
)

@Serializable
data class AnalysisJobListResponse(
    val jobs: List<AnalysisJobDto>
)

@Serializable
data class NoteSummaryDto(
    val id: String,
    val videoId: String,
    val url: String,
    val title: String,
    val channel: String,
    val tags: List<String>,
    val memo: String,
    val headline: String,
    val points: List<String>,
    val keywords: List<String>,
    val difficulty: String? = null,
    val model: String,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class NoteListResponse(
    val notes: List<NoteSummaryDto>
)

@Serializable
data class NoteDetailDto(
    val id: String,
    val videoId: String,
    val url: String,
    val title: String,
    val channel: String,
    val tags: List<String>,
    val memo: String,
    val headline: String,
    val points: List<String>,
    val keywords: List<String>,
    val difficulty: String? = null,
    val analysis: JsonObject,
    val diagramsSvg: List<String>,
    val model: String,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class NoteDetailResponse(
    val note: NoteDetailDto
)

class NoteService(
    private val db: Database?,
    private val integrationService: IntegrationService,
    private val videoMetaClient: VideoMetaClient,
    private val geminiClient: GeminiClient,
    private val jobTimeoutMs: Long = JOB_EXECUTION_TIMEOUT_MS,
    private val clock: Clock = Clock.systemUTC(),
    private val notionPushWorker: ulevelp.notion.NotionPushWorker? = null
) {
    private val logger = LoggerFactory.getLogger(NoteService::class.java)

    companion object {
        const val DAILY_LIMIT_PER_USER = 20
        const val MAX_CONCURRENT_JOBS_PER_USER = 1
        const val RECENT_JOBS_LIMIT = 20
        const val JOB_EXECUTION_TIMEOUT_MS = 54L * 60L * 1000L // 54분
    }

    private fun requireDb(): Database =
        db ?: throw ApiException(
            HttpStatusCode.ServiceUnavailable,
            "DB_UNAVAILABLE",
            "데이터베이스가 연결되어 있지 않습니다."
        )

    private fun formatTimestamp(t: OffsetDateTime?): String? =
        t?.let { DateTimeFormatter.ISO_INSTANT.format(it.toInstant()) }

    private fun formatTimestampNotNull(t: OffsetDateTime): String =
        DateTimeFormatter.ISO_INSTANT.format(t.toInstant())

    suspend fun requestAnalyze(
        userId: UUID,
        rawUrl: String,
        rawTags: List<String>,
        memo: String,
        dispatcher: AnalyzeJobDispatcher
    ): AnalyzeJobCreateResponse {
        val database = requireDb()

        val videoId = ExportImportService.extractVideoId(rawUrl)
            ?: throw InvalidInputException("올바른 유튜브 영상 주소가 아닙니다.")
        val normalizedUrl = "https://www.youtube.com/watch?v=$videoId"

        if (rawTags.isEmpty()) {
            throw InvalidInputException("유효한 분석 태그를 1개 이상 선택해 주세요.")
        }
        for (tag in rawTags) {
            val trimmed = tag.trim()
            if (trimmed.isEmpty() || trimmed !in GeminiSchemas.TAGS) {
                throw InvalidInputException("유효한 분석 태그를 1개 이상 선택해 주세요.")
            }
        }
        val orderedTags = GeminiSchemas.TAGS.filter { it in rawTags.map { t -> t.trim() }.toSet() }
        if (orderedTags.isEmpty()) {
            throw InvalidInputException("유효한 분석 태그를 1개 이상 선택해 주세요.")
        }

        // Gemini 키 존재 및 복호화 가능 확인 (미등록 시 412 NO_KEY)
        integrationService.requireDecryptedGemini(userId, "ulevelp")

        val nowUtc = clock.instant().atOffset(ZoneOffset.UTC)
        val todayUtc = LocalDate.now(clock.withZone(ZoneOffset.UTC))
        val todayStartUtc = todayUtc.atStartOfDay().atOffset(ZoneOffset.UTC)

        val jobId = DatabaseFactory.dbQuery(database) {
            // 사용자 프로필 행 잠금 (동시성 보호)
            ProfilesTable.select(ProfilesTable.id)
                .where { ProfilesTable.id eq userId }
                .forUpdate(ForUpdateOption.ForUpdate)
                .singleOrNull() ?: throw NotFoundException("사용자 프로필을 찾을 수 없습니다.")

            // 1) 동시 실행 1건 제한
            val activeCount = AnalysisJobsTable.selectAll()
                .where {
                    (AnalysisJobsTable.userId eq userId) and
                    (AnalysisJobsTable.status inList listOf("queued", "running"))
                }
                .count()
            if (activeCount >= MAX_CONCURRENT_JOBS_PER_USER) {
                throw ApiException(
                    HttpStatusCode.TooManyRequests,
                    "RATE_LIMITED",
                    "이미 분석 중인 영상이 있습니다. 완료된 후 다시 요청해 주세요.",
                    retryAfter = 30
                )
            }

            // 2) 당일 20건 제한
            val dailyCount = AnalysisJobsTable.selectAll()
                .where {
                    (AnalysisJobsTable.userId eq userId) and
                    (AnalysisJobsTable.createdAt greaterEq todayStartUtc)
                }
                .count()
            if (dailyCount >= DAILY_LIMIT_PER_USER) {
                val tomorrowStartUtc = todayUtc.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC)
                val retryAfterSec = Duration.between(clock.instant(), tomorrowStartUtc.toInstant())
                    .seconds.toInt().coerceIn(1, 86400)
                throw ApiException(
                    HttpStatusCode.TooManyRequests,
                    "RATE_LIMITED",
                    "하루 최대 20건까지 분석을 요청할 수 있습니다. 내일 다시 시도해 주세요.",
                    retryAfter = retryAfterSec
                )
            }

            val newId = UUID.randomUUID()
            AnalysisJobsTable.insert {
                it[id] = newId
                it[AnalysisJobsTable.userId] = userId
                it[url] = normalizedUrl
                it[tags] = orderedTags
                it[AnalysisJobsTable.memo] = memo
                it[status] = "queued"
                it[createdAt] = nowUtc
            }
            newId
        }

        // 트랜잭션 밖에서 디스패처 호출
        try {
            dispatcher.dispatch(jobId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logger.error("분석 작업 디스패치 실패 jobId={}: {}", jobId, e.message, e)
            try {
                DatabaseFactory.dbQuery(database) {
                    AnalysisJobsTable.update({ (AnalysisJobsTable.id eq jobId) and (AnalysisJobsTable.status eq "queued") }) {
                        it[status] = "failed"
                        it[error] = "dispatch_failed: ${(e.message ?: "").take(200)}"
                        it[finishedAt] = clock.instant().atOffset(ZoneOffset.UTC)
                    }
                }
            } catch (updateEx: Exception) {
                logger.error("디스패치 실패 상태 업데이트 실패 jobId={}: {}", jobId, updateEx.message)
            }
            throw ApiException(
                HttpStatusCode.BadGateway,
                "JOB_DISPATCH_ERROR",
                "분석 작업 실행 요청에 실패했습니다. 잠시 후 다시 시도해 주세요."
            )
        }

        return AnalyzeJobCreateResponse(jobId = jobId.toString(), status = "queued")
    }

    suspend fun executeJob(jobId: UUID) {
        val database = requireDb()

        // 1. 트랜잭션 1: queued -> running 전환 및 데이터 조회
        val jobRow = DatabaseFactory.dbQuery(database) {
            val updated = AnalysisJobsTable.update({ (AnalysisJobsTable.id eq jobId) and (AnalysisJobsTable.status eq "queued") }) {
                it[status] = "running"
                it[startedAt] = clock.instant().atOffset(ZoneOffset.UTC)
            }
            if (updated == 0) {
                null
            } else {
                AnalysisJobsTable.selectAll().where { AnalysisJobsTable.id eq jobId }.singleOrNull()
            }
        } ?: run {
            logger.warn("executeJob: 실행 가능한 queued 작업이 없습니다 jobId={}", jobId)
            return
        }

        val userId = jobRow[AnalysisJobsTable.userId]
        val url = jobRow[AnalysisJobsTable.url]
        val tags = jobRow[AnalysisJobsTable.tags]
        val memo = jobRow[AnalysisJobsTable.memo]

        // 2. 트랜잭션 밖에서 외부 호출 (최대 jobTimeoutMs)
        try {
            withTimeout(jobTimeoutMs) {
                val gemini = integrationService.requireDecryptedGemini(userId, "ulevelp")
                val videoId = ExportImportService.extractVideoId(url)
                    ?: throw InvalidInputException("잘못된 영상 URL")

                val meta = runCatching { videoMetaClient.fetch(videoId) }.getOrNull()
                val title = meta?.title?.takeIf { it.isNotBlank() }?.take(300) ?: url
                val channel = meta?.author?.take(200) ?: ""

                val (schema, prompt) = GeminiSchemas.buildPrompt(tags, memo)
                val result = geminiClient.generateNoteAnalysis(gemini.apiKey, gemini.model, url, prompt, schema)
                val analysis = result.analysis

                val headline = analysis["summary"]?.jsonObject?.get("headline")?.jsonPrimitive?.contentOrNull?.take(500) ?: ""
                val points = analysis["summary"]?.jsonObject?.get("points")?.jsonArray?.mapNotNull {
                    (it as? JsonObject)?.get("point")?.jsonPrimitive?.contentOrNull
                } ?: emptyList()
                val keywords = analysis["key_concepts"]?.jsonArray?.mapNotNull {
                    it.jsonPrimitive.contentOrNull?.replace(",", " ")?.trim()?.take(100)?.takeIf(String::isNotEmpty)
                }?.distinct() ?: emptyList()
                val difficulty = analysis["difficulty"]?.jsonPrimitive?.contentOrNull?.takeIf { it in setOf("입문", "중급", "고급") }

                val progressionsElem = analysis["harmony"]?.jsonObject?.get("progressions")?.jsonArray
                val diagramsSvg: List<String> = if (progressionsElem != null) {
                    progressionsElem.mapNotNull { pElem ->
                        val pObj = pElem as? JsonObject ?: return@mapNotNull null
                        val inst = pObj["instrument"]?.jsonPrimitive?.contentOrNull ?: "건반"
                        val chords = pObj["chords"]?.jsonArray.orEmpty().mapNotNull { cElem ->
                            val cObj = cElem as? JsonObject ?: return@mapNotNull null
                            HarmonyChordDto(
                                symbol = cObj["symbol"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                roman = cObj["roman"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                function = cObj["function"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                split = cObj["split"]?.jsonPrimitive?.booleanOrNull ?: false,
                                lh = cObj["lh"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty(),
                                rh = cObj["rh"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty(),
                                frets = cObj["frets"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty(),
                                voicingNote = cObj["voicing_note"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                nuance = cObj["nuance"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                source = cObj["source"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                timestamp = cObj["timestamp"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            )
                        }
                        if (inst == "기타") {
                            GuitarSvgRenderer.progressionSvg(chords) ?: ""
                        } else {
                            KeyboardSvgRenderer.progressionSvg(chords) ?: ""
                        }
                    }
                } else {
                    emptyList()
                }

                // 3. 트랜잭션 2: 성공 시 notes 생성, analysis_jobs done, Outbox 적재
                val noteId = UUID.randomUUID()
                val nowUtc = clock.instant().atOffset(ZoneOffset.UTC)
                DatabaseFactory.dbQuery(database) {
                    NotesTable.insert {
                        it[id] = noteId
                        it[NotesTable.userId] = userId
                        it[NotesTable.videoId] = videoId
                        it[NotesTable.title] = title
                        it[NotesTable.channel] = channel
                        it[NotesTable.tags] = tags
                        it[NotesTable.memo] = memo
                        it[NotesTable.headline] = headline
                        it[NotesTable.points] = points
                        it[NotesTable.keywords] = keywords
                        it[NotesTable.difficulty] = difficulty
                        it[NotesTable.analysis] = analysis
                        it[NotesTable.diagramsSvg] = JsonArray(diagramsSvg.map { svg -> JsonPrimitive(svg) })
                        it[NotesTable.model] = gemini.model
                        it[createdAt] = nowUtc
                        it[updatedAt] = nowUtc
                    }

                    AnalysisJobsTable.update({ AnalysisJobsTable.id eq jobId }) {
                        it[status] = "done"
                        it[AnalysisJobsTable.noteId] = noteId
                        it[error] = null
                        it[finishedAt] = nowUtc
                    }

                    OutboxRepository.enqueueIfSyncEnabled(userId, "note", noteId, "upsert")
                }
            }
            try {
                notionPushWorker?.pushUserOutbox(userId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                logger.warn("Notion push fast-path 실패(무시됨) userId={}: {}", userId, e.message)
            }
        } catch (e: Throwable) {
            val errMsg: String = when (e) {
                is TimeoutCancellationException -> "분석 제한 시간(54분)을 초과하여 중단되었습니다."
                is CancellationException -> "분석 작업이 취소되었습니다."
                else -> (e.message ?: "분석 실패").take(500)
            }
            logger.warn("executeJob 실패 jobId={}: {}", jobId, errMsg)

            withContext(NonCancellable) {
                try {
                    DatabaseFactory.dbQuery(database) {
                        AnalysisJobsTable.update({ (AnalysisJobsTable.id eq jobId) and (AnalysisJobsTable.status neq "done") }) {
                            it[status] = "failed"
                            it[error] = errMsg
                            it[finishedAt] = clock.instant().atOffset(ZoneOffset.UTC)
                        }
                    }
                } catch (updateEx: Exception) {
                    logger.error("실패 상태 기록 실패 jobId={}: {}", jobId, updateEx.message)
                }
            }

            if (e is CancellationException && e !is TimeoutCancellationException) {
                throw e
            }
        }
    }

    suspend fun listJobs(userId: UUID): AnalysisJobListResponse {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val jobs = AnalysisJobsTable.selectAll()
                .where { AnalysisJobsTable.userId eq userId }
                .orderBy(AnalysisJobsTable.createdAt to SortOrder.DESC, AnalysisJobsTable.id to SortOrder.DESC)
                .limit(RECENT_JOBS_LIMIT)
                .map { rowToJobDto(it) }
            AnalysisJobListResponse(jobs)
        }
    }

    suspend fun getJob(userId: UUID, jobId: UUID): AnalysisJobDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val row = AnalysisJobsTable.selectAll()
                .where { (AnalysisJobsTable.id eq jobId) and (AnalysisJobsTable.userId eq userId) }
                .singleOrNull() ?: throw NotFoundException("분석 작업을 찾을 수 없습니다.")
            rowToJobDto(row)
        }
    }

    suspend fun listNotes(userId: UUID, tag: String?): NoteListResponse {
        val database = requireDb()
        val trimmedTag = tag?.trim()?.takeIf { it.isNotEmpty() }
        if (trimmedTag != null && trimmedTag !in GeminiSchemas.ALLOWED_NOTE_TAGS) {
            throw InvalidInputException("유효하지 않은 태그 필터입니다.")
        }

        return DatabaseFactory.dbQuery(database) {
            val rows = NotesTable.selectAll()
                .where { NotesTable.userId eq userId }
                .orderBy(NotesTable.createdAt to SortOrder.DESC, NotesTable.id to SortOrder.DESC)
                .toList()
            val filtered = if (trimmedTag != null) {
                rows.filter { trimmedTag in it[NotesTable.tags] }
            } else {
                rows
            }
            NoteListResponse(filtered.map { rowToNoteSummaryDto(it) })
        }
    }

    suspend fun getNote(userId: UUID, noteId: UUID): NoteDetailDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val row = NotesTable.selectAll()
                .where { (NotesTable.id eq noteId) and (NotesTable.userId eq userId) }
                .singleOrNull() ?: throw NotFoundException("학습 노트를 찾을 수 없습니다.")
            rowToNoteDetailDto(row)
        }
    }

    suspend fun updateNote(
        userId: UUID,
        noteId: UUID,
        newMemo: String?,
        newTags: List<String>?,
        newTitle: String?
    ): NoteDetailDto {
        val database = requireDb()
        val nowUtc = clock.instant().atOffset(ZoneOffset.UTC)

        val updated = DatabaseFactory.dbQuery(database) {
            val exists = NotesTable.selectAll()
                .where { (NotesTable.id eq noteId) and (NotesTable.userId eq userId) }
                .count() > 0
            if (!exists) {
                throw NotFoundException("학습 노트를 찾을 수 없습니다.")
            }

            NotesTable.update({ (NotesTable.id eq noteId) and (NotesTable.userId eq userId) }) {
                if (newTitle != null) it[title] = newTitle
                if (newMemo != null) it[memo] = newMemo
                if (newTags != null) it[tags] = newTags
                it[updatedAt] = nowUtc
            }

            OutboxRepository.enqueueIfSyncEnabled(userId, "note", noteId, "upsert")

            val row = NotesTable.selectAll()
                .where { (NotesTable.id eq noteId) and (NotesTable.userId eq userId) }
                .single()
            rowToNoteDetailDto(row)
        }

        try {
            notionPushWorker?.pushUserOutbox(userId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logger.warn("Notion push fast-path 실패(무시됨) userId={}: {}", userId, e.message)
        }

        return updated
    }

    suspend fun deleteNote(userId: UUID, noteId: UUID) {
        val database = requireDb()
        DatabaseFactory.dbQuery(database) {
            val exists = NotesTable.selectAll()
                .where { (NotesTable.id eq noteId) and (NotesTable.userId eq userId) }
                .count() > 0
            if (!exists) {
                throw NotFoundException("학습 노트를 찾을 수 없습니다.")
            }

            OutboxRepository.enqueueIfSyncEnabled(userId, "note", noteId, "delete")
            NotesTable.deleteWhere { (NotesTable.id eq noteId) and (NotesTable.userId eq userId) }
        }

        try {
            notionPushWorker?.pushUserOutbox(userId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logger.warn("Notion push fast-path 실패(무시됨) userId={}: {}", userId, e.message)
        }
    }

    private fun rowToJobDto(row: ResultRow): AnalysisJobDto = AnalysisJobDto(
        id = row[AnalysisJobsTable.id].toString(),
        url = row[AnalysisJobsTable.url],
        tags = row[AnalysisJobsTable.tags],
        status = row[AnalysisJobsTable.status],
        error = row[AnalysisJobsTable.error],
        noteId = row[AnalysisJobsTable.noteId]?.toString(),
        createdAt = formatTimestampNotNull(row[AnalysisJobsTable.createdAt]),
        startedAt = formatTimestamp(row[AnalysisJobsTable.startedAt]),
        finishedAt = formatTimestamp(row[AnalysisJobsTable.finishedAt])
    )

    private fun rowToNoteSummaryDto(row: ResultRow): NoteSummaryDto = NoteSummaryDto(
        id = row[NotesTable.id].toString(),
        videoId = row[NotesTable.videoId],
        url = "https://www.youtube.com/watch?v=${row[NotesTable.videoId]}",
        title = row[NotesTable.title],
        channel = row[NotesTable.channel],
        tags = row[NotesTable.tags],
        memo = row[NotesTable.memo],
        headline = row[NotesTable.headline],
        points = row[NotesTable.points],
        keywords = row[NotesTable.keywords],
        difficulty = row[NotesTable.difficulty],
        model = row[NotesTable.model],
        createdAt = formatTimestampNotNull(row[NotesTable.createdAt]),
        updatedAt = formatTimestampNotNull(row[NotesTable.updatedAt])
    )

    private fun rowToNoteDetailDto(row: ResultRow): NoteDetailDto {
        val analysisObj = (row[NotesTable.analysis] as? JsonObject) ?: JsonObject(emptyMap())
        val diagramsArray = (row[NotesTable.diagramsSvg] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList()
        return NoteDetailDto(
            id = row[NotesTable.id].toString(),
            videoId = row[NotesTable.videoId],
            url = "https://www.youtube.com/watch?v=${row[NotesTable.videoId]}",
            title = row[NotesTable.title],
            channel = row[NotesTable.channel],
            tags = row[NotesTable.tags],
            memo = row[NotesTable.memo],
            headline = row[NotesTable.headline],
            points = row[NotesTable.points],
            keywords = row[NotesTable.keywords],
            difficulty = row[NotesTable.difficulty],
            analysis = analysisObj,
            diagramsSvg = diagramsArray,
            model = row[NotesTable.model],
            createdAt = formatTimestampNotNull(row[NotesTable.createdAt]),
            updatedAt = formatTimestampNotNull(row[NotesTable.updatedAt])
        )
    }
}

