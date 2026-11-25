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
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ulevelp.api.*
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import ulevelp.auth.requireAuthUser
import ulevelp.service.*
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID

fun Route.registerSongRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    songService: SongService,
    storageTrashService: StorageTrashService,
    playlistImportService: PlaylistImportService,
    tabSongService: TabSongService
) {
    route("/songs") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get {
            val user = call.requireAuthUser()
            val rawStatus = call.request.queryParameters["status"]
            val statusCode = if (!rawStatus.isNullOrEmpty()) {
                SongService.normalizeStatus(rawStatus)
                    ?: throw InvalidInputException("status 값이 올바르지 않습니다.")
            } else null

            val list = songService.list(user.id, statusCode, call.includeTabParam())
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, SongListResponse(songs = list))
        }

        post {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()

            val rawVideoId = body["videoId"] ?: throw InvalidInputException("videoId 값이 필요합니다.")
            if (rawVideoId is JsonNull) {
                throw InvalidInputException("videoId 값이 필요합니다.")
            }
            if (rawVideoId !is JsonPrimitive || !rawVideoId.isString || !SongService.VIDEO_ID_REGEX.matches(rawVideoId.content)) {
                throw InvalidInputException("videoId 형식이 올바르지 않습니다.")
            }
            val videoId = rawVideoId.content

            val title = body.optString("title", 300) ?: ""
            val artist = body.optString("artist", 200) ?: ""
            val rateDbl = body.optDouble("rate", 0.25, 2.0) ?: 1.00
            val rate = BigDecimal.valueOf(rateDbl).setScale(2, RoundingMode.HALF_UP)
            // 선택 입력 a·b(M1-1 A6 — 공개 폴더 곡 1개 담기). 새 곡일 때만 쓰인다
            val a = body.optDouble("a", 0.0, 86400.0)?.let { BigDecimal.valueOf(it).setScale(1, RoundingMode.HALF_UP) }
            val b = body.optDouble("b", 0.0, 86400.0)?.let { BigDecimal.valueOf(it).setScale(1, RoundingMode.HALF_UP) }
            if (a != null && b != null && a >= b) {
                throw InvalidInputException("a는 b보다 작아야 합니다.")
            }

            val result = songService.create(user.id, CreateSongInput(videoId, title, artist, rate, a, b))
            val status = if (result.created) HttpStatusCode.Created else HttpStatusCode.OK

            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(status, SongEnvelope(song = result.song))
        }

        // TB-1: TAB 파일 업로드로 곡 만들기(명세 §5). 리터럴 경로라 /{songId} 계열과 겹치지 않는다
        post("/tab") {
            val user = call.requireAuthUser()
            if (!tabSongService.isStorageConfigured) {
                throw ApiException(HttpStatusCode.ServiceUnavailable, "STORAGE_UNAVAILABLE", "파일 저장소가 설정되어 있지 않습니다.")
            }
            val tooLarge = ApiException(HttpStatusCode.PayloadTooLarge, "TAB_TOO_LARGE", "악보 파일은 10MB 이하만 올릴 수 있습니다.")
            val contentLength = call.request.header(HttpHeaders.ContentLength)?.toLongOrNull()
            if (contentLength != null && contentLength > TabFileValidator.MAX_REQUEST_BYTES) throw tooLarge
            if (!call.request.isMultipart()) throw InvalidInputException("multipart/form-data 요청이어야 합니다.")

            var fileName: String? = null
            var fileBytes: ByteArray? = null
            var title: String? = null
            var artist: String? = null
            suspend fun PartData.readText(): String = when (this) {
                is PartData.FormItem -> value.also {
                    if (it.toByteArray(Charsets.UTF_8).size > TabFileValidator.MAX_TEXT_PART_BYTES) throw InvalidInputException("$name 값이 너무 깁니다.")
                }
                is PartData.FileItem -> {
                    val b = provider().readRemaining(TabFileValidator.MAX_TEXT_PART_BYTES + 1).readByteArray()
                    if (b.size > TabFileValidator.MAX_TEXT_PART_BYTES) throw InvalidInputException("$name 값이 너무 깁니다.")
                    b.toString(Charsets.UTF_8)
                }
                else -> throw InvalidInputException("$name 형식이 올바르지 않습니다.")
            }
            try {
                val multipart = call.receiveMultipart(formFieldLimit = TabFileValidator.MAX_REQUEST_BYTES)
                multipart.forEachPart { part ->
                    try {
                        when (part.name) {
                            "file" -> {
                                val item = part as? PartData.FileItem ?: throw InvalidInputException("file 파트가 필요합니다.")
                                fileName = item.originalFileName
                                fileBytes = item.provider().readRemaining(TabFileValidator.MAX_FILE_BYTES + 1).readByteArray()
                            }
                            "title" -> title = part.readText()
                            "artist" -> artist = part.readText()
                            else -> {}
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
            if (bytes.size > TabFileValidator.MAX_FILE_BYTES) throw tooLarge
            if (bytes.isEmpty()) throw InvalidInputException("악보 파일이 비어 있습니다.")
            val cleanName = TabFileValidator.sanitizeFileName(fileName)
            val format = TabFileValidator.detect(cleanName, bytes)

            val cleanTitle = title?.trim().orEmpty()
            if (cleanTitle.codePointCount(0, cleanTitle.length) > TabSongService.MAX_TITLE) throw InvalidInputException("title은 300자 이하여야 합니다.")
            val cleanArtist = artist?.trim().orEmpty()
            if (cleanArtist.codePointCount(0, cleanArtist.length) > TabSongService.MAX_ARTIST) throw InvalidInputException("artist는 200자 이하여야 합니다.")
            val finalTitle = cleanTitle.ifEmpty { TabFileValidator.baseName(cleanName).take(TabSongService.MAX_TITLE) }.ifEmpty { SongService.UNTITLED }

            val song = tabSongService.create(user.id, TabUploadInput(cleanName, format, bytes, finalTitle, cleanArtist))
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.Created, SongEnvelope(song = song))
        }

        // TB-1: 본인 TAB 곡 파일의 서명 주소(명세 §6)
        get("/{songId}/tab-file") {
            val user = call.requireAuthUser()
            val songId = parsePathUuid(call.parameters["songId"])
            val res = tabSongService.fileUrl(user.id, songId)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }

        get("/by-video/{videoId}") {
            val user = call.requireAuthUser()
            val videoId = call.parameters["videoId"]
            if (videoId == null || !SongService.VIDEO_ID_REGEX.matches(videoId)) {
                throw InvalidInputException("videoId 형식이 올바르지 않습니다.")
            }

            val song = songService.findByVideo(user.id, videoId)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, SongEnvelope(song = song))
        }

        post("/migrate-local") {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()

            val itemsArray = body.requireArray("items", 100)
            val markMigrated = body.optBoolean("markMigrated", false)

            val items = mutableListOf<LocalSongItem>()
            var invalidCount = 0
            for (element in itemsArray) {
                val parsed = SongService.parseLocalItem(element)
                if (parsed != null) {
                    items.add(parsed)
                } else {
                    invalidCount++
                }
            }

            val response = songService.migrateLocal(user.id, items, invalidCount, markMigrated)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, response)
        }

        // 재생목록 가져오기 (M1-1 §5-3, M1-2b)
        get("/import-playlist/preview") {
            val user = call.requireAuthUser()
            val url = call.request.queryParameters["url"]?.trim()
            if (url.isNullOrEmpty() || url.length > PlaylistImportService.MAX_URL_LENGTH) {
                throw InvalidInputException("url 값이 필요합니다.")
            }
            val preview = playlistImportService.preview(user.id, url)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, preview)
        }

        post("/import-playlist") {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()
            val url = body.requireString("url", PlaylistImportService.MAX_URL_LENGTH)
            if (url.isEmpty()) throw InvalidInputException("url 값이 필요합니다.")

            // categoryId 또는 newCategory:true 중 하나만 (둘 다/없음 400)
            val hasCategoryId = body.containsKey("categoryId") && body["categoryId"] !is JsonNull
            val newCategory = body.optBoolean("newCategory", false)
            val categoryName = body.optString("categoryName", CategoryService.MAX_NAME_LENGTH)
            if (hasCategoryId == newCategory) {
                throw InvalidInputException("categoryId 또는 newCategory:true 중 하나만 보내야 합니다.")
            }
            if (categoryName != null && !newCategory) {
                throw InvalidInputException("categoryName은 newCategory:true와 함께만 쓸 수 있습니다.")
            }
            if (categoryName != null && categoryName.isEmpty()) {
                throw InvalidInputException("categoryName은 비워 둘 수 없습니다.")
            }
            val target = if (newCategory) PlaylistTarget.NewCategory(categoryName)
            else PlaylistTarget.Existing(body.requireUuid("categoryId"))

            val result = playlistImportService.import(user.id, url, target)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, result)
        }

        // SL-2 ⑥: 보이는 폴더의 곡 순서 저장(명세 §5). 리터럴 경로라 /{songId} 계열과 겹치지 않는다
        put("/order") {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()
            val arr = body.requireArray("ids", SongService.MAX_ORDER_IDS)
            if (arr.isEmpty()) {
                throw InvalidInputException("ids 형식이 올바르지 않습니다.")
            }
            val ids = arr.map { elem ->
                if (elem !is JsonPrimitive || !elem.isString) {
                    throw InvalidInputException("ids 형식이 올바르지 않습니다.")
                }
                // 소문자 표준 표기만 받는다(fromString은 "1-1-1-1-1"·대문자도 받으므로 원문과 같은지 본다)
                runCatching { UUID.fromString(elem.content) }.getOrNull()
                    ?.takeIf { it.toString() == elem.content }
                    ?: throw InvalidInputException("ids 형식이 올바르지 않습니다.")
            }
            if (ids.toSet().size != ids.size) {
                throw InvalidInputException("ids에 같은 곡이 두 번 있습니다.")
            }

            val list = songService.reorder(user.id, ids, call.includeTabParam())
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, SongListResponse(songs = list))
        }

        // UXP: 곡 제목 일괄 변경. 리터럴 경로라 /{songId}와 겹치지 않는다
        patch("/titles") {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()
            val arr = body.requireArray("items", SongService.MAX_BATCH_TITLES)
            if (arr.isEmpty()) {
                throw InvalidInputException("items가 비어 있습니다.")
            }
            val seen = HashSet<UUID>(arr.size)
            val items = arr.map { elem ->
                val obj = elem as? kotlinx.serialization.json.JsonObject
                    ?: throw InvalidInputException("items 항목 형식이 올바르지 않습니다.")
                val id = obj.requireUuid("id")
                if (!seen.add(id)) {
                    throw InvalidInputException("items에 같은 곡이 두 번 있습니다.")
                }
                val rawTitle = obj.requireString("title", 300)
                if (rawTitle.isBlank()) {
                    throw InvalidInputException("title은 비워 둘 수 없습니다.")
                }
                id to rawTitle
            }
            val list = songService.batchUpdateTitles(user.id, items, call.includeTabParam())
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, SongListResponse(songs = list))
        }

        get("/{songId}") {
            val user = call.requireAuthUser()
            val songId = parsePathUuid(call.parameters["songId"])
            val detail = songService.getDetail(user.id, songId)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, detail)
        }

        patch("/{songId}") {
            val user = call.requireAuthUser()
            val songId = parsePathUuid(call.parameters["songId"])
            val body = call.receiveJsonObject()

            val hasStatus = body.containsKey("status") && body["status"] !is JsonNull
            val hasMemo = body.containsKey("memo") && body["memo"] !is JsonNull
            val hasTitle = body.containsKey("title") && body["title"] !is JsonNull
            val hasCategoryIds = body.containsKey("categoryIds") && body["categoryIds"] !is JsonNull

            if (!hasStatus && !hasMemo && !hasTitle && !hasCategoryIds) {
                throw InvalidInputException("수정할 값(status, memo, title, categoryIds)이 없습니다.")
            }

            val statusCode = if (hasStatus) {
                val elem = body["status"]
                if (elem !is JsonPrimitive || !elem.isString) {
                    throw InvalidInputException("status 값이 올바르지 않습니다.")
                }
                SongService.normalizeStatus(elem.content)
                    ?: throw InvalidInputException("status 값이 올바르지 않습니다.")
            } else null

            val memo = if (hasMemo) {
                body.optString("memo", 2000)
            } else null

            val title = if (hasTitle) {
                val t = body.optString("title", 300)
                if (t.isNullOrBlank()) {
                    throw InvalidInputException("title은 비워 둘 수 없습니다.")
                }
                t
            } else null

            val categoryIds = if (hasCategoryIds) {
                val arr = body.requireArray("categoryIds", CategoryService.MAX_PER_SONG)
                arr.map { elem ->
                    if (elem !is JsonPrimitive || !elem.isString) {
                        throw InvalidInputException("categoryIds 형식이 올바르지 않습니다.")
                    }
                    // fromString은 "1-1-1-1-1"도 받으므로 표준 표기와 같은지 한 번 더 본다
                    runCatching { UUID.fromString(elem.content) }.getOrNull()
                        ?.takeIf { it.toString() == elem.content.lowercase() }
                        ?: throw InvalidInputException("categoryIds 형식이 올바르지 않습니다.")
                }.distinct()
            } else null

            val updated = songService.update(
                user.id,
                songId,
                UpdateSongInput(statusCode, memo, title, categoryIds = categoryIds)
            )
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, SongEnvelope(song = updated))
        }

        delete("/{songId}") {
            val user = call.requireAuthUser()
            val songId = parsePathUuid(call.parameters["songId"])

            val ids = songService.delete(user.id, songId)
            storageTrashService.purge(ids)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(
                HttpStatusCode.OK,
                buildJsonObject { put("ok", true) }
            )
        }

        // ============================================================
        // 구간 프리셋 CRUD (V9)
        // ============================================================
        get("/{songId}/presets") {
            val user = call.requireAuthUser()
            val songId = parsePathUuid(call.parameters["songId"])
            val presets = songService.listPresets(user.id, songId)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, PresetListResponse(presets = presets))
        }

        put("/{songId}/presets") {
            val user = call.requireAuthUser()
            val songId = parsePathUuid(call.parameters["songId"])
            val body = call.receiveJsonObject()

            val rawName = body.requireString("name", 50).trim()
            if (rawName.isEmpty()) {
                throw InvalidInputException("프리셋 이름(name)은 비워 둘 수 없습니다.")
            }

            val aDbl = body.requireDouble("a", -10.0, 86400.0)
            val a = BigDecimal.valueOf(aDbl).setScale(1, RoundingMode.HALF_UP)

            val bDbl = body.requireDouble("b", 0.0, 86400.0)
            val b = BigDecimal.valueOf(bDbl).setScale(1, RoundingMode.HALF_UP)

            if (a >= b) {
                throw InvalidInputException("시작 시간(a)은 끝 시간(b)보다 작아야 합니다.")
            }

            val rateDbl = body.optDouble("rate", 0.25, 2.0) ?: 1.00
            val rate = BigDecimal.valueOf(rateDbl).setScale(2, RoundingMode.HALF_UP)
            val completed = body.optBoolean("completed", false)
            val merge = body.optBoolean("merge", true)

            val preset = songService.upsertPreset(
                userId = user.id,
                songId = songId,
                input = UpsertPresetInput(
                    name = rawName,
                    a = a,
                    b = b,
                    rate = rate,
                    completed = completed,
                    merge = merge
                )
            )
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, PresetEnvelope(ok = true, preset = preset))
        }

        delete("/{songId}/presets/{presetId}") {
            val user = call.requireAuthUser()
            val songId = parsePathUuid(call.parameters["songId"])
            val presetId = parsePathUuid(call.parameters["presetId"])
            val deleted = songService.deletePreset(user.id, songId, presetId)
            if (!deleted) {
                throw NotFoundException("프리셋을 찾을 수 없습니다.")
            }
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, buildJsonObject { put("ok", true) })
        }
    }
}

/**
 * TB-1 명세 T4: 목록 응답은 `?include=tab`일 때만 TAB 곡을 넣는다(이미 설치된 옛 앱은 videoId를 문자열로 가정).
 * 없으면 false, 정확히 "tab"이면 true, 그 밖의 값은 400
 */
internal fun ApplicationCall.includeTabParam(): Boolean {
    val raw = request.queryParameters["include"] ?: return false
    if (raw != "tab") throw InvalidInputException("include 값이 올바르지 않습니다.")
    return true
}
