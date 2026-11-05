package ulevelp.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.api.optString
import ulevelp.api.receiveJsonObject
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import ulevelp.auth.requireAuthUser
import ulevelp.service.IntegrationListResponse
import ulevelp.service.IntegrationService
import ulevelp.service.ProfileService
import ulevelp.service.SaveNotionKeyInput

fun Route.registerIntegrationRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    integrationService: IntegrationService
) {
    route("/integrations") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get {
            val user = call.requireAuthUser()
            val appId = call.request.queryParameters["appId"] ?: "ulevelp"
            val list = integrationService.list(user.id, appId)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, IntegrationListResponse(integrations = list))
        }

        put("/notion") {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()
            val appId = body.optString("appId", 64) ?: "ulevelp"
            val token = body.optString("token", 256)
            val songsDb = (body["songsDb"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
            val sessionsDb = (body["sessionsDb"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
            val notesDb = (body["notesDb"] as? JsonPrimitive)?.takeIf { it.isString }?.content

            val dto = integrationService.saveNotion(
                userId = user.id,
                input = SaveNotionKeyInput(
                    appId = appId,
                    token = token,
                    songsDb = songsDb,
                    sessionsDb = sessionsDb,
                    notesDb = notesDb
                )
            )
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, dto)
        }

        // M1-3b: Gemini 키 등록 경로 삭제 — AI 분석은 서버 키 + 크레딧(M1-1 §5-4)
        put("/gemini") {
            call.requireAuthUser()
            throw geminiRemoved()
        }

        post("/{provider}/check") {
            val user = call.requireAuthUser()
            val provider = call.parameters["provider"]
            val appId = call.request.queryParameters["appId"] ?: "ulevelp"

            requireSupportedProvider(provider)

            val res = integrationService.checkNotion(user.id, appId)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }

        delete("/{provider}") {
            val user = call.requireAuthUser()
            val provider = call.parameters["provider"]
            val appId = call.request.queryParameters["appId"] ?: "ulevelp"

            integrationService.delete(user.id, appId, requireSupportedProvider(provider))
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, buildJsonObject { put("ok", true) })
        }
    }
}

private fun geminiRemoved() = InvalidInputException("지원하지 않는 연동입니다. AI 분석은 서버에서 크레딧으로 처리하므로 Gemini 키를 등록하지 않습니다.")

/** gemini = 지운 연동(400 INVALID_INPUT, M1-1 §5-4), 그 밖의 모르는 이름 = 404(기존 그대로) */
private fun requireSupportedProvider(provider: String?): String {
    if (provider == IntegrationService.REMOVED_PROVIDER_GEMINI) throw geminiRemoved()
    if (provider == null || provider !in IntegrationService.VALID_PROVIDERS) {
        throw NotFoundException("지원하지 않는 연동 공급자입니다.")
    }
    return provider
}
