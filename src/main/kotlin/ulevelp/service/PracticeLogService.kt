package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNotNull
import ulevelp.api.ApiException
import ulevelp.db.*
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.TemporalAdjusters
import java.util.UUID

@Serializable
data class PracticeDayDto(val date: String, val seconds: Int)

/** 오늘 연습한 곡. 제목·아티스트 = YouTube 값(`video_titles`, E6) — 사용자 곡 제목은 쓰지 않는다. 못 받았으면 null */
@Serializable
data class PracticeTodaySongDto(val videoId: String, val title: String?, val artist: String?, val seconds: Int, val loops: Int)

/**
 * 한 사람의 학습 기록 카드(M1-4b E6). `days` = 최근 12주(84일) 중 연습한 날만(날짜 오름차순),
 * `streakDays` = 오늘(오늘 아직 안 했으면 어제)까지 이어진 연습 일수(최대 84), `thisWeekSeconds` = 이번 주(월요일 시작) 합계.
 * 날짜는 KST
 */
@Serializable
data class PracticeLogDto(
    val user: PublicOwnerDto,
    val days: List<PracticeDayDto>,
    val streakDays: Int,
    val thisWeekSeconds: Int,
    val today: List<PracticeTodaySongDto>
)

@Serializable
data class PracticeLogListResponse(val logs: List<PracticeLogDto>, val next: String?)

/**
 * 학습 기록 공유 (`개발산출물/결과/M1-1_스키마설계.md` §5-5, M1-4b). 별도 테이블 없이 동의자의 `sessions`를 집계한다.
 * 공개 대상 = `share_practice_log` 동의 + 커뮤니티 이름 있음 + 실제 티어 유료. 열람은 무료도 된다(Q10).
 * 읽는 것: `sessions`의 날짜·초·반복 수, `songs.video_id`, `video_titles`, `profiles` 공개 열.
 * `sessions.memo`·`songs.title`·`songs.memo`는 읽지 않는다
 */
