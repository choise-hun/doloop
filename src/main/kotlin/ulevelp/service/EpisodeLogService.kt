package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import ulevelp.api.*
import ulevelp.db.*
import ulevelp.db.SharedPracticeCardsTable as C
import ulevelp.db.SharedPracticeCardReportsTable as R
import ulevelp.db.SharedPracticeCardLikesTable as L
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** 개인 DTO를 거치지 않고 명시적으로 동의한 스냅샷만 공개한다. */
class EpisodeLogService(private val db: Database?, private val communityService: CommunityService) {
    private fun requireDb() = db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")
    private val joined get() = C.join(SessionsTable, JoinType.INNER, C.sessionId, SessionsTable.id)
        .join(SongsTable, JoinType.INNER, SessionsTable.songId, SongsTable.id)
        .join(ProfilesTable, JoinType.INNER, C.userId, ProfilesTable.id)

    internal fun Transaction.lockSource(userId: UUID, sessionId: UUID): ResultRow {
        val songId = SessionsTable.select(SessionsTable.songId).where { (SessionsTable.id eq sessionId) and (SessionsTable.userId eq userId) }
            .singleOrNull()?.get(SessionsTable.songId) ?: throw NotFoundException()
        SongsTable.selectAll().where { (SongsTable.id eq songId) and (SongsTable.userId eq userId) }
            .forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: throw NotFoundException()
        return SessionsTable.selectAll().where { (SessionsTable.id eq sessionId) and (SessionsTable.userId eq userId) and (SessionsTable.songId eq songId) }
            .forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: throw NotFoundException()
    }

    private fun validateSnapshot(s: PublicSessionSnapshot): PublicSessionSnapshot {
        fun check(value: Boolean) { if (!value) episodeConflict("SESSION_NOT_SHAREABLE") }
        check(Regex("^[A-Za-z0-9_-]{11}$").matches(s.videoId))
        try { java.time.LocalDate.parse(s.date) } catch (_: java.time.DateTimeException) { episodeConflict("SESSION_NOT_SHAREABLE") }
        check(s.seconds >= 0 && s.loops >= 0 && s.coveragePct in 0..100)
        check((s.a == null && s.b == null) || (s.a != null && s.b != null && s.a.isFinite() && s.b.isFinite() && s.a >= -10 && s.a < s.b && s.b <= 86400))
        check(s.rate == null || (s.rate.isFinite() && s.rate in 0.25..2.0))
        for (p in s.partStats) {
            val name = try { episodeText(p.name, 50) } catch (_: InvalidInputException) { episodeConflict("SESSION_NOT_SHAREABLE") }
            check(name.isNotEmpty() && name == p.name)
            check(p.a.isFinite() && p.b.isFinite() && p.a >= -10 && p.a <= p.b && p.b <= 86400)
            check(p.rate.isFinite() && p.rate in 0.25..2.0 && p.seconds >= 0 && p.loops >= 0)
            BannedWords.require("partStats.name", p.name)
        }
        return s
    }

    private fun Transaction.snapshot(session: ResultRow): PublicSessionSnapshot {
        val videoId = SongsTable.select(SongsTable.videoId).where { SongsTable.id eq session[SessionsTable.songId] }.single()[SongsTable.videoId]
        // Unknown private part keys are discarded; required values never receive a fallback.
        val parts = try {
            val raw = session[SessionsTable.partStats] as? JsonArray ?: episodeConflict("SESSION_NOT_SHAREABLE")
            raw.map { element ->
                val obj = element as? JsonObject ?: episodeConflict("SESSION_NOT_SHAREABLE")
                requirePartTypes(obj)
                val allowed = obj.filterKeys { it in setOf("name", "a", "b", "rate", "completed", "seconds", "loops") }
                Json.decodeFromJsonElement<PublicPartStatDto>(JsonObject(allowed))
            }
        } catch (_: kotlinx.serialization.SerializationException) { episodeConflict("SESSION_NOT_SHAREABLE") }
          catch (_: IllegalArgumentException) { episodeConflict("SESSION_NOT_SHAREABLE") }
        return validateSnapshot(PublicSessionSnapshot(videoId, session[SessionsTable.date].toString(), session[SessionsTable.seconds], session[SessionsTable.loops],
            session[SessionsTable.a]?.toDouble(), session[SessionsTable.b]?.toDouble(), session[SessionsTable.rate]?.toDouble(), session[SessionsTable.coveragePct], parts))
    }

