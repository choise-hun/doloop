package ulevelp.service

/**
 * 서버 언어 규칙 (L1-1, `계획/상용_서비스_계획.md` §3-4). 서버가 언어를 쓰는 곳은
 * 첫 가입 기본값(`profiles.locale`)과 Gemini 프롬프트뿐 — API 응답은 언어와 무관(화면 사전이 번역)
 */
object Locales {
    /** `profiles.locale` CHECK(V5)와 같다. NULL = 아직 고르지 않음(화면 자동, 서버는 ko) */
    val SUPPORTED: Set<String> = setOf("ko", "en", "ja")

    const val DEFAULT: String = "ko"

    /** 헤더가 비정상적으로 길 때 앞쪽만 본다 */
    private const val MAX_ENTRIES = 32

    /**
     * `Accept-Language`(RFC 9110)에서 지원 언어 첫 번째를 고른다. q 내림차순, 같은 q는 앞에 적힌 것 우선.
     * q가 없으면 1, 숫자가 아니거나 0 이하·1 초과면 그 항목을 버린다. `ko-KR`처럼 첫 부분만 본다. 없으면 null
     */
    fun parseAcceptLanguage(header: String?): String? {
        if (header.isNullOrBlank()) return null
        return header.split(',')
            .asSequence()
            .take(MAX_ENTRIES)
            .mapNotNull { entry ->
                val parts = entry.split(';')
                val primary = parts[0].trim().substringBefore('-').lowercase()
                if (primary !in SUPPORTED) return@mapNotNull null
                val qParam = parts.drop(1).map { it.trim() }.firstOrNull { it.startsWith("q=", ignoreCase = true) }
                val q = if (qParam == null) 1.0 else qParam.substring(2).trim().toDoubleOrNull()
                if (q == null || q <= 0.0 || q > 1.0) null else primary to q
            }
            .toList()
            .sortedByDescending { it.second } // 안정 정렬 — 같은 q는 원래 순서
            .firstOrNull()
            ?.first
    }
}
