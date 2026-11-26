package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.DatabaseFactory
import ulevelp.db.NoteDocsTable
import ulevelp.db.NoteFoldersTable
import ulevelp.db.NotesTable
import java.time.format.DateTimeFormatter
import java.util.UUID

@Serializable
data class NoteFolderDto(
    val id: String,
    val name: String,
    val color: String?,
    val sortOrder: Int,
    val docCount: Long,
    val aiNoteCount: Long,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class NoteFolderEnvelope(val folder: NoteFolderDto)

@Serializable
data class NoteFolderListResponse(val folders: List<NoteFolderDto>)

/** 노트북이 내 것인지. 없음·남의 것은 404(존재를 드러내지 않는다, 명세 §4 소유권) */
fun Transaction.requireOwnFolder(userId: UUID, folderId: UUID) {
    val mine = NoteFoldersTable.select(NoteFoldersTable.id)
        .where { (NoteFoldersTable.id eq folderId) and (NoteFoldersTable.userId eq userId) }
        .limit(1).any()
    if (!mine) throw NotFoundException("노트북을 찾을 수 없습니다.")
}

/** 입력 값 검사(라우트·서비스 공용) */
object NoteFolderInput {
    const val MAX_NAME = 60
    private val COLOR_REGEX = Regex("^[a-z0-9-]{1,20}$")

    fun name(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || trimmed.codePointCount(0, trimmed.length) > MAX_NAME) {
            throw InvalidInputException("name은 1~${MAX_NAME}자여야 합니다.")
        }
        return trimmed
    }

    fun color(raw: String?): String? {
        if (raw == null) return null
        if (!COLOR_REGEX.matches(raw)) throw InvalidInputException("color 형식이 올바르지 않습니다.")
        return raw
    }
}

/**
 * NT-1 노트북(명세 §5.1). 평면 목록, 무료는 만들 수 없다(N2). 새 경로라 outbox(폐기 기능) 호출은 넣지 않는다
 */
class NoteFolderService(private val db: Database?) {

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    suspend fun list(userId: UUID): NoteFolderListResponse {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) { NoteFolderListResponse(listInTx(userId)) }
    }

    suspend fun create(userId: UUID, name: String, color: String?): NoteFolderDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            // 프로필 잠금 아래 개수 검사(동시 생성 대비)
            requireNoteFolderSlot(tierContext(userId, lock = true))
            val maxExpr = NoteFoldersTable.sortOrder.max()
            val maxOrder = NoteFoldersTable.select(maxExpr)
                .where { NoteFoldersTable.userId eq userId }
                .singleOrNull()?.get(maxExpr)
            val id = UUID.randomUUID()
            NoteFoldersTable.insert {
                it[NoteFoldersTable.id] = id
                it[NoteFoldersTable.userId] = userId
                it[NoteFoldersTable.name] = name
                it[NoteFoldersTable.color] = color
                it[sortOrder] = (maxOrder ?: -1) + 1
            }
            loadOne(userId, id)
        }
    }

    /** [setColor]가 true면 [color](null 포함)로 덮어쓴다 */
    suspend fun update(userId: UUID, folderId: UUID, name: String?, setColor: Boolean, color: String?): NoteFolderDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val updated = NoteFoldersTable.update({ (NoteFoldersTable.id eq folderId) and (NoteFoldersTable.userId eq userId) }) {
                if (name != null) it[NoteFoldersTable.name] = name
                if (setColor) it[NoteFoldersTable.color] = color
            }
            if (updated == 0) throw NotFoundException("노트북을 찾을 수 없습니다.")
            loadOne(userId, folderId)
        }
    }

    /** [ids] = 내 노트북 전부의 새 순서. 개수·중복이 맞지 않으면 400, 남의 id는 404 */
    suspend fun reorder(userId: UUID, ids: List<UUID>): NoteFolderListResponse {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            if (ids.toSet().size != ids.size) throw InvalidInputException("ids에 중복이 있습니다.")
            val mine = NoteFoldersTable.select(NoteFoldersTable.id)
                .where { NoteFoldersTable.userId eq userId }
                .orderBy(NoteFoldersTable.id)
                .forUpdate(ForUpdateOption.ForUpdate)
                .map { it[NoteFoldersTable.id] }
                .toSet()
            if (ids.any { it !in mine }) throw NotFoundException("노트북을 찾을 수 없습니다.")
            if (ids.size != mine.size) throw InvalidInputException("ids에는 내 노트북을 모두 넣어야 합니다.")
            ids.forEachIndexed { index, id ->
                NoteFoldersTable.update({ (NoteFoldersTable.id eq id) and (NoteFoldersTable.userId eq userId) }) {
                    it[sortOrder] = index
                }
            }
            NoteFolderListResponse(listInTx(userId))
        }
    }

    /** 안의 노트·AI 노트는 FK `ON DELETE SET NULL`로 기본 노트북이 된다 */
    suspend fun delete(userId: UUID, folderId: UUID) {
        val database = requireDb()
        DatabaseFactory.dbQuery(database) {
            val deleted = NoteFoldersTable.deleteWhere { (NoteFoldersTable.id eq folderId) and (NoteFoldersTable.userId eq userId) }
            if (deleted == 0) throw NotFoundException("노트북을 찾을 수 없습니다.")
        }
    }

    private fun Transaction.listInTx(userId: UUID): List<NoteFolderDto> {
        val rows = NoteFoldersTable.selectAll()
            .where { NoteFoldersTable.userId eq userId }
            .orderBy(NoteFoldersTable.sortOrder to SortOrder.ASC, NoteFoldersTable.createdAt to SortOrder.ASC, NoteFoldersTable.id to SortOrder.ASC)
            .toList()
        val docCounts = countBy(NoteDocsTable, NoteDocsTable.userId, NoteDocsTable.folderId, userId)
        val aiCounts = countBy(NotesTable, NotesTable.userId, NotesTable.folderId, userId)
        return rows.map { toDto(it, docCounts[it[NoteFoldersTable.id]] ?: 0L, aiCounts[it[NoteFoldersTable.id]] ?: 0L) }
    }

    private fun Transaction.countBy(table: Table, userCol: Column<UUID>, folderCol: Column<UUID?>, userId: UUID): Map<UUID, Long> {
        val countExpr = folderCol.count()
        return table.select(folderCol, countExpr)
            .where { (userCol eq userId) and folderCol.isNotNull() }
            .groupBy(folderCol)
            .associate { it[folderCol]!! to it[countExpr] }
    }

    private fun Transaction.loadOne(userId: UUID, folderId: UUID): NoteFolderDto =
        listInTx(userId).singleOrNull { it.id == folderId.toString() }
            ?: throw NotFoundException("노트북을 찾을 수 없습니다.")

    private fun toDto(row: ResultRow, docCount: Long, aiNoteCount: Long) = NoteFolderDto(
        id = row[NoteFoldersTable.id].toString(),
        name = row[NoteFoldersTable.name],
        color = row[NoteFoldersTable.color],
        sortOrder = row[NoteFoldersTable.sortOrder],
        docCount = docCount,
        aiNoteCount = aiNoteCount,
        createdAt = DateTimeFormatter.ISO_INSTANT.format(row[NoteFoldersTable.createdAt].toInstant()),
        updatedAt = DateTimeFormatter.ISO_INSTANT.format(row[NoteFoldersTable.updatedAt].toInstant())
    )
}
