package ulevelp.service

import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.inList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.notInList
import ulevelp.db.*
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/**
 * 공개본 복사·자동 연동 (개발산출물/결과/M1-1_스키마설계.md §4, M1-4a).
 * 복사하는 것: `video_id`·`a`·`b`·`rate`·순서(원본 분류의 곡 목록 순서 = [SongService.LIST_ORDER]).
 * 제목·아티스트는 복사하지 않는다(N3 — 공개 응답은 `video_titles`를 조인), 메모·상태·pos도 복사하지 않는다
 */
object SharedFolderSync {
    const val KIND_USER = "user"
    const val KIND_CURATED = "curated"           // 운영자 큐레이션 폴더(M1-4b)
    const val KIND_MONTHLY_PICK = "monthly_pick" // 이달의 곡(운영자, 최대 5곡)
    val OPERATOR_KINDS = setOf(KIND_CURATED, KIND_MONTHLY_PICK)

    /**
     * 자동 연동 — 그 사용자의 공개본 중 `auto_sync=true`(= 공개 중)이고 소유자 실제 티어가 유료인 것만,
     * 부르는 쪽 트랜잭션 안에서 다시 맞춘다. [categoryIds]가 null이면 그 사용자의 자동 연동 공개본 전부
     * (곡 쓰기는 어느 분류에 영향이 있는지 계산하지 않고 전부 맞춘다 — 분류는 많아야 10개).
     * 반환: 맞춘 공개본 수
     */
    fun resyncCategories(tx: Transaction, userId: UUID, categoryIds: Collection<UUID>?): Int = with(tx) {
        if (categoryIds != null && categoryIds.isEmpty()) return 0
        val query = SharedFoldersTable.select(SharedFoldersTable.id, SharedFoldersTable.sourceCategoryId)
            .where {
                (SharedFoldersTable.ownerId eq userId) and (SharedFoldersTable.kind eq KIND_USER) and
                    (SharedFoldersTable.autoSync eq true) and (SharedFoldersTable.isPublic eq true)
            }
        if (categoryIds != null) query.andWhere { SharedFoldersTable.sourceCategoryId inList categoryIds }
        val targets = query.map { it[SharedFoldersTable.id] to it[SharedFoldersTable.sourceCategoryId]!! }
        if (targets.isEmpty()) return 0
        if (!TierLimits.isPaid(tierContext(userId).tier)) return 0 // 무료가 된 소유자는 정리(downgradeCleanup)가 끈다 — 그 전에도 복사하지 않는다
        for ((folderId, categoryId) in targets) {
            copyCategory(folderId, userId, categoryId, markPublished = false)
        }
        targets.size
    }

    /**
     * 원본 분류 → 공개본 항목. `video_id` 기준 업서트·빠진 것 삭제·순서 갱신(좋아요는 폴더에 달려 있어 그대로).
     * [markPublished]=true(게시·다시 게시)면 늘 `published_at=now()`, false(자동 연동)면 곡이 들고 나거나
     * 구간·배속이 바뀐 때만(연습 기록으로 순서만 바뀐 때는 "최근" 정렬을 흔들지 않는다). 반환: 항목 수
     */
    fun Transaction.copyCategory(folderId: UUID, userId: UUID, categoryId: UUID, markPublished: Boolean): Int {
        val songs = SongCategoriesTable
            .join(SongsTable, JoinType.INNER, SongCategoriesTable.songId, SongsTable.id)
            .select(SongsTable.videoId, SongsTable.a, SongsTable.b, SongsTable.rate, SongsTable.status, SongsTable.lastDate, SongsTable.updatedAt)
            .where {
                (SongCategoriesTable.categoryId eq categoryId) and (SongCategoriesTable.userId eq userId) and
                    (SongsTable.userId eq userId)
            }
            .toList()
            .sortedWith(SongService.LIST_ORDER)

        val videoIds = songs.map { it[SongsTable.videoId] }
        val removed = if (videoIds.isEmpty()) {
            SharedFolderItemsTable.deleteWhere { SharedFolderItemsTable.folderId eq folderId }
        } else {
            SharedFolderItemsTable.deleteWhere {
                (SharedFolderItemsTable.folderId eq folderId) and (SharedFolderItemsTable.videoId notInList videoIds)
            }
        }
        val existing = SharedFolderItemsTable.selectAll()
            .where { SharedFolderItemsTable.folderId eq folderId }
            .associateBy { it[SharedFolderItemsTable.videoId] }

        var contentChanged = removed > 0
        songs.forEachIndexed { index, song ->
            val videoId = song[SongsTable.videoId]
            val a = song[SongsTable.a]
            val b = song[SongsTable.b]
            val rate = song[SongsTable.rate]
            val old = existing[videoId]
            if (old == null) {
                SharedFolderItemsTable.insert {
                    it[SharedFolderItemsTable.folderId] = folderId
                    it[SharedFolderItemsTable.videoId] = videoId
                    it[position] = index
                    it[SharedFolderItemsTable.a] = a
                    it[SharedFolderItemsTable.b] = b
                    it[SharedFolderItemsTable.rate] = rate
                }
                contentChanged = true
            } else {
                val segmentChanged = !sameDecimal(old[SharedFolderItemsTable.a], a) ||
                    !sameDecimal(old[SharedFolderItemsTable.b], b) ||
                    !sameDecimal(old[SharedFolderItemsTable.rate], rate)
                if (segmentChanged || old[SharedFolderItemsTable.position] != index) {
                    SharedFolderItemsTable.update({
                        (SharedFolderItemsTable.folderId eq folderId) and (SharedFolderItemsTable.videoId eq videoId)
                    }) {
                        it[position] = index
                        it[SharedFolderItemsTable.a] = a
                        it[SharedFolderItemsTable.b] = b
                        it[SharedFolderItemsTable.rate] = rate
                    }
                }
                if (segmentChanged) contentChanged = true
            }
        }

        if (markPublished || contentChanged) {
            SharedFoldersTable.update({ SharedFoldersTable.id eq folderId }) {
                it[publishedAt] = OffsetDateTime.now(ZoneOffset.UTC)
            }
        }
        return songs.size
    }

    private fun sameDecimal(x: BigDecimal?, y: BigDecimal?): Boolean =
        if (x == null || y == null) x == y else x.compareTo(y) == 0
}
