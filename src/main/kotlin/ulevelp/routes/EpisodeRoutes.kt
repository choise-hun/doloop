package ulevelp.routes

import io.ktor.http.*
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
        body.episodeKeys("title", "comment")
        val title = body.episodeString("title", 80)
        val comment = body.episodeString("comment", 500, multiline = true)
        val (created, response) = service.share(user.id, id, title, comment)
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(if (created) HttpStatusCode.Created else HttpStatusCode.OK, response)
    }
    delete("/{sessionId}/share") {
        val user = call.requireAuthUser()
        val id = parsePathUuid(call.parameters["sessionId"])
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.withdraw(user.id, id))
    }
}

internal fun Route.registerCommunityEpisodeRoutes(service: EpisodeLogService) {
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
        val id = parsePathUuid(call.parameters["postId"])
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(service.setLike(user.id, id, liked = true))
    }
    delete("/episode-logs/{postId}/like") {
        val user = call.requireAuthUser()
        val id = parsePathUuid(call.parameters["postId"])
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
