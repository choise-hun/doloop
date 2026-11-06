package ulevelp.routes

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import ulevelp.api.InvalidInputException
import ulevelp.api.receiveJsonObject
import ulevelp.api.requireString
import ulevelp.auth.SupabaseAuthPlugin
import ulevelp.auth.SupabaseJwtVerifier
import ulevelp.auth.requireAuthUser
import ulevelp.service.CreditService
import ulevelp.service.ExportImportService
import ulevelp.service.NoteService
import ulevelp.service.ProfileService

/** 크레딧 조회·예상 (`개발산출물/결과/M1-1_스키마설계.md` §5-4). 차감·반환은 분석 작업이 한다 */
fun Route.registerCreditRoutes(
    jwtVerifier: SupabaseJwtVerifier?,
    profileService: ProfileService,
    creditService: CreditService
) {
    route("/credits") {
        install(SupabaseAuthPlugin) {
            this.jwtVerifier = jwtVerifier
            this.profileService = profileService
        }

        get {
            val user = call.requireAuthUser()
            val res = creditService.summary(user.id)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }

        get("/ledger") {
            val user = call.requireAuthUser()
            val params = call.request.queryParameters
            val before = params["before"]?.let {
                it.toLongOrNull()?.takeIf { v -> v > 0 } ?: throw InvalidInputException("before는 양의 정수여야 합니다.")
            }
            val limit = params["limit"]?.let {
                it.toIntOrNull()?.takeIf { v -> v in 1..CreditService.MAX_LEDGER_LIMIT }
                    ?: throw InvalidInputException("limit은 1~${CreditService.MAX_LEDGER_LIMIT} 사이여야 합니다.")
            } ?: CreditService.DEFAULT_LEDGER_LIMIT
            val res = creditService.ledger(user.id, before, limit)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }

        // `{kind, url, startSec?, endSec?, pace?}` → `{estimatedCredits, reserveCredits}` (M2-1 "예상 소모 크레딧" 배지)
        post("/estimate") {
            call.requireAuthUser()
            val body = call.receiveJsonObject()
            val kind = body.requireString("kind", 20)
            if (kind !in NoteService.JOB_KINDS) {
                throw InvalidInputException("kind는 note 또는 progression이어야 합니다.")
            }
            val url = body.requireString("url", 500)
            val videoId = ExportImportService.extractVideoId(url)
                ?: throw InvalidInputException("올바른 유튜브 영상 주소가 아닙니다.")
            // 분석 요청과 같은 파싱: 노트는 구간만(속도 무시, M2-1s S-D3), 코드 진행은 구간·속도
            val options = if (kind == NoteService.JOB_KIND_PROGRESSION) parseAnalyzeOptions(body) else parseNoteRangeOptions(body)
            val res = creditService.estimate(kind, videoId, options)
            call.response.headers.append(HttpHeaders.CacheControl, "no-store")
            call.respond(HttpStatusCode.OK, res)
        }
    }
}
