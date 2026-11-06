package ulevelp.service

import io.ktor.http.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.future.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import ulevelp.api.ApiException
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

/** 재생목록 항목. available=false = 비공개·삭제 영상(가져오기에서 skippedUnavailable) */
data class PlaylistItem(val videoId: String, val title: String, val channel: String, val available: Boolean)

/** items는 재생목록 순서. 가져온 항목 수가 itemCount보다 적을 수 있다(maxItems 상한) */
data class YoutubePlaylist(val id: String, val title: String, val itemCount: Int, val items: List<PlaylistItem>)

interface PlaylistClient {
    /**
     * 재생목록 제목·항목 수 + 앞 [maxItems]개 항목(0이면 항목은 안 가져온다).
     * 오류는 ApiException: 키 없음 503 `YOUTUBE_UNAVAILABLE`, 없음·비공개 404 `PLAYLIST_NOT_FOUND`, 그 밖 502 `YOUTUBE_API_ERROR`
     */
    suspend fun fetch(playlistId: String, maxItems: Int): YoutubePlaylist
}

/** YouTube Data API v3 (`playlists`·`playlistItems`). 키는 env `YOUTUBE_DATA_API_KEY`(Secret Manager 같은 이름) */
class YoutubeDataPlaylistClient(
    private val apiKey: String? = System.getenv("YOUTUBE_DATA_API_KEY")?.takeIf { it.isNotBlank() },
    private val endpoint: String = "https://www.googleapis.com/youtube/v3",
    private val timeout: Duration = Duration.ofSeconds(5),
    private val httpClient: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
) : PlaylistClient {
    private val logger = LoggerFactory.getLogger(YoutubeDataPlaylistClient::class.java)

    override suspend fun fetch(playlistId: String, maxItems: Int): YoutubePlaylist {
        val key = apiKey ?: throw youtubeUnavailable()

        val meta = get("playlists", mapOf("part" to "snippet,contentDetails", "id" to playlistId), key)
        val first = meta["items"]?.jsonArray?.firstOrNull()?.jsonObject ?: throw playlistNotFound()
        val title = first["snippet"]?.jsonObject?.str("title")?.trim().orEmpty()
        val itemCount = first["contentDetails"]?.jsonObject?.get("itemCount")?.jsonPrimitive?.intOrNull ?: 0

        val items = mutableListOf<PlaylistItem>()
        var pageToken: String? = null
        while (items.size < maxItems) {
            val params = mutableMapOf(
                "part" to "snippet,status",
                "playlistId" to playlistId,
                "maxResults" to "50"
            )
            pageToken?.let { params["pageToken"] = it }
            val page = get("playlistItems", params, key)
            page["items"]?.jsonArray?.forEach { el ->
                if (items.size < maxItems) items.add(parseItem(el.jsonObject))
            }
            pageToken = page.str("nextPageToken") ?: break
        }
        return YoutubePlaylist(playlistId, title, itemCount, items)
    }

    private fun parseItem(obj: JsonObject): PlaylistItem {
        val snippet = obj["snippet"]?.jsonObject
        val videoId = snippet?.get("resourceId")?.jsonObject?.str("videoId").orEmpty()
        val privacy = obj["status"]?.jsonObject?.str("privacyStatus")
        // 비공개·삭제 영상은 videoOwnerChannelTitle이 없고 privacyStatus가 private/privacyStatusUnspecified
        val channel = snippet?.str("videoOwnerChannelTitle")
        val available = SongService.VIDEO_ID_REGEX.matches(videoId) && channel != null &&
            privacy != "private" && privacy != "privacyStatusUnspecified"
        return PlaylistItem(
            videoId = videoId,
            title = snippet?.str("title")?.trim().orEmpty().take(300),
            channel = channel?.trim().orEmpty().take(200),
            available = available
        )
    }

    private suspend fun get(resource: String, params: Map<String, String>, key: String): JsonObject = withContext(Dispatchers.IO) {
        val query = (params + ("key" to key)).entries.joinToString("&") { (k, v) ->
            "$k=" + URLEncoder.encode(v, StandardCharsets.UTF_8)
        }
        val request = HttpRequest.newBuilder()
            .uri(URI("$endpoint/$resource?$query"))
            .timeout(timeout)
            .header("Accept", "application/json")
            .GET()
            .build()
        val response = try {
            httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)).await()
        } catch (e: java.io.IOException) {
            logger.warn("YouTube {} 호출 실패: {}", resource, e.message)
            throw youtubeApiError()
        }
        val body = runCatching { Json.parseToJsonElement(response.body()).jsonObject }.getOrNull()
        if (response.statusCode() == 200 && body != null) return@withContext body

        // 키 값이 로그에 남지 않게 resource·상태·reason만 적는다
        val reason = body?.get("error")?.jsonObject?.get("errors")?.jsonArray
            ?.firstOrNull()?.jsonObject?.str("reason")
        logger.warn("YouTube {} 오류: HTTP {} reason={}", resource, response.statusCode(), reason)
        if (response.statusCode() == 404 || reason == "playlistNotFound") throw playlistNotFound()
        throw youtubeApiError()
    }

    private fun JsonObject.str(name: String): String? =
        (this[name] as? JsonPrimitive)?.takeIf { it.isString }?.content

    companion object {
        fun youtubeUnavailable() = ApiException(
            HttpStatusCode.ServiceUnavailable, "YOUTUBE_UNAVAILABLE", "YouTube 연동이 설정되어 있지 않습니다."
        )

        fun playlistNotFound() = ApiException(
            HttpStatusCode.NotFound, "PLAYLIST_NOT_FOUND", "재생목록을 찾을 수 없습니다. 공개 또는 일부 공개 재생목록인지 확인해 주세요."
        )

        fun youtubeApiError() = ApiException(
            HttpStatusCode.BadGateway, "YOUTUBE_API_ERROR", "YouTube에서 재생목록을 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요."
        )
    }
}
