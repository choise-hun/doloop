package ulevelp

import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.testing.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import kotlin.test.*

class MobileOriginCorsTest {
    private val web = "https://ulevelp-d5ympfsmfq-du.a.run.app"
    private val mobile = listOf("capacitor://localhost", "https://localhost")

    @Test
    fun `C1 mobile preflight accepts bearer json and locale without authentication`() = testApplication {
        application { module(dbConfig = null, authConfig = null, allowedOrigins = listOf(web) + mobile) }
        for (origin in mobile) {
            val response = client.options("/api/v1/me") {
                header(HttpHeaders.Origin, origin)
                header(HttpHeaders.AccessControlRequestMethod, "PATCH")
                header(HttpHeaders.AccessControlRequestHeaders, "authorization,content-type,accept-language")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            assertEquals(origin, response.headers[HttpHeaders.AccessControlAllowOrigin])
            assertTrue(response.headers[HttpHeaders.AccessControlAllowMethods].orEmpty().contains("PATCH"))
        }
    }

    @Test
    fun `C2 mobile normal and authentication errors expose origin and filename`() = testApplication {
        application { module(dbConfig = null, authConfig = null, allowedOrigins = listOf(web) + mobile) }
        for (origin in mobile) {
            val health = client.get("/api/health") { header(HttpHeaders.Origin, origin) }
            assertEquals(HttpStatusCode.OK, health.status)
            assertEquals(origin, health.headers[HttpHeaders.AccessControlAllowOrigin])
            assertTrue(health.headers[HttpHeaders.AccessControlExposeHeaders].orEmpty().lowercase().contains("content-disposition"))
            val me = client.get("/api/v1/me") { header(HttpHeaders.Origin, origin) }
            assertEquals(HttpStatusCode.Unauthorized, me.status)
            assertEquals(origin, me.headers[HttpHeaders.AccessControlAllowOrigin])
            val missing = client.get("/api/v1/no-such-route") { header(HttpHeaders.Origin, origin) }
            assertEquals(HttpStatusCode.NotFound, missing.status)
            assertEquals(origin, missing.headers[HttpHeaders.AccessControlAllowOrigin])
        }
    }

    @Test
    fun `C3 mobile origins require explicit allowlist and exact match`() = testApplication {
        var hits = 0
        application {
            module(dbConfig = null, authConfig = null, allowedOrigins = listOf(web) + mobile)
            routing { patch("/mobile-side-effect-probe") { hits++; call.respond(HttpStatusCode.OK) } }
        }
        for (origin in listOf("null", "http://localhost", "https://localhost:443", "https://localhost:3000",
            "capacitor://localhost.evil", "capacitor://LOCALHOST", "http://127.0.0.1")) {
            // Invalid JSON would reach a parser or authentication error if the route ran.
            val response = client.patch("/mobile-side-effect-probe") {
                header(HttpHeaders.Host, "api.example.test")
                header(HttpHeaders.Origin, origin)
                contentType(ContentType.Application.Json)
                setBody("invalid-json")
            }
            assertEquals(HttpStatusCode.Forbidden, response.status, origin)
            assertNull(response.headers[HttpHeaders.AccessControlAllowOrigin], origin)
            assertEquals(0, hits, "CORS denial must not execute side effects")
        }
    }

    @Test
    fun `C3 defaults do not silently permit mobile origins`() = testApplication {
        application { module(dbConfig = null, authConfig = null, allowedOrigins = listOf(web)) }
        for (origin in mobile) {
            val response = client.get("/api/health") { header(HttpHeaders.Origin, origin) }
            assertEquals(HttpStatusCode.Forbidden, response.status)
            assertNull(response.headers[HttpHeaders.AccessControlAllowOrigin])
        }
    }
}