    private fun readSnapshot(row: ResultRow): PublicSessionSnapshot? {
      return try {
        val raw = row[C.publicSession] as? JsonObject ?: return null
        val parts = raw["partStats"] as? JsonArray ?: return null
        parts.forEach { requirePartTypes(it as? JsonObject ?: episodeConflict("SESSION_NOT_SHAREABLE")) }
        val s = Json.decodeFromJsonElement<PublicSessionSnapshot>(raw)
        validateSnapshot(s)
    } catch (_: kotlinx.serialization.SerializationException) { null }
      catch (_: IllegalArgumentException) { null }
      catch (e: ApiException) { if (e.code in setOf("SESSION_NOT_SHAREABLE", "BANNED_WORD")) null else throw e }
    }

    internal fun eligible(row: ResultRow): Boolean =
        row[C.status] == "published" && row[C.withdrawnAt] == null && row[C.tierPausedAt] == null && row[C.hiddenAt] == null &&
        !row[ProfilesTable.publicName].isNullOrBlank() && TierLimits.isPaid(effectiveTier(row)) &&
        row[C.userId] == row[SessionsTable.userId] && row[C.userId] == row[SongsTable.userId] &&
        validPublicText(row[C.title], 80, false) && validPublicText(row[C.comment], 500, true) && readSnapshot(row) != null

    private fun validPublicText(text: String, max: Int, multiline: Boolean): Boolean = try {
        episodeText(text, max, multiline) == text && !BannedWords.contains(text)
    } catch (_: InvalidInputException) { false }

    private fun requirePartTypes(obj: JsonObject) {
        if ((obj["name"] as? JsonPrimitive)?.isString != true) episodeConflict("SESSION_NOT_SHAREABLE")
        for (key in listOf("a", "b", "rate", "seconds", "loops", "completed")) {
            val p = obj[key] as? JsonPrimitive ?: episodeConflict("SESSION_NOT_SHAREABLE")
            if (p is JsonNull || p.isString) episodeConflict("SESSION_NOT_SHAREABLE")
        }
    }

    /** 카드별 (좋아요 수, 내가 눌렀는지). 없는 id는 (0,false). 카운터 열 없이 행 수로 집계한다. */
    private fun Transaction.likeStates(viewerId: UUID, cardIds: Collection<UUID>): Map<UUID, Pair<Int, Boolean>> {
        if (cardIds.isEmpty()) return emptyMap()
        val count = L.cardId.count()
        val mine = Case().When(L.userId eq viewerId, intLiteral(1)).Else(intLiteral(0)).sum()
        return L.select(L.cardId, count, mine).where { L.cardId inList cardIds }.groupBy(L.cardId)
            .associate { it[L.cardId] to ((it[count]).toInt() to ((it[mine] ?: 0) > 0)) }
    }

    private fun Transaction.publicDto(row: ResultRow, likes: Map<UUID, Pair<Int, Boolean>>): PublicEpisodeLogDto? {
        val s = readSnapshot(row) ?: return null
        val like = likes[row[C.id]] ?: (0 to false)
        val meta = VideoTitlesTable.selectAll().where { VideoTitlesTable.videoId eq s.videoId }.singleOrNull()
        return PublicEpisodeLogDto(row[C.id].toString(), row[C.sessionId].toString(),
            PublicOwnerDto(row[C.userId].toString(), row[ProfilesTable.publicName], row[ProfilesTable.isCreator], row[ProfilesTable.creatorBadge]),
            s.videoId, meta?.get(VideoTitlesTable.title), meta?.get(VideoTitlesTable.author), row[C.title], row[C.comment], episodeTs(row[C.publishedAt])!!,
            s.date, s.seconds, s.loops, s.a, s.b, s.rate, s.coveragePct, s.partStats, like.first, like.second)
    }

