package ulevelp.routes

import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.utils.io.readRemaining
import kotlinx.coroutines.CancellationException
import kotlinx.io.readByteArray
import kotlinx.serialization.json.*
import ulevelp.api.*
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import ulevelp.auth.requireAuthUser
import ulevelp.db.NoteDocsTable
import ulevelp.service.*
import java.util.UUID

private const val JSON_MARGIN_BYTES = 16_384L

private fun ApplicationCall.noStore() = response.headers.append(HttpHeaders.CacheControl, "no-store")

/** `folderId` 칸: 없음 → (false, null), null → (true, null), UUID → (true, id) */
private fun JsonObject.optFolderId(): Pair<Boolean, UUID?> {
    if (!containsKey("folderId")) return false to null
    if (this["folderId"] is JsonNull) return true to null
    return true to requireUuid("folderId")
}

private fun JsonObject.requireTitle(): String {
    val t = requireString("title", NoteDocService.MAX_TITLE)
    if (t.isEmpty()) throw InvalidInputException("title은 빈 문자열일 수 없습니다.")
    return t
}

private fun JsonObject.optBody(): JsonObject? {
    val e = this["body"] ?: return null
    if (e is JsonNull) throw InvalidInputException("body는 객체여야 합니다.")
    val obj = e as? JsonObject ?: throw InvalidInputException("body는 객체여야 합니다.")
    if (obj.toString().toByteArray(Charsets.UTF_8).size > NoteDocService.MAX_BODY_BYTES) {
        throw ApiException(HttpStatusCode.PayloadTooLarge, "NOTE_BODY_TOO_LARGE", "노트 본문은 1MB까지 저장할 수 있습니다.")
    }
    return obj
}

private fun parsePage(raw: String?): Int {
    val page = raw?.toIntOrNull() ?: throw InvalidInputException("page 형식이 올바르지 않습니다.")
    if (page !in 1..NoteDocService.MAX_PAGE) throw InvalidInputException("page는 1~${NoteDocService.MAX_PAGE}이어야 합니다.")
    return page
}

/**
 * NT-1 학습 노트 워크스페이스(명세 §5). 모든 응답 `Cache-Control: no-store`.
 * 없음·남의 것·종류 다름은 404. 커밋 뒤 휴지통 purge는 기존 곡 삭제와 같다
 */
