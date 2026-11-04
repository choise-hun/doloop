package ulevelp.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ulevelp.api.*
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import ulevelp.auth.requireAuthUser
import ulevelp.service.*

/** 코드 진행 모음 CRUD (`개발산출물/결과/CH-1b_설계.md` §3-2·§3-3). `/analyze`는 CH-4 */
fun Route.registerProgressionRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    progressionService: ProgressionService
) {
    route("/progressions") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get {
            val user = call.requireAuthUser()
            val scope = call.request.queryParameters["scope"] ?: ProgressionService.SCOPE_ALL
            if (scope !in ProgressionService.SCOPES) {
                throw InvalidInputException("scope는 reference·analysis·all 중 하나여야 합니다.")
            }
            val list = progressionService.list(user.id, scope)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, ProgressionListResponse(progressions = list))
        }

        post {
            val user = call.requireAuthUser()
            val input = ProgressionService.parseInput(call.receiveJsonObject(), forCreate = true)
            val created = progressionService.create(user.id, input)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.Created, ProgressionEnvelope(progression = created))
        }

        patch("/{progressionId}") {
            val user = call.requireAuthUser()
            val progressionId = parsePathUuid(call.parameters["progressionId"])
            val input = ProgressionService.parseInput(call.receiveJsonObject(), forCreate = false)
            val updated = progressionService.update(user.id, progressionId, input)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, ProgressionEnvelope(progression = updated))
        }

        delete("/{progressionId}") {
            val user = call.requireAuthUser()
            val progressionId = parsePathUuid(call.parameters["progressionId"])
            progressionService.delete(user.id, progressionId)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, buildJsonObject { put("ok", true) })
        }
    }
}