    private fun Transaction.mineDto(row: ResultRow, likes: Map<UUID, Pair<Int, Boolean>>): MyEpisodeLogDto {
        val paid = TierLimits.isPaid(effectiveTier(row))
        val hidden = row[C.status] == "moderation_hidden"
        val counts = R.selectAll().where { R.cardId eq row[C.id] }.groupingBy { it[R.status] }.eachCount()
        return MyEpisodeLogDto(row[C.id].toString(), row[C.sessionId].toString(), row[C.title], row[C.comment], episodeTs(row[C.publishedAt])!!,
            if (!hidden && !paid) "tier_paused" else row[C.status], episodeTs(row[C.hiddenAt]), row[C.hiddenReason], episodeTs(row[C.tierPausedAt]),
            episodeTs(row[C.withdrawnAt]), episodeTs(row[C.createdAt])!!, episodeTs(row[C.updatedAt])!!,
            !hidden && paid && !row[ProfilesTable.publicName].isNullOrBlank() && (row[C.withdrawnAt] != null || row[C.tierPausedAt] != null),
            EpisodeReportCountsDto(counts["open"] ?: 0, counts["resolved"] ?: 0, counts["dismissed"] ?: 0),
            if (row[C.withdrawnAt] != null) null else publicDto(row, likes))
    }

