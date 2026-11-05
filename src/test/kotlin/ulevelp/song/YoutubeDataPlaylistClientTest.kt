package ulevelp.song

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.api.ApiException
import ulevelp.service.YoutubeDataPlaylistClient
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** YouTube Data API 응답 파싱 — 로컬 HttpServer가 YouTube 흉내 (실제 호출 없음) */
class YoutubeDataPlaylistClientTest {

    private lateinit var server: HttpServer
    private val queries = CopyOnWriteArrayList<String>()
    private var handler: (path: String, query: String) -> Pair<Int, String> = { _, _ -> 500 to "{}" }

    @BeforeEach
    fun setUp() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/yt") { ex ->
            val path = ex.requestURI.path.removePrefix("/yt/")
            val query = ex.requestURI.rawQuery.orEmpty()
            queries.add("$path?$query")
            val (status, body) = handler(path, query)
            val bytes = body.toByteArray()
            ex.sendResponseHeaders(status, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        server.start()
    }

    @AfterEach
    fun tearDown() = server.stop(0)

    private fun client(key: String? = "K") =
        YoutubeDataPlaylistClient(apiKey = key, endpoint = "http://127.0.0.1:${server.address.port}/yt")

    private fun item(videoId: String, title: String, channel: String?, privacy: String) = """
        {"snippet":{"title":"$title",${channel?.let { "\"videoOwnerChannelTitle\":\"$it\"," } ?: ""}
          "resourceId":{"kind":"youtube#video","videoId":"$videoId"}},"status":{"privacyStatus":"$privacy"}}
    """

    @Test
    fun `YP1 제목·항목 수·페이지 넘김·비공개·삭제 판별`() = runTest {
        handler = { path, query ->
            when {
                path == "playlists" -> 200 to """{"items":[{"snippet":{"title":" 연습 "},"contentDetails":{"itemCount":4}}]}"""
                "pageToken=P2" in query -> 200 to """{"items":[${item("ccccccccccc", "Deleted video", null, "privacyStatusUnspecified")},${item("ddddddddddd", "D", "Ch D", "unlisted")}]}"""
                else -> 200 to """{"nextPageToken":"P2","items":[${item("aaaaaaaaaaa", "A", "Ch A", "public")},${item("bbbbbbbbbbb", "Private video", null, "private")}]}"""
            }
        }
        val p = client().fetch("PLx", maxItems = 500)
        assertEquals("연습", p.title)
        assertEquals(4, p.itemCount)
        assertEquals(listOf("aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"), p.items.map { it.videoId })
        assertEquals(listOf(true, false, false, true), p.items.map { it.available })
        assertEquals("Ch A", p.items[0].channel)
        assertTrue(queries.all { "key=K" in it })
        assertTrue(queries.any { it.startsWith("playlistItems?") && "playlistId=PLx" in it && "maxResults=50" in it })
    }

    @Test
    fun `YP2 미리보기(maxItems 0)는 playlists만 부른다, maxItems에서 멈춘다`() = runTest {
        handler = { path, _ ->
            if (path == "playlists") 200 to """{"items":[{"snippet":{"title":"T"},"contentDetails":{"itemCount":99}}]}"""
            else 200 to """{"nextPageToken":"again","items":[${item("aaaaaaaaaaa", "A", "C", "public")}]}"""
        }
        assertTrue(client().fetch("PLx", 0).items.isEmpty())
        assertEquals(1, queries.size)
        assertEquals(3, client().fetch("PLx", 3).items.size)
    }

    @Test
    fun `YP3 오류 - 키 없음 503, 없는 재생목록 404, 쿼터·키 오류 502`() = runTest {
        assertEquals("YOUTUBE_UNAVAILABLE", assertFailsWith<ApiException> { client(key = null).fetch("PLx", 0) }.code)
        assertTrue(queries.isEmpty())

        handler = { _, _ -> 200 to """{"items":[]}""" }
        assertEquals("PLAYLIST_NOT_FOUND", assertFailsWith<ApiException> { client().fetch("PLx", 0) }.code)

        handler = { path, _ ->
            if (path == "playlists") 200 to """{"items":[{"snippet":{"title":"T"},"contentDetails":{"itemCount":1}}]}"""
            else 404 to """{"error":{"errors":[{"reason":"playlistNotFound"}]}}"""
        }
        assertEquals("PLAYLIST_NOT_FOUND", assertFailsWith<ApiException> { client().fetch("PLx", 10) }.code)

        handler = { _, _ -> 403 to """{"error":{"errors":[{"reason":"quotaExceeded"}]}}""" }
        val e = assertFailsWith<ApiException> { client().fetch("PLx", 0) }
        assertEquals("YOUTUBE_API_ERROR", e.code)
        assertEquals(502, e.status.value)
        assertFalse("K" in e.message, "키 값은 메시지에 없다")
    }
}
