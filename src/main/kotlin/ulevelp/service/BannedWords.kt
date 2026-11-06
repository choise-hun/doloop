package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ulevelp.api.ApiException
import java.text.Normalizer

/**
 * 커뮤니티 공개 글자 금칙어 (M1-4a, N1·N2). 목록은 `resources/moderation/banned_words.txt`.
 * 입력·단어 모두 NFKC → 소문자 → 글자·숫자만 남겨 "포함"으로 본다 — 띄어쓰기·기호(`f.u.c.k`)로 돌아가지 못하게
 */
object BannedWords {
    private const val RESOURCE = "/moderation/banned_words.txt"

    private val words: List<String> by lazy {
        val text = BannedWords::class.java.getResourceAsStream(RESOURCE)
            ?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            ?: error("금칙어 목록($RESOURCE)이 없습니다.")
        text.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .map { normalize(it) }
            .filter { it.isNotEmpty() }
            .distinct()
            .toList()
    }

    fun normalize(raw: String): String =
        Normalizer.normalize(raw, Normalizer.Form.NFKC).lowercase().filter { it.isLetterOrDigit() }

    fun contains(text: String): Boolean {
        val n = normalize(text)
        return n.isNotEmpty() && words.any { n.contains(it) }
    }

    /** 금칙어가 있으면 400 `BANNED_WORD` `detail{field}` */
    fun require(field: String, text: String) {
        if (contains(text)) {
            throw ApiException(
                status = HttpStatusCode.BadRequest,
                code = "BANNED_WORD",
                message = "커뮤니티에 공개할 수 없는 단어가 들어 있습니다.",
                detail = buildJsonObject { put("field", field) }
            )
        }
    }
}