class PracticeLogService(
    private val db: Database?,
    private val communityService: CommunityService
) {
    companion object {
        const val WINDOW_DAYS = 84L     // 12주
        const val PAGE_SIZE = 20
        const val MAX_TODAY_SONGS = 10
        val SCOPES = setOf("following", "all")
        val KST: ZoneId = ZoneId.of("Asia/Seoul")
    }

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    /** 한 사람의 집계(오늘 곡 제외) */
    private data class Summary(val userId: UUID, val days: List<PracticeDayDto>, val streak: Int, val week: Int)

    /** 공개 대상인 사람 → 공개 열. [only]가 있으면 그 안에서만 */
    private fun Transaction.eligibleUsers(only: Collection<UUID>?): Map<UUID, PublicOwnerDto> {
        if (only != null && only.isEmpty()) return emptyMap()
        val query = ProfilesTable.selectAll()
            .where { (ProfilesTable.sharePracticeLog eq true) and ProfilesTable.publicName.isNotNull() }
        if (only != null) query.andWhere { ProfilesTable.id inList only.distinct() }
        return query
            .filter { TierLimits.isPaid(effectiveTier(it)) }
            .associate {
                it[ProfilesTable.id] to PublicOwnerDto(
                    id = it[ProfilesTable.id].toString(),
                    publicName = it[ProfilesTable.publicName],
                    isCreator = it[ProfilesTable.isCreator],
                    creatorBadge = it[ProfilesTable.creatorBadge]
                )
            }
    }

    /** 사람마다 최근 84일 날짜별 합계 → 집계. 그 기간에 연습이 없는 사람은 빠진다 */
    private fun Transaction.summaries(userIds: Collection<UUID>, today: LocalDate): List<Summary> {
        if (userIds.isEmpty()) return emptyList()
        val from = today.minusDays(WINDOW_DAYS - 1)
        val weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val secondsExpr = SessionsTable.seconds.sum()
        val perUser = SessionsTable
            .select(SessionsTable.userId, SessionsTable.date, secondsExpr)
            .where {
                (SessionsTable.userId inList userIds.distinct()) and
                    (SessionsTable.date greaterEq from) and (SessionsTable.date lessEq today)
            }
            .groupBy(SessionsTable.userId, SessionsTable.date)
            .mapNotNull { row ->
                val sec = row[secondsExpr] ?: 0
                if (sec > 0) Triple(row[SessionsTable.userId], row[SessionsTable.date], sec) else null
            }
            .groupBy({ it.first }) { it.second to it.third }

        return perUser.map { (userId, list) ->
            val byDate = list.toMap()
            var cursor = if (today in byDate) today else today.minusDays(1)
            var streak = 0
            while (streak < WINDOW_DAYS && cursor in byDate) {
                streak++
                cursor = cursor.minusDays(1)
            }
            Summary(
                userId = userId,
                days = list.sortedBy { it.first }.map { PracticeDayDto(it.first.toString(), it.second) },
                streak = streak,
                week = list.filter { !it.first.isBefore(weekStart) }.sumOf { it.second }
            )
        }
    }

    /** 오늘(KST) 연습한 곡 — 초 많은 순. 사용자 곡 제목 대신 video_id만 읽는다 */
    private fun Transaction.todayVideos(userIds: Collection<UUID>, today: LocalDate): Map<UUID, List<Triple<String, Int, Int>>> {
        if (userIds.isEmpty()) return emptyMap()
        return SessionsTable
            .join(SongsTable, JoinType.INNER, SessionsTable.songId, SongsTable.id)
            .select(SessionsTable.userId, SongsTable.videoId, SessionsTable.seconds, SessionsTable.loops)
            .where {
                (SessionsTable.userId inList userIds.distinct()) and (SessionsTable.date eq today) and
                    ((SessionsTable.seconds greater 0) or (SessionsTable.loops greater 0))
            }
            .orderBy(SessionsTable.seconds to SortOrder.DESC, SongsTable.videoId to SortOrder.ASC)
            .groupBy({ it[SessionsTable.userId] }) {
                Triple(it[SongsTable.videoId], it[SessionsTable.seconds], it[SessionsTable.loops])
            }
            .mapValues { it.value.take(MAX_TODAY_SONGS) }
    }

    private class Page(
        val users: Map<UUID, PublicOwnerDto>,
        val summaries: List<Summary>,
        val today: Map<UUID, List<Triple<String, Int, Int>>>,
        val next: String?
    )

    /** 집계 결과 + 오늘 곡의 YouTube 제목(트랜잭션 밖에서 없는 것만 받아 둔 뒤 읽는다) */
    private suspend fun render(page: Page): List<PracticeLogDto> {
        val videoIds = page.today.values.flatten().map { it.first }.distinct()
        communityService.fillTitles(videoIds)
        val titles = if (videoIds.isEmpty()) emptyMap() else DatabaseFactory.dbQuery(requireDb()) {
            VideoTitlesTable.selectAll()
                .where { VideoTitlesTable.videoId inList videoIds }
                .associate { it[VideoTitlesTable.videoId] to (it[VideoTitlesTable.title] to it[VideoTitlesTable.author]) }
        }
        return page.summaries.map { s ->
            PracticeLogDto(
                user = page.users.getValue(s.userId),
                days = s.days,
                streakDays = s.streak,
                thisWeekSeconds = s.week,
                today = page.today[s.userId].orEmpty().map { (videoId, sec, loops) ->
                    PracticeTodaySongDto(videoId, titles[videoId]?.first, titles[videoId]?.second, sec, loops)
                }
            )
        }
    }

    /**
     * `GET /community/logs?scope=following|all&cursor=` — 이번 주 합계가 많은 순(→ 연속 일수 → id), 20명씩.
     * `following` = 내가 팔로우한 사람 중 공개 대상만
     */
    suspend fun list(viewerId: UUID, scope: String, cursor: Int, now: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)): PracticeLogListResponse {
        val today = now.atZoneSameInstant(KST).toLocalDate()
        val page = DatabaseFactory.dbQuery(requireDb()) {
            val only = if (scope == "following") {
                FollowsTable.select(FollowsTable.followeeId)
                    .where { FollowsTable.followerId eq viewerId }
                    .map { it[FollowsTable.followeeId] }
            } else {
                null
            }
            val users = eligibleUsers(only)
            val sorted = summaries(users.keys, today)
                .sortedWith(compareByDescending<Summary> { it.week }.thenByDescending { it.streak }.thenBy { it.userId.toString() })
            val slice = sorted.drop(cursor).take(PAGE_SIZE)
            Page(
                users = users,
                summaries = slice,
                today = todayVideos(slice.map { it.userId }, today),
                next = if (sorted.size > cursor + PAGE_SIZE) (cursor + PAGE_SIZE).toString() else null
            )
        }
        return PracticeLogListResponse(render(page), page.next)
    }

    /** 사용자 페이지의 `practiceLog` — 공개 대상이 아니거나 12주 안 연습이 없으면 null */
    suspend fun forUser(targetId: UUID, now: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)): PracticeLogDto? {
        val today = now.atZoneSameInstant(KST).toLocalDate()
        val page = DatabaseFactory.dbQuery(requireDb()) {
            val users = eligibleUsers(listOf(targetId))
            val summaries = summaries(users.keys, today)
            Page(users, summaries, todayVideos(summaries.map { it.userId }, today), null)
        }
        return render(page).singleOrNull()
    }
}