fun Route.registerNoteWorkspaceRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    folderService: NoteFolderService,
    docService: NoteDocService,
    fileService: NoteFileService,
    storageTrashService: StorageTrashService
) {
    route("/note-folders") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get {
            val user = call.requireAuthUser()
            call.noStore()
            call.respond(HttpStatusCode.OK, folderService.list(user.id))
        }

        post {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()
            val name = NoteFolderInput.name(body.requireString("name", 1000))
            val color = NoteFolderInput.color(body.optString("color", 100))
            val folder = folderService.create(user.id, name, color)
            call.noStore()
            call.respond(HttpStatusCode.Created, NoteFolderEnvelope(folder))
        }

        put("/order") {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()
            val arr = body.requireArray("ids", 1000)
            val ids = arr.mapIndexed { i, e ->
                if (e !is JsonPrimitive || !e.isString) throw InvalidInputException("ids[$i] 형식이 올바르지 않습니다.")
                buildJsonObject { put("id", e.content) }.requireUuid("id")
            }
            call.noStore()
            call.respond(HttpStatusCode.OK, folderService.reorder(user.id, ids))
        }

        patch("/{folderId}") {
            val user = call.requireAuthUser()
            val folderId = parsePathUuid(call.parameters["folderId"])
            val body = call.receiveJsonObject()
            val hasName = body.containsKey("name")
            val hasColor = body.containsKey("color")
            if (!hasName && !hasColor) throw InvalidInputException("수정할 항목(name, color 중 하나 이상)이 필요합니다.")
            val name = if (hasName) NoteFolderInput.name(body.requireString("name", 1000)) else null
            val color = if (hasColor) NoteFolderInput.color(body.optString("color", 100)) else null
            val folder = folderService.update(user.id, folderId, name, hasColor, color)
            call.noStore()
            call.respond(HttpStatusCode.OK, NoteFolderEnvelope(folder))
        }

        delete("/{folderId}") {
            val user = call.requireAuthUser()
            val folderId = parsePathUuid(call.parameters["folderId"])
            folderService.delete(user.id, folderId)
            call.noStore()
            call.respond(HttpStatusCode.OK, buildJsonObject { put("ok", true) })
        }
    }

    route("/note-docs") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get {
            val user = call.requireAuthUser()
            val raw = call.request.queryParameters["folder"]
            val filter = when {
                raw == null -> NoteDocFolderFilter.All
                raw == "none" -> NoteDocFolderFilter.None
                else -> NoteDocFolderFilter.Folder(buildJsonObject { put("folder", raw) }.requireUuid("folder"))
            }
            call.noStore()
            call.respond(HttpStatusCode.OK, docService.list(user.id, filter))
        }

        post {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObjectLimited(
                NoteDocService.MAX_BODY_BYTES + JSON_MARGIN_BYTES, "NOTE_BODY_TOO_LARGE", "노트 본문은 1MB까지 저장할 수 있습니다."
            )
            val kind = body.requireString("kind", 20)
            if (kind !in NoteDocService.KINDS) throw InvalidInputException("kind는 'document' 또는 'block'이어야 합니다.")
            val title = body.requireTitle()
            val (_, folderId) = body.optFolderId()
            val docBody = body.optBody()
            if (docBody != null && kind != NoteDocsTable.KIND_BLOCK) throw InvalidInputException("body는 블록 노트에만 넣을 수 있습니다.")
            val doc = docService.create(user.id, kind, title, folderId, docBody)
            call.noStore()
            call.respond(HttpStatusCode.Created, NoteDocEnvelope(doc))
        }

        get("/{docId}") {
            val user = call.requireAuthUser()
            val docId = parsePathUuid(call.parameters["docId"])
            call.noStore()
            call.respond(HttpStatusCode.OK, NoteDocEnvelope(docService.get(user.id, docId)))
        }

        patch("/{docId}") {
            val user = call.requireAuthUser()
            val docId = parsePathUuid(call.parameters["docId"])
            val body = call.receiveJsonObjectLimited(
                NoteDocService.MAX_BODY_BYTES + JSON_MARGIN_BYTES, "NOTE_BODY_TOO_LARGE", "노트 본문은 1MB까지 저장할 수 있습니다."
            )
            if (listOf("title", "folderId", "body").none { body.containsKey(it) }) {
                throw InvalidInputException("수정할 항목(title, folderId, body 중 하나 이상)이 필요합니다.")
            }
            val title = if (body.containsKey("title")) body.requireTitle() else null
            val (setFolder, folderId) = body.optFolderId()
            val docBody = body.optBody()
            val rev = if (body.containsKey("rev")) body.requireInt("rev", 1, Int.MAX_VALUE) else null
            val doc = docService.update(user.id, docId, NoteDocPatch(title, setFolder, folderId, docBody, rev))
            call.noStore()
            call.respond(HttpStatusCode.OK, NoteDocEnvelope(doc))
        }

        delete("/{docId}") {
            val user = call.requireAuthUser()
            val docId = parsePathUuid(call.parameters["docId"])
            val ids = docService.delete(user.id, docId)
            storageTrashService.purge(ids)
            call.noStore()
            call.respond(HttpStatusCode.OK, buildJsonObject { put("ok", true) })
        }

        post("/{docId}/files") {
            val user = call.requireAuthUser()
            val docId = parsePathUuid(call.parameters["docId"])
            val file = if (call.request.isMultipart()) {
                receiveNoteFileUpload(call, user.id, docId, fileService)
            } else if (call.request.contentType().withoutParameters() == ContentType.Application.Json) {
                val body = call.receiveJsonObject()
                if (body.requireString("storage", 50) != NoteFileService.STORAGE_DRIVE) {
                    throw InvalidInputException("storage는 'drive'여야 합니다.")
                }
                val storageKey = body.requireString("storageKey", 200)
                if (!TakeService.DRIVE_FILE_ID_REGEX.matches(storageKey)) throw InvalidInputException("storageKey 형식이 올바르지 않습니다.")
                val fileName = TabFileValidator.sanitizeFileName(body.requireString("fileName", 1000))
                val type = NoteFileType.byMime(body.requireString("mime", 100)) ?: throw NoteFileValidator.invalid("mime은 PDF·PNG·JPEG·WebP만 받습니다.")
                if (NoteFileType.byFileName(fileName) != type) throw NoteFileValidator.invalid("파일 이름 확장자가 mime과 맞지 않습니다.")
                val sizeElem = body["sizeBytes"] as? JsonPrimitive
                val size = sizeElem?.takeIf { !it.isString }?.longOrNull ?: throw InvalidInputException("sizeBytes 형식이 올바르지 않습니다.")
                if (size !in 1..NoteFileValidator.MAX_DRIVE_BYTES) throw InvalidInputException("sizeBytes 범위가 올바르지 않습니다.")
                fileService.registerDrive(user.id, docId, NoteDriveFileInput(storageKey, fileName, type, size))
            } else {
                throw InvalidInputException("multipart/form-data 또는 JSON 요청이어야 합니다.")
            }
            call.noStore()
            call.respond(HttpStatusCode.Created, NoteFileEnvelope(file))
        }
    }

    route("/note-files") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get("/{fileId}/url") {
            val user = call.requireAuthUser()
            val fileId = parsePathUuid(call.parameters["fileId"])
            call.noStore()
            call.respond(HttpStatusCode.OK, fileService.fileUrl(user.id, fileId))
        }

        delete("/{fileId}") {
            val user = call.requireAuthUser()
            val fileId = parsePathUuid(call.parameters["fileId"])
            val ids = fileService.delete(user.id, fileId)
            storageTrashService.purge(ids)
            call.noStore()
            call.respond(HttpStatusCode.OK, buildJsonObject { put("ok", true) })
        }

        get("/{fileId}/annotations") {
            val user = call.requireAuthUser()
            val fileId = parsePathUuid(call.parameters["fileId"])
            call.noStore()
            call.respond(HttpStatusCode.OK, docService.listAnnotations(user.id, fileId))
        }

        put("/{fileId}/annotations/{page}") {
            val user = call.requireAuthUser()
            val fileId = parsePathUuid(call.parameters["fileId"])
            val page = parsePage(call.parameters["page"])
            val body = call.receiveJsonObjectLimited(
                NoteDocService.MAX_ANNOTATION_BYTES + 1024L, "NOTE_ANNOTATION_TOO_LARGE", "주석은 한 쪽에 256KB까지 저장할 수 있습니다."
            )
            val data = body["data"] as? JsonObject ?: throw InvalidInputException("data는 객체여야 합니다.")
            if (data.toString().toByteArray(Charsets.UTF_8).size > NoteDocService.MAX_ANNOTATION_BYTES) {
                throw ApiException(HttpStatusCode.PayloadTooLarge, "NOTE_ANNOTATION_TOO_LARGE", "주석은 한 쪽에 256KB까지 저장할 수 있습니다.")
            }
            val rev = body.requireInt("rev", 0, Int.MAX_VALUE)
            call.noStore()
            call.respond(HttpStatusCode.OK, docService.putAnnotation(user.id, fileId, page, data, rev))
        }

        delete("/{fileId}/annotations/{page}") {
            val user = call.requireAuthUser()
            val fileId = parsePathUuid(call.parameters["fileId"])
            val page = parsePage(call.parameters["page"])
            docService.deleteAnnotation(user.id, fileId, page)
            call.noStore()
            call.respond(HttpStatusCode.OK, buildJsonObject { put("ok", true) })
        }
    }
}

