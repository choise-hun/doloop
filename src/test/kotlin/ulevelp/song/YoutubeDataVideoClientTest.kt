package ulevelp.song

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.api.ApiException
import ulevelp.service.YoutubeDataVideoClient
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** M1-3b: `videos.list?part=contentDetails` 길이 파싱 — 로컬 HttpServer가 YouTube 흉내 (실제 호출 없음) */
class YoutubeDataVideoClientTest {

    private lateinit var server: HttpServer
    private val queries = CopyOnWriteArrayList<String>()
    private var handler: () -> Pair<Int, String> = { 500 to "{}" }

    @BeforeEach
    fun setUp() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/yt") { ex ->
            queries.add(ex.requestURI.path + "?" + ex.requestURI.rawQuery.orEmpty())
            val (status, body) = handler()
            val bytes = body.toByteArray()
            ex.sendResponseHeaders(status, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        server.start()
    }

    @AfterEach
    fun tearDown() = server.stop(0)

    private fun client(key: String? = "test-key") =
        YoutubeDataVideoClient(apiKey = key, endpoint = "http://127.0.0.1:${server.address.port}/yt")

    private fun items(duration: String) = """{"items":[{"id":"oWQZopUx0fA","contentDetails":{"duration":"$duration"}}]}"""

    @Test
    fun `길이 ISO 8601 → 초, 요청은 videos contentDetails`() = runTest {
        handler = { 200 to items("PT8M11S") }
        assertEquals(491, client().durationSec("oWQZopUx0fA"))
        assertTrue(queries.single().startsWith("/yt/videos?part=contentDetails&id=oWQZopUx0fA&key=test-key"), queries.single())

        handler = { 200 to items("PT17M8S") }
        assertEquals(1028, client().durationSec("oWQZopUx0fA"))
        handler = { 200 to items("PT1H2M3S") }
        assertEquals(3723, client().durationSec("oWQZopUx0fA"))
        handler = { 200 to items("P0D") } // 라이브
        assertEquals(0, client().durationSec("oWQZopUx0fA"))
        assertEquals(0, YoutubeDataVideoClient.parseIsoDurationSec("garbage"))
    }

    @Test
    fun `없는 영상 404·키 없음 503·YouTube 오류 502`() = runTest {
        handler = { 200 to """{"items":[]}""" }
        assertEquals("VIDEO_NOT_FOUND", assertFailsWith<ApiException> { client().durationSec("x0000000000") }.code)

        assertEquals("YOUTUBE_UNAVAILABLE", assertFailsWith<ApiException> { client(key = null).durationSec("x0000000000") }.code)

        handler = { 403 to """{"error":{"errors":[{"reason":"quotaExceeded"}]}}""" }
        val ex = assertFailsWith<ApiException> { client().durationSec("x0000000000") }
        assertEquals("YOUTUBE_API_ERROR", ex.code)
        assertEquals(502, ex.status.value)
    }
}
