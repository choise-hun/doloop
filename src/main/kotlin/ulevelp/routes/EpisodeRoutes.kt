package ulevelp.routes

import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.request.*
import kotlinx.io.readByteArray
import io.ktor.utils.io.*
import kotlinx.coroutines.CancellationException
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import java.util.UUID
import kotlinx.serialization.json.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import ulevelp.api.*
import ulevelp.auth.requireAuthUser
import ulevelp.service.*

/** 각 기존 인증 경계 안에서만 등록한다. */
internal fun Route.registerSessionEpisodeRoutes(service: EpisodeLogService) {
    post("/{sessionId}/share") {
        val user = call.requireAuthUser()
        val id = parsePathUuid(call.parameters["sessionId"])
        val body = call.receiveJsonObject()
        body.episodeKeys("title", "comment", "attachment")
        val title = body.episodeString("title", 80)
        val comment = body.episodeString("comment", 500, multiline = true)
        val (created, response) = service.share(user.id, id, title, comment, ShareAttachmentInput.parse(body["attachment"]))
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(if (created) HttpStatusCode.Created else HttpStatusCode.OK, response)
    }
    delete("/{sessionId}/share/attachment") {
        val user = call.requireAuthUser()
        val id = parsePathUuid(call.parameters["sessionId"])
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.removeAttachment(user.id, id))
    }
    delete("/{sessionId}/share") {
        val user = call.requireAuthUser()
        val id = parsePathUuid(call.parameters["sessionId"])
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.withdraw(user.id, id))
    }
}

/** 좋아요 경로는 명세(CMR-4 §4.2)대로 형식 오류를 400으로 돌려준다. 공용 parsePathUuid(404)는 바꾸지 않는다. */
private fun parseLikePostId(raw: String?): java.util.UUID =
    try { parsePathUuid(raw) } catch (_: NotFoundException) { throw InvalidInputException("postId 형식이 올바르지 않습니다.") }

internal fun Route.registerCommunityEpisodeRoutes(service: EpisodeLogService) {
    get("/me/share-consent") {
        val user = call.requireAuthUser()
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.shareConsent(user.id))
    }
    post("/me/share-consent") {
        val user = call.requireAuthUser()
        val body = call.receiveJsonObject()
        body.episodeKeys("noticeVersion")
        val version = (body["noticeVersion"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
            ?: throw InvalidInputException("noticeVersion 형식이 올바르지 않습니다.")
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.agreeShareConsent(user.id, version))
    }
    post("/me/share-consent/withdraw-recording") {
        val user = call.requireAuthUser()
        val body = call.receiveJsonObject()
        body.episodeKeys("removeExisting")
        val remove = (body["removeExisting"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
            ?: throw InvalidInputException("removeExisting 형식이 올바르지 않습니다.")
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.withdrawRecordingConsent(user.id, remove))
    }
    get("/episode-logs/{postId}/attachments/{attachmentId}/url") {
        call.requireAuthUser()
        val postId = parsePathUuid(call.parameters["postId"])
        val attachmentId = parsePathUuid(call.parameters["attachmentId"])
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.attachmentUrl(postId, attachmentId))
    }
    get("/episode-logs") {
        val user = call.requireAuthUser()
        val query = call.request.queryParameters
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.feed(user.id, query["scope"] ?: "all", query["cursor"]))
    }
    get("/me/episode-logs") {
        val user = call.requireAuthUser()
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.mine(user.id, call.request.queryParameters["cursor"]))
    }
    put("/episode-logs/{postId}/like") {
        val user = call.requireAuthUser()
        val id = parseLikePostId(call.parameters["postId"])
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.setLike(user.id, id, liked = true))
    }
    delete("/episode-logs/{postId}/like") {
        val user = call.requireAuthUser()
        val id = parseLikePostId(call.parameters["postId"])
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.setLike(user.id, id, liked = false))
    }
    post("/episode-logs/{postId}/reports") {
        val user = call.requireAuthUser()
        val id = parsePathUuid(call.parameters["postId"])
        val body = call.receiveJsonObject()
        body.episodeKeys("reason", "detail")
        val reason = body.episodeString("reason", 20, required = true)
        if (reason !in CommunityService.REPORT_REASONS) throw InvalidInputException("reason 형식이 올바르지 않습니다.")
        val detail = body.episodeString("detail", 500, multiline = true)
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(HttpStatusCode.Created, service.report(user.id, id, reason, detail))
    }
}

