package ulevelp.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import ulevelp.api.InvalidInputException
import ulevelp.api.parsePathUuid
import ulevelp.api.receiveJsonObject
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import ulevelp.auth.requireAuthUser
import ulevelp.service.AdminService
import ulevelp.service.ProfileService
import ulevelp.service.TierLimits
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeParseException

/** owner 확인 — `/admin` route 한 곳(M1-1 §5-2). 인증 플러그인 다음에 돈다 */
private val OwnerOnlyPlugin = createRouteScopedPlugin(
    name = "OwnerOnlyPlugin",
    createConfiguration = { OwnerOnlyConfig() }
) {
    val adminService = pluginConfig.adminService
    onCall { call ->
        if (call.request.httpMethod == HttpMethod.Options) return@onCall
        val service = adminService ?: error("OwnerOnlyPlugin: adminService 없음")
        service.requireOwner(call.requireAuthUser().id)
    }
}

private class OwnerOnlyConfig {
    var adminService: AdminService? = null
}

private fun parseInstantOrNull(raw: JsonPrimitive?, name: String): OffsetDateTime? {
    if (raw == null || raw is JsonNull) return null
    if (!raw.isString) throw InvalidInputException("$name 은(는) ISO-8601 문자열 또는 null이어야 합니다.")
    return try {
        OffsetDateTime.parse(raw.content).withOffsetSameInstant(ZoneOffset.UTC)
    } catch (_: DateTimeParseException) {
        try {
            Instant.parse(raw.content).atOffset(ZoneOffset.UTC)
        } catch (_: DateTimeParseException) {
            throw InvalidInputException("$name 형식이 올바른 ISO-8601 시각이 아닙니다.")
        }
    }
}

