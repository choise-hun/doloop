package ulevelp.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import ulevelp.api.*
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import ulevelp.auth.requireAuthUser
import ulevelp.service.CommunityService
import ulevelp.service.PracticeLogService
import ulevelp.service.ProfileService

/** 불리언 키: 없으면 null, null도 null, 불리언이 아니면 400 */
private fun JsonObject.optBooleanOrNull(name: String): Boolean? {
    val e = this[name] ?: return null
    if (e is JsonNull) return null
    if (e !is JsonPrimitive || e.isString || e.booleanOrNull == null) {
        throw InvalidInputException("$name 형식이 올바르지 않습니다.")
    }
    return e.booleanOrNull
}

/**
 * 내 분류 공개 — `/categories/{categoryId}/share` (M1-1 §5-5, M1-4a). `registerCategoryRoutes`의
 * `route("/categories")` 안에서 부른다(같은 인증 플러그인 아래)
 */
fun Route.registerCategoryShareRoutes(communityService: CommunityService) {
    route("/{categoryId}/share") {
        get {
            val user = call.requireAuthUser()
            val categoryId = parsePathUuid(call.parameters["categoryId"])
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, ulevelp.service.ShareEnvelope(communityService.getShare(user.id, categoryId)))
        }

        put {
            val user = call.requireAuthUser()
            val categoryId = parsePathUuid(call.parameters["categoryId"])
            val body = call.receiveJsonObject()
            val isPublic = body.optBooleanOrNull("isPublic") ?: throw InvalidInputException("isPublic 값이 필요합니다.")
            val autoSync = body.optBooleanOrNull("autoSync")
            val title = body.optString("title", CommunityService.MAX_TITLE_LENGTH)
            val share = communityService.share(user.id, categoryId, isPublic, autoSync, title)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, ulevelp.service.ShareEnvelope(share))
        }

        post("/republish") {
            val user = call.requireAuthUser()
            val categoryId = parsePathUuid(call.parameters["categoryId"])
            val body = call.receiveJsonObject()
            val title = body.optString("title", CommunityService.MAX_TITLE_LENGTH)
            val share = communityService.republish(user.id, categoryId, title)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, ulevelp.service.ShareEnvelope(share))
        }
    }
}

/** 홈 큐레이션 — `GET /curation/home` (M1-1 §5-5, M1-4b). 로그인 필요, 무료도 열람 */
fun Route.registerCurationRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    communityService: CommunityService
) {
    route("/curation") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get("/home") {
            val user = call.requireAuthUser()
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.curationHome(user.id))
        }
    }
}

/** 커뮤니티 — `/community` 아래 전부 (M1-1 §5-5, M1-4a·4b). 모두 로그인 필요, 쓰기 중 공개·복제만 유료 */
fun Route.registerCommunityRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    communityService: CommunityService,
    practiceLogService: PracticeLogService
) {
    route("/community") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        put("/me/public-name") {
            val user = call.requireAuthUser()
            val body = call.receiveJsonObject()
            val name = body.requireString("publicName", 100)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.setPublicName(user.id, name))
        }

        get("/folders") {
            val user = call.requireAuthUser()
            val sort = call.request.queryParameters["sort"] ?: "recent"
            if (sort !in CommunityService.SORTS) throw InvalidInputException("sort는 recent·clones·likes 중 하나여야 합니다.")
            val cursor = call.request.queryParameters["cursor"]?.let {
                it.toIntOrNull()?.takeIf { n -> n in 0..100_000 } ?: throw InvalidInputException("cursor 형식이 올바르지 않습니다.")
            } ?: 0
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.listFolders(user.id, sort, cursor))
        }

        get("/folders/{folderId}") {
            val user = call.requireAuthUser()
            val folderId = parsePathUuid(call.parameters["folderId"])
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.getFolder(user.id, folderId))
        }

        put("/folders/{folderId}/like") {
            val user = call.requireAuthUser()
            val folderId = parsePathUuid(call.parameters["folderId"])
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.setLike(user.id, folderId, liked = true))
        }

        delete("/folders/{folderId}/like") {
            val user = call.requireAuthUser()
            val folderId = parsePathUuid(call.parameters["folderId"])
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.setLike(user.id, folderId, liked = false))
        }

        post("/folders/{folderId}/clone") {
            val user = call.requireAuthUser()
            val folderId = parsePathUuid(call.parameters["folderId"])
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.clone(user.id, folderId))
        }

        post("/folders/{folderId}/reports") {
            val user = call.requireAuthUser()
            val folderId = parsePathUuid(call.parameters["folderId"])
            val body = call.receiveJsonObject()
            val reason = body.requireString("reason", 20)
            if (reason !in CommunityService.REPORT_REASONS) {
                throw InvalidInputException("reason은 spam·inappropriate·copyright·other 중 하나여야 합니다.")
            }
            val detail = body.optString("detail", CommunityService.MAX_DETAIL_LENGTH) ?: ""
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.Created, communityService.report(user.id, folderId, reason, detail))
        }

        get("/users/{userId}") {
            val user = call.requireAuthUser()
            val targetId = parsePathUuid(call.parameters["userId"])
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            val page = communityService.userPage(user.id, targetId)
            call.respond(HttpStatusCode.OK, page.copy(practiceLog = practiceLogService.forUser(targetId)))
        }

        // 학습 기록 공유(M1-4b E6) — 동의한 유료 사용자만 보인다, 열람은 무료도
        get("/logs") {
            val user = call.requireAuthUser()
            val scope = call.request.queryParameters["scope"] ?: "all"
            if (scope !in PracticeLogService.SCOPES) throw InvalidInputException("scope는 following·all 중 하나여야 합니다.")
            val cursor = call.request.queryParameters["cursor"]?.let {
                it.toIntOrNull()?.takeIf { n -> n in 0..100_000 } ?: throw InvalidInputException("cursor 형식이 올바르지 않습니다.")
            } ?: 0
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, practiceLogService.list(user.id, scope, cursor))
        }

        get("/follows") {
            val user = call.requireAuthUser()
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.listFollows(user.id))
        }

        put("/follows/{userId}") {
            val user = call.requireAuthUser()
            val targetId = parsePathUuid(call.parameters["userId"])
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.setFollow(user.id, targetId, follow = true))
        }

        delete("/follows/{userId}") {
            val user = call.requireAuthUser()
            val targetId = parsePathUuid(call.parameters["userId"])
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, communityService.setFollow(user.id, targetId, follow = false))
        }
    }
}
