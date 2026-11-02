package ulevelp.note

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

class GeminiApiException(
    val statusCode: Int,
    val code: String,
    override val message: String
) : RuntimeException(message)

data class GeminiGenerateResult(
    val analysis: JsonObject,
    val usageSummary: String
)

interface GeminiClient {
    suspend fun generateNoteAnalysis(
        apiKey: String,
        model: String,
        youtubeUrl: String,
        prompt: String,
        responseJsonSchema: JsonObject
    ): GeminiGenerateResult
}

class HttpGeminiClient(
    private val baseUrl: String = "https://generativelanguage.googleapis.com/v1beta",
    private val frameFps: Double = System.getenv("GEMINI_FRAME_FPS")?.toDoubleOrNull() ?: 0.2,
    private val maxAttempts: Int = 4,
    private val retryDelayBaseMs: Long = 30_000L,
    private val requestTimeout: Duration = Duration.ofMinutes(12),
    private val httpClient: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build()
) : GeminiClient {
    private val logger = LoggerFactory.getLogger(HttpGeminiClient::class.java)

    override suspend fun generateNoteAnalysis(
        apiKey: String,
        model: String,
        youtubeUrl: String,
        prompt: String,
        responseJsonSchema: JsonObject
    ): GeminiGenerateResult = withContext(Dispatchers.IO) {
        val requestUri = URI("$baseUrl/models/$model:generateContent")

        val requestPayload = buildJsonObject {
            putJsonArray("contents") {
                addJsonObject {
                    putJsonArray("parts") {
                        addJsonObject {
                            putJsonObject("file_data") {
                                put("file_uri", youtubeUrl)
                            }
                            putJsonObject("video_metadata") {
                                put("fps", frameFps)
                            }
                        }
                        addJsonObject {
                            put("text", prompt)
                        }
                    }
                }
            }
            putJsonObject("generationConfig") {
                put("responseMimeType", "application/json")
                put("responseJsonSchema", responseJsonSchema)
                put("mediaResolution", "MEDIA_RESOLUTION_LOW")
                putJsonObject("thinkingConfig") {
                    put("thinkingLevel", "LOW")
                }
            }
        }.toString()

        for (attempt in 1..maxAttempts) {
            val httpRequest = HttpRequest.newBuilder()
                .uri(requestUri)
                .timeout(requestTimeout)
                .header("x-goog-api-key", apiKey)
                .header("Content-Type", "application/json; charset=utf-8")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestPayload, StandardCharsets.UTF_8))
                .build()

            val response: HttpResponse<String> = try {
                httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                logger.warn("Gemini HTTP 요청 예외 (attempt {}/{}): {}", attempt, maxAttempts, e.message)
                if (attempt < maxAttempts) {
                    delay(retryDelayBaseMs * attempt)
                    continue
                } else {
                    throw GeminiApiException(500, "GEMINI_API_ERROR", "Gemini 분석 호출에 실패했습니다: ${e.message}")
                }
            }

            val status = response.statusCode()
            val body = response.body()

            if (status in setOf(429, 500, 503)) {
                logger.warn("Gemini 일시적 오류 HTTP {} (attempt {}/{}): {}", status, attempt, maxAttempts, body.take(200))
                if (attempt < maxAttempts) {
                    delay(retryDelayBaseMs * attempt)
                    continue
                } else {
                    throw GeminiApiException(status, "GEMINI_API_ERROR", "Gemini 분석 호출에 실패했습니다 (HTTP $status).")
                }
            }

            if (status in setOf(401, 403) || (status == 400 && body.contains("API_KEY_INVALID"))) {
                logger.warn("Gemini API 키 무효/거부 HTTP {}: {}", status, body.take(200))
                throw GeminiApiException(
                    status,
                    "PROVIDER_KEY_INVALID",
                    "PROVIDER_KEY_INVALID: Gemini API 키가 유효하지 않거나 요청이 거부되었습니다 (HTTP $status)."
                )
            }

            if (status == 400) {
                logger.warn("Gemini 일반 400 오류: {}", body.take(200))
                throw GeminiApiException(400, "GEMINI_API_ERROR", "Gemini 분석 호출에 실패했습니다 (HTTP 400).")
            }

            if (status != 200) {
                logger.warn("Gemini 비정상 응답 HTTP {}: {}", status, body.take(200))
                throw GeminiApiException(status, "GEMINI_API_ERROR", "Gemini 분석 호출에 실패했습니다 (HTTP $status).")
            }

            // 200 OK 파싱
            return@withContext parseGeminiResponse(body)
        }

        throw GeminiApiException(500, "GEMINI_API_ERROR", "Gemini 분석 호출에 실패했습니다.")
    }

    private fun parseGeminiResponse(body: String): GeminiGenerateResult {
        val root = try {
            Json.parseToJsonElement(body).jsonObject
        } catch (e: Exception) {
            throw GeminiApiException(500, "GEMINI_API_ERROR", "Gemini 응답 JSON 파싱 실패: ${e.message}")
        }

        val candidates = root["candidates"]?.jsonArray
        val candidate = candidates?.firstOrNull()?.jsonObject
            ?: throw GeminiApiException(500, "GEMINI_API_ERROR", "Gemini 응답에 candidates가 없습니다.")

        val parts = candidate["content"]?.jsonObject?.get("parts")?.jsonArray
            ?: throw GeminiApiException(500, "GEMINI_API_ERROR", "Gemini 응답에 content.parts가 없습니다.")

        val nonThoughtParts = parts.filter { part ->
            part.jsonObject["thought"]?.jsonPrimitive?.booleanOrNull != true
        }

        val textPart = nonThoughtParts.lastOrNull { it.jsonObject["text"] != null }
            ?: throw GeminiApiException(500, "GEMINI_API_ERROR", "Gemini 응답에 텍스트 본문이 없습니다.")

        val textStr = textPart.jsonObject["text"]?.jsonPrimitive?.contentOrNull
            ?: throw GeminiApiException(500, "GEMINI_API_ERROR", "Gemini 응답 텍스트가 비어 있습니다.")

        val analysis = try {
            Json.parseToJsonElement(textStr).jsonObject
        } catch (e: Exception) {
            throw GeminiApiException(500, "GEMINI_API_ERROR", "Gemini 추출 데이터 JSON 파싱 실패: ${e.message}")
        }

        val usage = root["usageMetadata"]?.toString() ?: ""
        return GeminiGenerateResult(analysis = analysis, usageSummary = usage)
    }
}