fun Route.registerAdminRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    adminService: AdminService
) {
    route("/admin") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }
        install(OwnerOnlyPlugin) {
            this.adminService = adminService
        }

        get("/users") {
            val email = call.request.queryParameters["email"]?.trim()
            if (email.isNullOrEmpty() || email.length > 320) {
                throw InvalidInputException("email 쿼리가 필요합니다.")
            }
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, adminService.findUsersByEmail(email))
        }

        put("/users/{userId}/tier-override") {
            val actor = call.requireAuthUser()
            val userId = parsePathUuid(call.parameters["userId"])
            val body = call.receiveJsonObject()
            if (!body.containsKey("tier")) throw InvalidInputException("tier 값이 필요합니다(해제는 null).")
            val tier = when (val t = body["tier"]) {
                null, is JsonNull -> null
                is JsonPrimitive -> t.takeIf { it.isString }?.content?.takeIf { it in TierLimits.TIERS }
                    ?: throw InvalidInputException("tier는 free·pro·pro_plus 또는 null이어야 합니다.")
                else -> throw InvalidInputException("tier는 free·pro·pro_plus 또는 null이어야 합니다.")
            }
            val untilElem = body["until"]
            if (untilElem != null && untilElem !is JsonPrimitive) throw InvalidInputException("until 형식이 올바르지 않습니다.")
            val until = parseInstantOrNull(untilElem as JsonPrimitive?, "until")
            val reason = adminService.validateReason((body["reason"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
            val dto = adminService.setTierOverride(actor.id, userId, tier, until, reason)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, dto)
        }

        post("/users/{userId}/credits") {
            val actor = call.requireAuthUser()
            val userId = parsePathUuid(call.parameters["userId"])
            val body = call.receiveJsonObject()
            val delta = (body["delta"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
                ?: throw InvalidInputException("delta 정수가 필요합니다.")
            val bucket = when (val b = body["bucket"]) {
                null, is JsonNull -> "purchased" // 기본 = 구매분(소멸 없음, A13)
                is JsonPrimitive -> b.takeIf { it.isString }?.content ?: throw InvalidInputException("bucket 형식이 올바르지 않습니다.")
                else -> throw InvalidInputException("bucket 형식이 올바르지 않습니다.")
            }
            val reason = adminService.validateReason((body["reason"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
            val res = adminService.adjustCredits(actor.id, userId, delta, bucket, reason)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }

        put("/users/{userId}/creator") {
            val actor = call.requireAuthUser()
            val userId = parsePathUuid(call.parameters["userId"])
            val body = call.receiveJsonObject()
            val isCreator = (body["isCreator"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
                ?: throw InvalidInputException("isCreator 불리언이 필요합니다.")
            val bio = when (val b = body["creatorBio"]) {
                null -> null
                is JsonPrimitive -> b.takeIf { it.isString }?.content?.trim() ?: throw InvalidInputException("creatorBio는 문자열이어야 합니다.")
                else -> throw InvalidInputException("creatorBio는 문자열이어야 합니다.")
            }
            val reason = adminService.validateReason((body["reason"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
            val dto = adminService.setCreator(actor.id, userId, isCreator, body["creatorBadge"], bio, reason)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, dto)
        }

        // ---- 커뮤니티 (M1-4a) ----
        get("/reports") {
            val status = call.request.queryParameters["status"] ?: "open"
            if (status !in AdminService.REPORT_STATUSES) throw InvalidInputException("status는 open·resolved·dismissed 중 하나여야 합니다.")
            val limit = call.request.queryParameters["limit"]?.let {
                it.toIntOrNull()?.takeIf { n -> n in 1..AdminService.MAX_AUDIT_LIMIT }
                    ?: throw InvalidInputException("limit은 1~${AdminService.MAX_AUDIT_LIMIT}이어야 합니다.")
            } ?: 50
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, adminService.listReports(status, limit))
        }

        patch("/reports/{reportId}") {
            val actor = call.requireAuthUser()
            val reportId = call.parameters["reportId"]?.toLongOrNull()?.takeIf { it > 0 }
                ?: throw ulevelp.api.NotFoundException()
            val body = call.receiveJsonObject()
            val status = (body["status"] as? JsonPrimitive)?.takeIf { it.isString }?.content
                ?: throw InvalidInputException("status 값이 필요합니다.")
            val reason = adminService.validateReason((body["reason"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, adminService.resolveReport(actor.id, reportId, status, reason))
        }

        patch("/shared-folders/{folderId}") {
            val actor = call.requireAuthUser()
            val folderId = parsePathUuid(call.parameters["folderId"])
            val body = call.receiveJsonObject()
            val hidden = (body["hidden"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
                ?: throw InvalidInputException("hidden 불리언이 필요합니다(M1-4a는 숨김만 바꿀 수 있습니다).")
            val hiddenReason = when (val r = body["hiddenReason"]) {
                null, is JsonNull -> null
                is JsonPrimitive -> r.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }
                    ?: throw InvalidInputException("hiddenReason은 문자열이어야 합니다.")
                else -> throw InvalidInputException("hiddenReason은 문자열이어야 합니다.")
            }
            val reason = adminService.validateReason((body["reason"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, adminService.setFolderHidden(actor.id, folderId, hidden, hiddenReason, reason))
        }

        delete("/users/{userId}/public-name") {
            val actor = call.requireAuthUser()
            val userId = parsePathUuid(call.parameters["userId"])
            val body = call.receiveJsonObject()
            val reason = adminService.validateReason((body["reason"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, adminService.resetPublicName(actor.id, userId, reason))
        }

        get("/audit") {
            val target = call.request.queryParameters["targetUserId"]?.let { parsePathUuid(it) }
            val limit = call.request.queryParameters["limit"]?.let {
                it.toIntOrNull()?.takeIf { n -> n in 1..AdminService.MAX_AUDIT_LIMIT }
                    ?: throw InvalidInputException("limit은 1~${AdminService.MAX_AUDIT_LIMIT}이어야 합니다.")
            } ?: 50
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, adminService.listAudit(target, limit))
        }
    }
}