/** registerAdminRoutes의 OwnerOnlyPlugin 내부에서 등록한다. */
internal fun Route.registerAdminEpisodeRoutes(service: AdminService) {
    get("/community/episode-logs/reports") {
        val actor = call.requireAuthUser()
        val query = call.request.queryParameters
        val status = query["status"] ?: "open"
        if (status !in setOf("open", "resolved", "dismissed")) throw InvalidInputException("status 형식이 올바르지 않습니다.")
        val limit = query["limit"]?.let { it.toIntOrNull()?.takeIf { n -> n in 1..200 } ?: throw InvalidInputException("limit 형식이 올바르지 않습니다.") } ?: 50
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.listEpisodeReports(actor.id, status, limit, query["cursor"]))
    }
    patch("/community/episode-logs/{postId}") {
        val actor = call.requireAuthUser()
        val id = parsePathUuid(call.parameters["postId"])
        val body = call.receiveJsonObject()
        body.episodeKeys("status", "reason")
        val status = body.episodeString("status", 30, required = true)
        if (status !in setOf("published", "moderation_hidden")) throw InvalidInputException("status 형식이 올바르지 않습니다.")
        val reason = body.episodeString("reason", 200, multiline = true, required = true)
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.moderateEpisode(actor.id, id, status, reason))
    }
    patch("/community/episode-logs/reports/{reportId}") {
        val actor = call.requireAuthUser()
        val id = parsePathUuid(call.parameters["reportId"])
        val body = call.receiveJsonObject()
        body.episodeKeys("status", "reason")
        val status = body.episodeString("status", 20, required = true)
        if (status !in setOf("resolved", "dismissed")) throw InvalidInputException("status 형식이 올바르지 않습니다.")
        val reason = body.episodeString("reason", 200, multiline = true, required = true)
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.resolveEpisodeReport(actor.id, id, status, reason))
    }
}

internal fun Route.registerShareLifecycleRoutes(jwtVerifier: SupabaseJwtVerifier?, profileService: ProfileService, attachments: ShareAttachmentService) {
    fun id(raw: String?): UUID = try { UUID.fromString(raw ?: throw InvalidInputException("id가 필요합니다.")) }
        catch (_: IllegalArgumentException) { throw InvalidInputException("id 형식이 올바르지 않습니다.") }
    route("/community/me/share-impact") {
        install(SupabaseAuthPlugin) { this.jwtVerifier = jwtVerifier; this.profileService = profileService }
        get {
            val user = call.requireAuthUser()
            val q = call.request.queryParameters
            if ((q["songId"] == null) == (q["takeId"] == null)) throw InvalidInputException("songId 또는 takeId 하나가 필요합니다.")
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(attachments.impact(user.id, q["songId"]?.let(::id), q["takeId"]?.let(::id)))
        }
    }
    route("/sessions/{sessionId}/share/uploads") {
        install(SupabaseAuthPlugin) { this.jwtVerifier = jwtVerifier; this.profileService = profileService }
        post {
            val user = call.requireAuthUser()
            val session = parsePathUuid(call.parameters["sessionId"])
            if ((call.request.header(HttpHeaders.ContentLength)?.toLongOrNull() ?: 0) > ShareAttachmentService.MAX_BYTES + 65_536L) {
                throw ApiException(HttpStatusCode.PayloadTooLarge, "ATTACHMENT_LIMIT_EXCEEDED", "파일이 너무 큽니다.",
                    detail = buildJsonObject { put("kind", "size"); put("limit", ShareAttachmentService.MAX_BYTES) })
            }
            val multipart = try { call.receiveMultipart(formFieldLimit = ShareAttachmentService.MAX_BYTES + 65_536L) }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) { throw InvalidInputException("multipart 본문이 필요합니다.") }
            var take: UUID? = null
            var response: JsonObject? = null
            try {
                while (true) {
                    val part = multipart.readPart() ?: break
                    try {
                        when {
                            part.name == "takeId" && response == null -> {
                                if (take != null) throw InvalidInputException("takeId가 중복되었습니다.")
                                take = id(when (part) {
                                    is PartData.FormItem -> part.value
                                    is PartData.FileItem -> part.provider().readRemaining(37).readByteArray().toString(Charsets.UTF_8)
                                    else -> null
                                })
                            }
                            part is PartData.FileItem && part.name == "file" -> {
                                if (response != null) throw InvalidInputException("file이 중복되었습니다.")
                                val takeId = take ?: throw InvalidInputException("takeId 파트가 필요합니다.")
                                response = attachments.uploadDrive(user.id, session, takeId) {
                                    val bytes = part.provider().readRemaining(ShareAttachmentService.MAX_BYTES + 1L).readByteArray()
                                    if (bytes.size > ShareAttachmentService.MAX_BYTES) return@uploadDrive bytes
                                    // Validate the rest of the request before external upload; a later duplicate cannot leave an uploaded row.
                                    while (true) {
                                        val extra = multipart.readPart() ?: break
                                        try { if (extra.name in setOf("takeId", "file")) throw InvalidInputException("multipart 파트가 중복되었습니다.") }
                                        finally { extra.dispose() }
                                    }
                                    bytes
                                }
                            }
                        }
                    } finally { part.dispose() }
                }
                val takeId = take ?: throw InvalidInputException("takeId 파트가 필요합니다.")
                if (response == null) attachments.uploadDrive(user.id, session, takeId) { throw InvalidInputException("file 파트가 필요합니다.") }
                call.response.headers.append(HttpHeaders.CacheControl, "no-store")
                call.respond(HttpStatusCode.Created, response ?: throw InvalidInputException("file 파트가 필요합니다."))
            } catch (e: CancellationException) { throw e }
              catch (e: ApiException) { throw e }
              catch (e: Exception) { throw InvalidInputException("multipart 본문을 읽지 못했습니다.") }
        }
    }
}