    suspend fun share(userId: UUID, sessionId: UUID, title: String, comment: String): Pair<Boolean, ShareEpisodeResponse> = DatabaseFactory.dbQuery(requireDb()) {
        // Ownership is checked before exposing tier or moderation information.
        val ctx = tierContext(userId, lock = true)
        val source = lockSource(userId, sessionId)
        val old = C.selectAll().where { C.sessionId eq sessionId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull()
        if (old?.get(C.status) == "moderation_hidden") episodeConflict("POST_MODERATION_HIDDEN")
        requireCommunityWrite(ctx)
        val profile = ProfilesTable.selectAll().where { ProfilesTable.id eq userId }.single()
        if (profile[ProfilesTable.publicName].isNullOrBlank()) episodeConflict("PUBLIC_NAME_REQUIRED")
        BannedWords.require("title", title)
        BannedWords.require("comment", comment)
        val s = snapshot(source)
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val id = old?.get(C.id) ?: UUID.randomUUID()
        if (old == null) C.insert {
            it[C.id] = id; it[C.sessionId] = sessionId; it[C.userId] = userId
            it[C.title] = title; it[C.comment] = comment; it[publicSession] = Json.encodeToJsonElement(s)
            it[publishedAt] = now
        } else C.update({ C.id eq id }) {
            it[C.title] = title; it[C.comment] = comment; it[publicSession] = Json.encodeToJsonElement(s)
            it[status] = "published"; it[withdrawnAt] = null; it[tierPausedAt] = null
            if (old[C.withdrawnAt] != null || old[C.tierPausedAt] != null) it[publishedAt] = now
        }
        (old == null) to ShareEpisodeResponse(mineDto(joined.selectAll().where { C.id eq id }.single(), likeStates(userId, listOf(id))))
    }

    suspend fun withdraw(userId: UUID, sessionId: UUID): WithdrawEpisodeResponse = DatabaseFactory.dbQuery(requireDb()) {
        tierContext(userId, lock = true)
        lockSource(userId, sessionId)
        val old = C.selectAll().where { C.sessionId eq sessionId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull()
        if (old != null && old[C.withdrawnAt] == null) C.update({ C.id eq old[C.id] }) {
            it[withdrawnAt] = OffsetDateTime.now(ZoneOffset.UTC); it[title] = ""; it[comment] = ""; it[publicSession] = JsonObject(emptyMap())
            // 공유 중지 시 좋아요를 같은 트랜잭션에서 지운다(다시 게시하면 0부터).
            L.deleteWhere { cardId eq old[C.id] }
        }
        WithdrawEpisodeResponse()
    }

    suspend fun mine(userId: UUID, rawCursor: String?): MyEpisodeLogListResponse {
        val cursor = EpisodeCursor.parse(rawCursor, "mine", "self")
        return DatabaseFactory.dbQuery(requireDb()) {
            val rows = joined.selectAll().where { (C.userId eq userId) and episodeBefore(C.publishedAt, C.id, cursor) }
                .orderBy(C.publishedAt to SortOrder.DESC, C.id to SortOrder.DESC).limit(21).toList()
            val page = rows.take(20)
            val likes = likeStates(userId, page.map { it[C.id] })
            MyEpisodeLogListResponse(page.map { mineDto(it, likes) }, if (rows.size > 20) episodeNext(rows[19], "mine", "self", C.publishedAt, C.id) else null)
        }
    }

    private fun Transaction.feedRows(viewerId: UUID, scope: String, cursor: EpisodeCursor?, ids: List<UUID>? = null): List<ResultRow> {
        val q = joined.selectAll().where {
            (C.status eq "published") and C.withdrawnAt.isNull() and C.tierPausedAt.isNull() and C.hiddenAt.isNull() and
                episodeBefore(C.publishedAt, C.id, cursor)
        }
        if (scope == "following") {
            val followed = FollowsTable.select(FollowsTable.followeeId).where { FollowsTable.followerId eq viewerId }.map { it[FollowsTable.followeeId] }
            if (followed.isEmpty()) return emptyList()
            q.andWhere { C.userId inList followed }
        }
        if (ids != null) q.andWhere { C.id inList ids }
        return q.orderBy(C.publishedAt to SortOrder.DESC, C.id to SortOrder.DESC).limit(100).toList()
    }

    suspend fun feed(viewerId: UUID, scope: String, rawCursor: String?): EpisodeLogListResponse {
        if (scope !in setOf("all", "following")) throw InvalidInputException("scope 형식이 올바르지 않습니다.")
        val start = EpisodeCursor.parse(rawCursor, "feed", scope)
        var scan = start
        val candidates = mutableListOf<UUID>()
        // Fill after eligibility checks, and recheck every candidate after all external I/O.
        while (true) {
            val rows = DatabaseFactory.dbQuery(requireDb()) { feedRows(viewerId, scope, scan) }
            val valid = rows.filter(::eligible)
            val videos = valid.mapNotNull { readSnapshot(it)?.videoId }
            communityService.fillTitles(videos)
            candidates.addAll(valid.map { it[C.id] })
            val final = DatabaseFactory.dbQuery(requireDb()) {
                // Requery in bounded batches so a long filtered scan does not exceed SQL parameter limits.
                val eligibleRows = candidates.chunked(100).flatMap { feedRows(viewerId, scope, start, it).filter(::eligible) }
                val sorted = eligibleRows.sortedWith(Comparator { left, right ->
                    val timeOrder = right[C.publishedAt].toInstant().compareTo(left[C.publishedAt].toInstant())
                    if (timeOrder != 0) timeOrder else right[C.id].toString().compareTo(left[C.id].toString())
                }).take(21)
                val likes = likeStates(viewerId, sorted.map { it[C.id] })
                sorted.map { it to publicDto(it, likes)!! }
            }
            if (final.size > 20 || rows.size < 100) {
                val page = final.take(20)
                return EpisodeLogListResponse(page.map { it.second }, if (final.size > 20) episodeNext(page.last().first, "feed", scope, C.publishedAt, C.id) else null)
            }
            scan = EpisodeCursor(1, "feed", scope, episodeTs(rows.last()[C.publishedAt])!!, rows.last()[C.id].toString())
        }
    }

    /** 신고와 같이 카드 행을 잠근 뒤 eligible을 다시 확인하고 insert/delete 후 집계한다. */
    suspend fun setLike(viewerId: UUID, postId: UUID, liked: Boolean): EpisodeLikeResponse = DatabaseFactory.dbQuery(requireDb()) {
        C.selectAll().where { C.id eq postId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: throw NotFoundException()
        joined.selectAll().where { C.id eq postId }.singleOrNull()?.takeIf(::eligible) ?: throw NotFoundException()
        if (liked) L.insertIgnore { it[cardId] = postId; it[userId] = viewerId }
        else L.deleteWhere { (cardId eq postId) and (userId eq viewerId) }
        EpisodeLikeResponse(liked, L.selectAll().where { L.cardId eq postId }.count().toInt())
    }

    suspend fun report(userId: UUID, postId: UUID, reason: String, detail: String): ReportEpisodeResponse = DatabaseFactory.dbQuery(requireDb()) {
        // Card lock serializes report inserts and moderation. No profile lock is acquired after it.
        C.selectAll().where { C.id eq postId }.forUpdate(ForUpdateOption.ForUpdate).singleOrNull() ?: throw NotFoundException()
        val row = joined.selectAll().where { C.id eq postId }.singleOrNull()?.takeIf(::eligible) ?: throw NotFoundException()
        if (row[C.userId] == userId) throw ApiException(HttpStatusCode.BadRequest, "SELF_REPORT_NOT_ALLOWED", "자기 게시물은 신고할 수 없습니다.")
        if (R.selectAll().where { (R.cardId eq postId) and (R.reporterId eq userId) and (R.status eq "open") }.count() > 0) episodeConflict("ALREADY_REPORTED")
        val id = R.insert { it[cardId] = postId; it[reporterId] = userId; it[R.reason] = reason; it[R.detail] = detail } get R.id
        ReportEpisodeResponse(id.toString())
    }
}
