package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.*
import ulevelp.service.CategoryService.Companion.insertCategory
import java.net.URI
import java.util.UUID

@Serializable
data class PlaylistPreviewResponse(
    val playlistId: String,
    val title: String,
    val itemCount: Int,
    val remainingSongSlots: Long?,
    val remainingCategorySlots: Long?
)

@Serializable
data class PlaylistImportResponse(
    val categoryId: String,
    val categoryCreated: Boolean,
    val playlistTitle: String,
    val imported: Int,
    val alreadyInLibrary: Int,
    val skippedLimit: Int,
    val skippedUnavailable: Int
)

/** 어느 분류에 넣을지(Q9): 기존 분류 또는 새 분류(이름 null = 재생목록 제목 앞 20자) */
sealed interface PlaylistTarget {
    data class Existing(val categoryId: UUID) : PlaylistTarget
    data class NewCategory(val name: String?) : PlaylistTarget
}

/**
 * 재생목록 가져오기 (개발산출물/결과/M1-1_스키마설계.md §5-3, M1-2b).
 * 모든 티어. 재생목록 순서대로 남은 곡 칸까지 등록하고 나머지는 건너뛴다(A3). 이미 있는 곡은 칸을 쓰지 않고 분류에만 넣는다
 */
class PlaylistImportService(
    private val db: Database?,
    private val playlistClient: PlaylistClient
) {
    private fun requireDb(): Database =
        db ?: throw ApiException(
            status = HttpStatusCode.ServiceUnavailable,
            code = "DB_UNAVAILABLE",
            message = "데이터베이스가 연결되어 있지 않습니다."
        )

    suspend fun preview(userId: UUID, url: String): PlaylistPreviewResponse {
        val database = requireDb()
        val playlistId = parsePlaylistId(url)
        val playlist = playlistClient.fetch(playlistId, maxItems = 0)
        return DatabaseFactory.dbQuery(database) {
            val ctx = tierContext(userId)
            PlaylistPreviewResponse(
                playlistId = playlist.id,
                title = playlist.title,
                itemCount = playlist.itemCount,
                remainingSongSlots = remainingSongSlots(ctx),
                remainingCategorySlots = ctx.limits.categories?.let { (it - categoryCount(userId)).coerceAtLeast(0) }
            )
        }
    }

    suspend fun import(userId: UUID, url: String, target: PlaylistTarget): PlaylistImportResponse {
        val database = requireDb()
        val playlistId = parsePlaylistId(url)
        // 트랜잭션 밖에서 YouTube 호출. 가장 큰 곡 한도(150)보다 넉넉히 가져온다
        val playlist = playlistClient.fetch(playlistId, maxItems = MAX_FETCH_ITEMS)

        return DatabaseFactory.dbQuery(database) {
            // 프로필 잠금: 동시 가져오기·곡 추가가 한도를 넘지 않는다
            val ctx = tierContext(userId, lock = true)

            val (categoryId, created) = when (target) {
                is PlaylistTarget.Existing -> {
                    val own = CategoriesTable.selectAll()
                        .where { (CategoriesTable.userId eq userId) and (CategoriesTable.id eq target.categoryId) }
                        .count() > 0L
                    if (!own) throw NotFoundException("분류를 찾을 수 없습니다.")
                    target.categoryId to false
                }
                is PlaylistTarget.NewCategory -> {
                    // 칸이 없으면 403 CATEGORY_LIMIT_EXCEEDED, 아무것도 등록 안 함(A4)
                    requireCategorySlot(ctx)
                    val name = target.name ?: defaultCategoryName(playlist.title)
                    insertCategory(userId, name) to true
                }
            }

            // 재생목록 안 같은 영상은 처음 것만
            val seen = mutableSetOf<String>()
            val entries = playlist.items.filter { !it.available || seen.add(it.videoId) }
            val availableIds = entries.filter { it.available }.map { it.videoId }
            val existing: Map<String, UUID> = if (availableIds.isEmpty()) emptyMap() else
                SongsTable.select(SongsTable.videoId, SongsTable.id)
                    .where { (SongsTable.userId eq userId) and (SongsTable.videoId inList availableIds) }
                    .associate { it[SongsTable.videoId] to it[SongsTable.id] }

            var remaining = remainingSongSlots(ctx) // null = 제한 없음
            var imported = 0
            var already = 0
            var skippedLimit = 0
            var skippedUnavailable = 0

            for (item in entries) {
                if (!item.available) {
                    skippedUnavailable++
                    continue
                }
                val existingId = existing[item.videoId]
                if (existingId != null) {
                    linkCategory(userId, existingId, categoryId)
                    already++
                    continue
                }
                if (remaining != null && remaining <= 0L) {
                    skippedLimit++
                    continue
                }
                val newId = UUID.randomUUID()
                SongsTable.insert {
                    it[id] = newId
                    it[SongsTable.userId] = userId
                    it[title] = item.title.ifBlank { SongService.UNTITLED }
                    it[artist] = item.channel
                    it[videoId] = item.videoId
                }
                OutboxRepository.enqueueIfSyncEnabled(userId, "song", newId, "upsert")
                linkCategory(userId, newId, categoryId)
                imported++
                if (remaining != null) remaining--
            }
            // 상한(MAX_FETCH_ITEMS) 뒤로 가져오지 않은 항목도 칸 부족으로 건너뜀에 센다
            skippedLimit += (playlist.itemCount - playlist.items.size).coerceAtLeast(0)

            // TODO(stub): M1-4 자동 연동 — SharedFolderSync.resyncCategories(this, userId, listOf(categoryId)) (설계 §4)

            PlaylistImportResponse(
                categoryId = categoryId.toString(),
                categoryCreated = created,
                playlistTitle = playlist.title,
                imported = imported,
                alreadyInLibrary = already,
                skippedLimit = skippedLimit,
                skippedUnavailable = skippedUnavailable
            )
        }
    }

    private fun Transaction.linkCategory(userId: UUID, songId: UUID, categoryId: UUID) {
        SongCategoriesTable.insertIgnore {
            it[SongCategoriesTable.userId] = userId
            it[SongCategoriesTable.songId] = songId
            it[SongCategoriesTable.categoryId] = categoryId
        }
    }

    companion object {
        const val MAX_FETCH_ITEMS = 500
        const val MAX_URL_LENGTH = 2000
        private val PLAYLIST_ID_REGEX = Regex("^[A-Za-z0-9_-]{2,64}$")
        private val YOUTUBE_HOST_REGEX = Regex("^(?:[a-z0-9-]+\\.)*(?:youtube\\.com|youtu\\.be)$")

        /** YouTube URL의 `list` 값. youtube.com·youtu.be(하위 도메인 포함)만, 없거나 형식이 틀리면 400 */
        fun parsePlaylistId(url: String): String {
            val invalid = { InvalidInputException("재생목록 주소(list=…가 있는 YouTube URL)가 필요합니다.") }
            val uri = runCatching { URI(url.trim()) }.getOrNull() ?: throw invalid()
            val scheme = uri.scheme?.lowercase()
            val host = uri.host?.lowercase()
            if ((scheme != "https" && scheme != "http") || host == null || !YOUTUBE_HOST_REGEX.matches(host)) throw invalid()
            val list = uri.rawQuery.orEmpty().split('&')
                .map { it.split('=', limit = 2) }
                .firstOrNull { it.size == 2 && it[0] == "list" }
                ?.get(1)
            if (list == null || !PLAYLIST_ID_REGEX.matches(list)) throw invalid()
            return list
        }

        fun defaultCategoryName(playlistTitle: String): String =
            playlistTitle.trim().take(CategoryService.MAX_NAME_LENGTH).trim().ifEmpty { "재생목록" }
    }
}
