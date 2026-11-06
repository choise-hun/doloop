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

interface VideoDurationClient {
    /**
     * 영상 길이(초). 라이브 등 길이가 없으면 0.
     * 오류는 ApiException: 키 없음 503 `YOUTUBE_UNAVAILABLE`, 없음·비공개 404 `VIDEO_NOT_FOUND`, 그 밖 502 `YOUTUBE_API_ERROR`
     */
    suspend fun durationSec(videoId: String): Int
}

/**
 * YouTube Data API v3 `videos.list?part=contentDetails` — 구간 없는 분석 요청의 크레딧 예약에 쓴다(M1-1 A12).
 * 키는 재생목록과 같은 env `YOUTUBE_DATA_API_KEY`
 */
class YoutubeDataVideoClient(
    private val apiKey: String? = System.getenv("YOUTUBE_DATA_API_KEY")?.takeIf { it.isNotBlank() },
    private val endpoint: String = "https://www.googleapis.com/youtube/v3",
    private val timeout: Duration = Duration.ofSeconds(5),
    private val httpClient: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
) : VideoDurationClient {
    private val logger = LoggerFactory.getLogger(YoutubeDataVideoClient::class.java)

    override suspend fun durationSec(videoId: String): Int = withContext(Dispatchers.IO) {
        val key = apiKey ?: throw YoutubeDataPlaylistClient.youtubeUnavailable()
        val query = mapOf("part" to "contentDetails", "id" to videoId, "key" to key).entries.joinToString("&") { (k, v) ->
            "$k=" + URLEncoder.encode(v, StandardCharsets.UTF_8)
        }
        val request = HttpRequest.newBuilder()
            .uri(URI("$endpoint/videos?$query"))
            .timeout(timeout)
            .header("Accept", "application/json")
            .GET()
            .build()
        val response = try {
            httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)).await()
        } catch (e: java.io.IOException) {
            logger.warn("YouTube videos 호출 실패: {}", e.message)
            throw YoutubeDataPlaylistClient.youtubeApiError()
        }
        val body = runCatching { Json.parseToJsonElement(response.body()).jsonObject }.getOrNull()
        if (response.statusCode() != 200 || body == null) {
            // 키 값이 로그에 남지 않게 상태·reason만 적는다
            val reason = body?.get("error")?.jsonObject?.get("errors")?.jsonArray
                ?.firstOrNull()?.jsonObject?.get("reason")?.jsonPrimitive?.contentOrNull
            logger.warn("YouTube videos 오류: HTTP {} reason={}", response.statusCode(), reason)
            throw YoutubeDataPlaylistClient.youtubeApiError()
        }
        val iso = body["items"]?.jsonArray?.firstOrNull()?.jsonObject
            ?.get("contentDetails")?.jsonObject?.get("duration")?.jsonPrimitive?.contentOrNull
            ?: throw videoNotFound()
        parseIsoDurationSec(iso)
    }

    companion object {
        /** `PT8M11S` → 491, `P0D`(라이브) → 0, 읽을 수 없으면 0 */
        fun parseIsoDurationSec(iso: String): Int =
            runCatching { Duration.parse(iso).seconds }.getOrDefault(0L).coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()

        fun videoNotFound() = ApiException(
            HttpStatusCode.NotFound, "VIDEO_NOT_FOUND", "영상을 찾을 수 없습니다. 공개 또는 일부 공개 영상인지 확인해 주세요."
        )
    }
}