/** multipart 업로드(TB-1 `POST /songs/tab`과 같은 순서, backend-kotlin §6) */
private suspend fun receiveNoteFileUpload(call: ApplicationCall, userId: UUID, docId: UUID, fileService: NoteFileService): NoteFileDto {
    if (!fileService.isStorageConfigured) {
        throw ApiException(HttpStatusCode.ServiceUnavailable, "STORAGE_UNAVAILABLE", "파일 저장소가 설정되어 있지 않습니다.")
    }
    val tooLarge = ApiException(HttpStatusCode.PayloadTooLarge, "NOTE_FILE_TOO_LARGE", "파일은 20MB 이하만 올릴 수 있습니다.")
    val contentLength = call.request.header(HttpHeaders.ContentLength)?.toLongOrNull()
    if (contentLength != null && contentLength > NoteFileValidator.MAX_REQUEST_BYTES) throw tooLarge

    var fileName: String? = null
    var fileBytes: ByteArray? = null
    try {
        val multipart = call.receiveMultipart(formFieldLimit = NoteFileValidator.MAX_REQUEST_BYTES)
        multipart.forEachPart { part ->
            try {
                if (part.name == "file") {
                    val item = part as? PartData.FileItem ?: throw InvalidInputException("file 파트가 필요합니다.")
                    fileName = item.originalFileName
                    fileBytes = item.provider().readRemaining(NoteFileValidator.MAX_FILE_BYTES + 1).readByteArray()
                }
            } finally {
                part.dispose()
            }
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: ApiException) {
        throw e
    } catch (e: Exception) {
        throw InvalidInputException("multipart 본문을 읽지 못했습니다.")
    }

    val bytes = fileBytes ?: throw InvalidInputException("file 파트가 필요합니다.")
    if (bytes.size > NoteFileValidator.MAX_FILE_BYTES) throw tooLarge
    if (bytes.isEmpty()) throw InvalidInputException("파일이 비어 있습니다.")
    val cleanName = TabFileValidator.sanitizeFileName(fileName)
    val type = NoteFileValidator.detect(cleanName, bytes)
    return fileService.upload(userId, docId, cleanName, type, bytes)
}
