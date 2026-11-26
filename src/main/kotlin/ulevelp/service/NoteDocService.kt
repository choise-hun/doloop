package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.plus
import org.jetbrains.exposed.sql.vendors.ForUpdateOption
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.DatabaseFactory
import ulevelp.db.NoteAnnotationsTable
import ulevelp.db.NoteDocsTable
import ulevelp.db.NoteFilesTable
import ulevelp.db.StorageTrashTable
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

@Serializable
data class NoteFileDto(
    val id: String,
    val docId: String,
    val storage: String,
    val fileName: String,
    val mime: String,
    val sizeBytes: Long,
    val sortOrder: Int,
    val createdAt: String
)

@Serializable
data class NoteFileBrief(val id: String, val mime: String)

@Serializable
data class NoteDocSummaryDto(
    val id: String,
    val kind: String,
    val title: String,
    val folderId: String?,
    val rev: Int,
    val fileCount: Int,
    val firstFile: NoteFileBrief?,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class NoteDocDetailDto(
    val id: String,
    val kind: String,
    val title: String,
    val folderId: String?,
    val rev: Int,
    val fileCount: Int,
    val firstFile: NoteFileBrief?,
    val createdAt: String,
    val updatedAt: String,
    val body: JsonObject,
    val files: List<NoteFileDto>
)

@Serializable
data class NoteDocEnvelope(val doc: NoteDocDetailDto)

@Serializable
data class NoteDocListResponse(val docs: List<NoteDocSummaryDto>)

@Serializable
data class NoteAnnotationDto(val page: Int, val data: JsonObject, val rev: Int, val updatedAt: String)

@Serializable
data class NoteAnnotationListResponse(val pages: List<NoteAnnotationDto>)

/** `GET /note-docs?folder=` 해석 결과 */
sealed interface NoteDocFolderFilter {
    data object All : NoteDocFolderFilter
    data object None : NoteDocFolderFilter
    data class Folder(val id: UUID) : NoteDocFolderFilter
}

/** PATCH 입력. [setFolder]가 true면 [folderId](null = 기본 노트북)로 바꾼다 */
data class NoteDocPatch(
    val title: String? = null,
    val setFolder: Boolean = false,
    val folderId: UUID? = null,
    val body: JsonObject? = null,
    val rev: Int? = null
)

internal fun iso(t: OffsetDateTime): String = DateTimeFormatter.ISO_INSTANT.format(t.toInstant())

internal fun rowToNoteFileDto(row: ResultRow) = NoteFileDto(
    id = row[NoteFilesTable.id].toString(),
    docId = row[NoteFilesTable.docId].toString(),
    storage = row[NoteFilesTable.storage],
    fileName = row[NoteFilesTable.fileName],
    mime = row[NoteFilesTable.mime],
    sizeBytes = row[NoteFilesTable.sizeBytes],
    sortOrder = row[NoteFilesTable.sortOrder],
    createdAt = iso(row[NoteFilesTable.createdAt])
)

internal fun noteRevConflict(current: Int): ApiException = ApiException(
    HttpStatusCode.Conflict,
    "NOTE_REV_CONFLICT",
    "다른 기기에서 먼저 저장했습니다. 새로 불러온 뒤 다시 저장해 주세요.",
    detail = buildJsonObject { put("rev", current) }
)

/**
 * NT-1 자료·블록 노트와 페이지 주석(명세 §5.2·§5.5). 본문·주석은 `rev` 검사(N9)로 덮어쓰기를 막는다.
 * 새 경로라 outbox(폐기 기능) 호출은 넣지 않는다
 */
class NoteDocService(private val db: Database?) {

    private fun requireDb(): Database =
        db ?: throw ApiException(HttpStatusCode.ServiceUnavailable, "DB_UNAVAILABLE", "데이터베이스가 연결되어 있지 않습니다.")

    // ---------------------------------------------------------------- 노트

    suspend fun list(userId: UUID, filter: NoteDocFolderFilter): NoteDocListResponse {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val rows = NoteDocsTable.select(NoteDocsTable.columns - NoteDocsTable.body)
                .where {
                    val mine = NoteDocsTable.userId eq userId
                    when (filter) {
                        NoteDocFolderFilter.All -> mine
                        NoteDocFolderFilter.None -> mine and NoteDocsTable.folderId.isNull()
                        is NoteDocFolderFilter.Folder -> mine and (NoteDocsTable.folderId eq filter.id)
                    }
                }
                .orderBy(NoteDocsTable.updatedAt to SortOrder.DESC, NoteDocsTable.id to SortOrder.DESC)
                .toList()
            val files = filesByDoc(userId, rows.map { it[NoteDocsTable.id] })
            NoteDocListResponse(rows.map { toSummary(it, files[it[NoteDocsTable.id]].orEmpty()) })
        }
    }

    suspend fun create(userId: UUID, kind: String, title: String, folderId: UUID?, body: JsonObject?): NoteDocDetailDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val ctx = tierContext(userId, lock = true)
            if (kind == NoteDocsTable.KIND_DOCUMENT) requireNoteFiles(ctx)
            requireNoteDocSlot(ctx)
            if (folderId != null) requireOwnFolder(userId, folderId)
            val id = UUID.randomUUID()
            NoteDocsTable.insert {
                it[NoteDocsTable.id] = id
                it[NoteDocsTable.userId] = userId
                it[NoteDocsTable.folderId] = folderId
                it[NoteDocsTable.kind] = kind
                it[NoteDocsTable.title] = title
                if (body != null) it[NoteDocsTable.body] = body
            }
            loadDetail(userId, id)
        }
    }

    suspend fun get(userId: UUID, docId: UUID): NoteDocDetailDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) { loadDetail(userId, docId) }
    }

    suspend fun update(userId: UUID, docId: UUID, patch: NoteDocPatch): NoteDocDetailDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val row = NoteDocsTable.select(NoteDocsTable.kind, NoteDocsTable.rev)
                .where { (NoteDocsTable.id eq docId) and (NoteDocsTable.userId eq userId) }
                .singleOrNull() ?: throw NotFoundException("노트를 찾을 수 없습니다.")
            if (patch.setFolder && patch.folderId != null) requireOwnFolder(userId, patch.folderId)

            if (patch.body != null) {
                if (row[NoteDocsTable.kind] != NoteDocsTable.KIND_BLOCK) {
                    throw InvalidInputException("body는 블록 노트에서만 바꿀 수 있습니다.")
                }
                val expected = patch.rev ?: throw InvalidInputException("body를 바꾸려면 rev가 필요합니다.")
                // 같은 문장에서 rev를 비교·증가한다. 동시 저장이면 한쪽만 영향 행 1
                val updated = NoteDocsTable.update({
                    (NoteDocsTable.id eq docId) and (NoteDocsTable.userId eq userId) and (NoteDocsTable.rev eq expected)
                }) {
                    it[NoteDocsTable.body] = patch.body
                    it[NoteDocsTable.rev] = NoteDocsTable.rev + 1
                    if (patch.title != null) it[NoteDocsTable.title] = patch.title
                    if (patch.setFolder) it[NoteDocsTable.folderId] = patch.folderId
                }
                if (updated == 0) {
                    val current = NoteDocsTable.select(NoteDocsTable.rev)
                        .where { (NoteDocsTable.id eq docId) and (NoteDocsTable.userId eq userId) }
                        .singleOrNull()?.get(NoteDocsTable.rev) ?: throw NotFoundException("노트를 찾을 수 없습니다.")
                    throw noteRevConflict(current)
                }
            } else {
                NoteDocsTable.update({ (NoteDocsTable.id eq docId) and (NoteDocsTable.userId eq userId) }) {
                    if (patch.title != null) it[NoteDocsTable.title] = patch.title
                    if (patch.setFolder) it[NoteDocsTable.folderId] = patch.folderId
                }
            }
            loadDetail(userId, docId)
        }
    }

    /**
     * 프로필 잠금 → 소유 확인 → 그 노트의 Supabase 첨부를 잠가 휴지통에 넣고 노트 삭제(파일·주석 CASCADE).
     * 반환값 = 커밋 뒤 라우트가 `purge`할 휴지통 id(명세 §7, backend-kotlin §4)
     */
    suspend fun delete(userId: UUID, docId: UUID): List<Long> {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            tierContext(userId, lock = true)
            val exists = NoteDocsTable.select(NoteDocsTable.id)
                .where { (NoteDocsTable.id eq docId) and (NoteDocsTable.userId eq userId) }
                .forUpdate(ForUpdateOption.ForUpdate)
                .any()
            if (!exists) throw NotFoundException("노트를 찾을 수 없습니다.")
            val keys = NoteFilesTable.select(NoteFilesTable.storageKey)
                .where {
                    (NoteFilesTable.docId eq docId) and (NoteFilesTable.userId eq userId) and (NoteFilesTable.storage eq "supabase")
                }
                .orderBy(NoteFilesTable.id)
                .forUpdate(ForUpdateOption.ForUpdate)
                .map { it[NoteFilesTable.storageKey] }
            val trashIds = keys.map { key -> StorageTrashTable.insert { it[storageKey] = key } get StorageTrashTable.id }
            NoteDocsTable.deleteWhere { (NoteDocsTable.id eq docId) and (NoteDocsTable.userId eq userId) }
            trashIds
        }
    }

    // ---------------------------------------------------------------- 주석

    suspend fun listAnnotations(userId: UUID, fileId: UUID): NoteAnnotationListResponse {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            requireOwnFile(userId, fileId)
            val rows = NoteAnnotationsTable.selectAll()
                .where { (NoteAnnotationsTable.fileId eq fileId) and (NoteAnnotationsTable.userId eq userId) }
                .orderBy(NoteAnnotationsTable.page to SortOrder.ASC)
                .map { toAnnotation(it) }
            NoteAnnotationListResponse(rows)
        }
    }

    /** [rev] 0 = 새 쪽. 이미 있으면 409. 그 밖은 저장된 rev와 같아야 한다(N9) */
    suspend fun putAnnotation(userId: UUID, fileId: UUID, page: Int, data: JsonObject, rev: Int): NoteAnnotationDto {
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            requireOwnFile(userId, fileId)
            if (rev == 0) {
                val inserted = NoteAnnotationsTable.insertIgnore {
                    it[NoteAnnotationsTable.fileId] = fileId
                    it[NoteAnnotationsTable.userId] = userId
                    it[NoteAnnotationsTable.page] = page
                    it[NoteAnnotationsTable.data] = data
                }.insertedCount
                if (inserted == 0) throw noteRevConflict(currentAnnotationRev(userId, fileId, page))
            } else {
                val updated = NoteAnnotationsTable.update({
                    (NoteAnnotationsTable.fileId eq fileId) and (NoteAnnotationsTable.userId eq userId) and
                        (NoteAnnotationsTable.page eq page) and (NoteAnnotationsTable.rev eq rev)
                }) {
                    it[NoteAnnotationsTable.data] = data
                    it[NoteAnnotationsTable.rev] = NoteAnnotationsTable.rev + 1
                }
                if (updated == 0) throw noteRevConflict(currentAnnotationRev(userId, fileId, page))
            }
            val row = NoteAnnotationsTable.selectAll()
                .where { (NoteAnnotationsTable.fileId eq fileId) and (NoteAnnotationsTable.page eq page) }
                .single()
            toAnnotation(row)
        }
    }

    suspend fun deleteAnnotation(userId: UUID, fileId: UUID, page: Int) {
        val database = requireDb()
        DatabaseFactory.dbQuery(database) {
            requireOwnFile(userId, fileId)
            NoteAnnotationsTable.deleteWhere {
                (NoteAnnotationsTable.fileId eq fileId) and (NoteAnnotationsTable.userId eq userId) and (NoteAnnotationsTable.page eq page)
            }
        }
    }

    // ---------------------------------------------------------------- 내부

    private fun Transaction.requireOwnFile(userId: UUID, fileId: UUID) {
        val mine = NoteFilesTable.select(NoteFilesTable.id)
            .where { (NoteFilesTable.id eq fileId) and (NoteFilesTable.userId eq userId) }
            .limit(1).any()
        if (!mine) throw NotFoundException("파일을 찾을 수 없습니다.")
    }

    /** 쪽이 없으면 0(새 쪽으로 다시 보내라는 뜻) */
    private fun Transaction.currentAnnotationRev(userId: UUID, fileId: UUID, page: Int): Int =
        NoteAnnotationsTable.select(NoteAnnotationsTable.rev)
            .where {
                (NoteAnnotationsTable.fileId eq fileId) and (NoteAnnotationsTable.userId eq userId) and (NoteAnnotationsTable.page eq page)
            }
            .singleOrNull()?.get(NoteAnnotationsTable.rev) ?: 0

    private fun Transaction.filesByDoc(userId: UUID, docIds: List<UUID>): Map<UUID, List<ResultRow>> {
        if (docIds.isEmpty()) return emptyMap()
        return NoteFilesTable.selectAll()
            .where { (NoteFilesTable.userId eq userId) and (NoteFilesTable.docId inList docIds) }
            .orderBy(NoteFilesTable.sortOrder to SortOrder.ASC, NoteFilesTable.createdAt to SortOrder.ASC, NoteFilesTable.id to SortOrder.ASC)
            .groupBy { it[NoteFilesTable.docId] }
    }

    private fun Transaction.loadDetail(userId: UUID, docId: UUID): NoteDocDetailDto {
        val row = NoteDocsTable.selectAll()
            .where { (NoteDocsTable.id eq docId) and (NoteDocsTable.userId eq userId) }
            .singleOrNull() ?: throw NotFoundException("노트를 찾을 수 없습니다.")
        val files = filesByDoc(userId, listOf(docId))[docId].orEmpty()
        val s = toSummary(row, files)
        return NoteDocDetailDto(
            id = s.id, kind = s.kind, title = s.title, folderId = s.folderId, rev = s.rev,
            fileCount = s.fileCount, firstFile = s.firstFile, createdAt = s.createdAt, updatedAt = s.updatedAt,
            body = row[NoteDocsTable.body] as? JsonObject ?: JsonObject(emptyMap()),
            files = files.map { rowToNoteFileDto(it) }
        )
    }

    private fun toSummary(row: ResultRow, files: List<ResultRow>) = NoteDocSummaryDto(
        id = row[NoteDocsTable.id].toString(),
        kind = row[NoteDocsTable.kind],
        title = row[NoteDocsTable.title],
        folderId = row[NoteDocsTable.folderId]?.toString(),
        rev = row[NoteDocsTable.rev],
        fileCount = files.size,
        firstFile = files.firstOrNull()?.let { NoteFileBrief(it[NoteFilesTable.id].toString(), it[NoteFilesTable.mime]) },
        createdAt = iso(row[NoteDocsTable.createdAt]),
        updatedAt = iso(row[NoteDocsTable.updatedAt])
    )

    private fun toAnnotation(row: ResultRow) = NoteAnnotationDto(
        page = row[NoteAnnotationsTable.page],
        data = row[NoteAnnotationsTable.data] as? JsonObject ?: JsonObject(emptyMap()),
        rev = row[NoteAnnotationsTable.rev],
        updatedAt = iso(row[NoteAnnotationsTable.updatedAt])
    )

    companion object {
        const val MAX_TITLE = 300
        /** 블록 본문 상한(UTF-8 바이트, 명세 §5.2) */
        const val MAX_BODY_BYTES = 1_048_576L
        /** 주석 쪽당 상한(명세 §5.5) */
        const val MAX_ANNOTATION_BYTES = 262_144L
        const val MAX_PAGE = 2000
        val KINDS = setOf(NoteDocsTable.KIND_DOCUMENT, NoteDocsTable.KIND_BLOCK)
    }
}
