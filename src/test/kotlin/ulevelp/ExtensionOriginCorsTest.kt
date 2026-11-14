package ulevelp

import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlin.test.*

/**
 * EX-1 V1 / TC-EX-01: 크롬 확장 출처(chrome-extension://<ID>)의 요청은
 * ALLOWED_ORIGINS에 없으면 403, 넣으면 CORS를 통과한다. 서버 코드는 바꾸지 않는다(환경 변수만).
 */
class ExtensionOriginCorsTest {
    private val extensionOrigin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
    private val webOrigin = "https://ulevelp-d5ympfsmfq-du.a.run.app"

    @Test
    fun `EX-1 허용 목록에 없는 확장 출처는 403`() = testApplication {
        application { module(dbConfig = null, authConfig = null, allowedOrigins = listOf(webOrigin)) }

        val get = client.get("/api/health") { header(HttpHeaders.Origin, extensionOrigin) }
        assertEquals(HttpStatusCode.Forbidden, get.status, "GET")
        val post = client.post("/api/v1/songs") { header(HttpHeaders.Origin, extensionOrigin) }
        assertEquals(HttpStatusCode.Forbidden, post.status, "POST")
    }

    @Test
    fun `EX-1 ALLOWED_ORIGINS에 넣은 확장 출처는 CORS를 통과한다`() = testApplication {
        // 운영 환경 변수와 같은 형식의 문자열을 실제 파서로 읽는다
        val origins = parseAllowedOrigins("$webOrigin, $extensionOrigin")
        application { module(dbConfig = null, authConfig = null, allowedOrigins = origins) }

        val get = client.get("/api/health") { header(HttpHeaders.Origin, extensionOrigin) }
        assertEquals(HttpStatusCode.OK, get.status, "GET")
        assertEquals(extensionOrigin, get.headers[HttpHeaders.AccessControlAllowOrigin], "ACAO")

        // 사전 요청(Authorization·Content-Type이 붙는 POST)
        val preflight = client.options("/api/v1/songs") {
            header(HttpHeaders.Origin, extensionOrigin)
            header(HttpHeaders.AccessControlRequestMethod, "POST")
            header(HttpHeaders.AccessControlRequestHeaders, "authorization,content-type")
        }
        assertEquals(HttpStatusCode.OK, preflight.status, "preflight")
        assertEquals(extensionOrigin, preflight.headers[HttpHeaders.AccessControlAllowOrigin], "preflight ACAO")

        // 본 요청: CORS에서 막히지 않고 라우트(인증 단계)까지 간다
        val post = client.post("/api/v1/songs") {
            header(HttpHeaders.Origin, extensionOrigin)
            contentType(ContentType.Application.Json)
            setBody("""{"videoId":"dQw4w9WgXcQ"}""")
        }
        assertNotEquals(HttpStatusCode.Forbidden, post.status, "POST가 CORS 403")

        // 다른 확장 ID는 계속 거부
        val other = client.get("/api/health") {
            header(HttpHeaders.Origin, "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba")
        }
        assertEquals(HttpStatusCode.Forbidden, other.status, "다른 확장 ID")
    }
}
