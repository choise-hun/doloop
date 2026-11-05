package ulevelp.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ulevelp.api.UnauthorizedException
import ulevelp.auth.CronOidcVerifier
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import ulevelp.auth.requireAuthUser
import ulevelp.notion.NotionPushWorker
import ulevelp.service.CreditService
import ulevelp.service.TierService
import ulevelp.notion.NotionSyncService
import ulevelp.service.ProfileService

fun Route.registerNotionSyncRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    notionPushWorker: NotionPushWorker,
    notionSyncService: NotionSyncService
) {
    route("/notion/sync") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get("/status") {
            val user = call.requireAuthUser()
            val res = notionSyncService.getStatus(user.id)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }

        post("/enable") {
            val user = call.requireAuthUser()
            val res = notionSyncService.enable(user.id)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }

        post("/disable") {
            val user = call.requireAuthUser()
            notionSyncService.disable(user.id)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, buildJsonObject { put("ok", true) })
        }

        post("/pull") {
            val user = call.requireAuthUser()
            val res = notionSyncService.pull(user.id)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }

        post("/push") {
            val user = call.requireAuthUser()
            val res = notionPushWorker.pushUserOutbox(user.id)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }
    }
}

fun Route.registerInternalCronRoutes(
    cronOidcVerifier: CronOidcVerifier?,
    notionPushWorker: NotionPushWorker,
    tierService: TierService,
    creditService: CreditService
) {
    // 매시 정각(Cloud Scheduler ulevelp-monthly-credits): 충전 시각이 지난 계정의 월 지급분 소멸 → 유료면 30일 주기 충전(M1-3d)
    post("/internal/cron/monthly-credits") {
        if (cronOidcVerifier == null) {
            throw UnauthorizedException("유효한 크론 OIDC 토큰이 아닙니다.")
        }
        cronOidcVerifier.verifyBearerHeader(call.request.header(HttpHeaders.Authorization))
        val res = creditService.runMonthlyGrant()
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(HttpStatusCode.OK, res)
    }

    // 매일 00:05 KST(Cloud Scheduler ulevelp-tier-expire): 기한 지난 tier_override 해제 + 다운그레이드 정리(M1-1 §1-3).
    // 크레딧 주기는 건드리지 않는다 — 무료가 된 계정의 남은 월 지급분은 주기 끝에 monthly-credits가 소멸(M1-3d)
    post("/internal/cron/tier-expire") {
        if (cronOidcVerifier == null) {
            throw UnauthorizedException("유효한 크론 OIDC 토큰이 아닙니다.")
        }
        cronOidcVerifier.verifyBearerHeader(call.request.header(HttpHeaders.Authorization))
        val res = tierService.expireOverrides()
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(HttpStatusCode.OK, res)
    }

    post("/internal/cron/notion-push") {
        if (cronOidcVerifier == null) {
            throw UnauthorizedException("유효한 크론 OIDC 토큰이 아닙니다.")
        }
        val authHeader = call.request.header(HttpHeaders.Authorization)
        cronOidcVerifier.verifyBearerHeader(authHeader)
        val res = notionPushWorker.runCronBatch()
        call.response.headers.append(HttpHeaders.CacheControl, "no-store")
        call.respond(HttpStatusCode.OK, res)
    }
}
