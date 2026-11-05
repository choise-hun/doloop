package ulevelp.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
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
    playlistImportService: PlaylistImportService
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

            val list = songService.list(user.id, statusCode)
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
    }
}
