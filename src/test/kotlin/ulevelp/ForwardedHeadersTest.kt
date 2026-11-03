package ulevelp

import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlin.test.*

class ForwardedHeadersTest {
    @Test
    fun `Z7 Cloud Run 프록시 뒤 같은 출처 요청은 CORS로 막지 않는다`() = testApplication {
        application {
            module(dbConfig = null, authConfig = null, allowedOrigins = listOf("https://choise-hun.github.io"))
        }
        // Cloud Run은 TLS를 끝내고 컨테이너에 http로 넘기며 X-Forwarded-Proto: https만 붙인다.
        // 브라우저는 같은 출처라도 POST·PUT·DELETE엔 Origin을 보낸다. CORS 판정은 메서드와 무관하므로
        // 인증 플러그인이 끼지 않는 /api/health로 본다(테스트 엔진에선 인증 401이 CORS 403을 덮어쓴다)
        val runApp = "ulevelp-d5ympfsmfq-du.a.run.app"
        suspend fun behindCloudRun(origin: String, block: HttpRequestBuilder.() -> Unit = {}) =
            client.get("/api/health") {
                header(HttpHeaders.Host, runApp)
                header(HttpHeaders.XForwardedProto, "https")
                header(HttpHeaders.Origin, origin)
                block()
            }.status

        assertEquals(HttpStatusCode.OK, behindCloudRun("https://$runApp"), "같은 출처가 CORS 403")
        assertEquals(HttpStatusCode.Forbidden, behindCloudRun("https://evil.example.com"), "다른 출처는 계속 거부")
        // X-Forwarded-Host는 믿지 않는다(위조로 같은 출처처럼 보이게 할 수 없어야 한다)
        assertEquals(
            HttpStatusCode.Forbidden,
            behindCloudRun("https://evil.example.com") { header(HttpHeaders.XForwardedHost, "evil.example.com") },
            "X-Forwarded-Host 위조"
        )
    }
}
