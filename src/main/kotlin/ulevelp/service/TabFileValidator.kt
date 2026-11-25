package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.text.Normalizer
import java.util.zip.ZipInputStream

/** TB-1 1차 허용 포맷(결과/TB-0 §0 R4). `ext`는 저장소 키 확장자이자 `songs.tab_format` 값 */
enum class TabFormat(val ext: String) {
    GP("gp"), XML("xml"), MXL("mxl");

    companion object {
        fun ofExtension(ext: String): TabFormat? = entries.firstOrNull { it.ext == ext }
    }
}

/**
 * TAB 업로드 파일 검증(TB-1 명세 §5.2). 순수 함수만 둔다(I/O·DB 없음).
 * 서버는 XML을 DOM/SAX로 파싱하지 않는다 — 앞부분 바이트와 ZIP 항목 이름만 본다(XXE·엔티티 폭탄 원천 차단).
 * 악보가 실제로 렌더되는지는 클라이언트 alphaTab이 판정한다.
 */
object TabFileValidator {
    const val MAX_FILE_BYTES = 10_485_760L          // 10MB (T2)
    const val MAX_REQUEST_BYTES = 11_534_336L       // 11MB (Content-Length 사전 거부·formFieldLimit)
    const val MAX_TEXT_PART_BYTES = 4_096L          // title·artist 파트
    const val MAX_ZIP_ENTRIES = 200
    const val MAX_UNZIPPED_BYTES = 52_428_800L      // 50MB (ZIP 폭탄 방어)
    const val MAX_FILE_NAME = 200
    private const val XML_SCAN_BYTES = 65_536
    private const val CONTAINER_MAX_BYTES = 65_536

    private const val GP_SCORE_ENTRY = "Content/score.gpif"
    private const val MXL_CONTAINER_ENTRY = "META-INF/container.xml"
    private val MXL_ROOTFILE = Regex("""<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']""")
    private val ROOT_ELEMENTS = setOf("score-partwise", "score-timewise")

    /** 표시용 파일 이름: 마지막 경로 조각, 제어·서식 문자 제거, NFC, 앞뒤 공백 제거, 200자(코드 포인트) 이내 */
    fun sanitizeFileName(raw: String?): String {
        val last = (raw ?: "").substringAfterLast('/').substringAfterLast('\\')
        val cleaned = buildString {
            last.codePoints().forEach { cp ->
                val type = Character.getType(cp)
                if (type != Character.CONTROL.toInt() && type != Character.FORMAT.toInt()) appendCodePoint(cp)
            }
        }
        val name = Normalizer.normalize(cleaned, Normalizer.Form.NFC).trim()
        if (name.isEmpty()) throw InvalidInputException("파일 이름이 필요합니다.")
        val count = name.codePointCount(0, name.length)
        if (count <= MAX_FILE_NAME) return name
        val dot = name.lastIndexOf('.')
        val ext = if (dot > 0) name.substring(dot) else ""
        val extCount = ext.codePointCount(0, ext.length)
        val keep = (MAX_FILE_NAME - extCount).coerceAtLeast(1)
        val base = if (dot > 0) name.substring(0, dot) else name
        val end = base.offsetByCodePoints(0, minOf(keep, base.codePointCount(0, base.length)))
        return base.substring(0, end).trimEnd() + ext
    }

    /** 확장자 없는 파일 이름(기본 제목) */
    fun baseName(fileName: String): String {
        val dot = fileName.lastIndexOf('.')
        return (if (dot > 0) fileName.substring(0, dot) else fileName).trim()
    }

    /** 확장자와 내용이 모두 맞아야 한다. 아니면 400 `TAB_FORMAT_INVALID`(detail.reason = extension | content) */
    fun detect(fileName: String, bytes: ByteArray): TabFormat {
        val dot = fileName.lastIndexOf('.')
        val ext = if (dot >= 0) fileName.substring(dot + 1).lowercase() else ""
        val format = TabFormat.ofExtension(ext) ?: throw invalid("extension", "지원하지 않는 파일 형식입니다. .gp, .xml, .mxl 파일만 올릴 수 있습니다.")
        val ok = when (format) {
            TabFormat.GP -> isZip(bytes) && zipCheck(bytes) { names, _ -> GP_SCORE_ENTRY in names }
            TabFormat.MXL -> isZip(bytes) && zipCheck(bytes, captureContainer = true) { names, container ->
                val path = container?.let { mxlRootPath(it) }
                path != null && path in names
            }
            TabFormat.XML -> !isZip(bytes) && isMusicXml(bytes)
        }
        if (!ok) throw invalid("content", "파일 내용이 ${format.ext} 형식이 아닙니다.")
        return format
    }

    private fun invalid(reason: String, message: String) = ApiException(
        HttpStatusCode.BadRequest,
        "TAB_FORMAT_INVALID",
        message,
        detail = buildJsonObject { put("reason", reason) }
    )

    private fun isZip(b: ByteArray) =
        b.size >= 4 && b[0] == 0x50.toByte() && b[1] == 0x4B.toByte() && b[2] == 0x03.toByte() && b[3] == 0x04.toByte()

    /**
     * ZIP을 끝까지 읽으며 항목 수·압축 해제 합계를 센다(풀어서 저장하지 않는다). 잘리거나 깨진 ZIP, 한도 초과,
     * `..`·절대 경로 항목이면 false. [check]에 항목 이름 집합과(요청 시) container.xml 내용을 넘긴다
     */
    private fun zipCheck(bytes: ByteArray, captureContainer: Boolean = false, check: (Set<String>, String?) -> Boolean): Boolean {
        val names = HashSet<String>()
        var container: String? = null
        var total = 0L
        val buf = ByteArray(8192)
        try {
            ZipInputStream(ByteArrayInputStream(bytes)).use { zin ->
                while (true) {
                    val entry = zin.nextEntry ?: break
                    val name = entry.name
                    if (names.size >= MAX_ZIP_ENTRIES) return false
                    if (name.startsWith("/") || name.startsWith("\\") || name.split('/', '\\').any { it == ".." }) return false
                    names.add(name)
                    val keep = captureContainer && name == MXL_CONTAINER_ENTRY
                    val captured = if (keep) java.io.ByteArrayOutputStream() else null
                    while (true) {
                        val n = zin.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_UNZIPPED_BYTES) return false
                        if (captured != null) {
                            if (captured.size() + n > CONTAINER_MAX_BYTES) return false
                            captured.write(buf, 0, n)
                        }
                    }
                    if (captured != null) container = captured.toString(Charsets.UTF_8)
                    zin.closeEntry()
                }
            }
        } catch (_: java.io.IOException) {
            return false
        } catch (_: IllegalArgumentException) {
            return false
        }
        if (names.isEmpty()) return false
        return check(names, container)
    }

    private fun mxlRootPath(container: String): String? {
        if (container.contains("<!DOCTYPE") || container.contains("<!ENTITY")) return null
        return MXL_ROOTFILE.find(container)?.groupValues?.get(1)
    }

    /** UTF-8(BOM 허용) 앞 64KB에서 첫 요소가 score-partwise/score-timewise인지. 내부 부분집합·ENTITY 거부 */
    private fun isMusicXml(bytes: ByteArray): Boolean {
        var start = 0
        if (bytes.size >= 2 && ((bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte()) || (bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte()))) {
            return false // UTF-16은 1차에서 받지 않는다
        }
        if (bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte()) start = 3
        var end = minOf(bytes.size, start + XML_SCAN_BYTES)
        if (end < bytes.size) {
            // 잘린 위치가 다중 바이트 문자 가운데면 그 문자 시작 앞으로 물린다
            while (end > start && (bytes[end].toInt() and 0xC0) == 0x80) end--
        }
        val text = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes, start, end - start))
                .toString()
        } catch (_: CharacterCodingException) {
            return false
        }
        return firstElementIsScore(text)
    }

    private fun firstElementIsScore(text: String): Boolean {
        var i = 0
        val n = text.length
        while (true) {
            while (i < n && text[i].isWhitespace()) i++
            if (i >= n) return false
            if (text[i] != '<') return false
            when {
                text.startsWith("<?", i) -> {
                    val e = text.indexOf("?>", i + 2); if (e < 0) return false; i = e + 2
                }
                text.startsWith("<!--", i) -> {
                    val e = text.indexOf("-->", i + 4); if (e < 0) return false; i = e + 3
                }
                text.startsWith("<!DOCTYPE", i) -> {
                    val e = text.indexOf('>', i); if (e < 0) return false
                    if (text.substring(i, e).contains('[')) return false // 내부 부분집합(엔티티 정의 자리) 거부
                    i = e + 1
                }
                text.startsWith("<!", i) -> return false // <!ENTITY 등
                else -> {
                    var j = i + 1
                    while (j < n && !text[j].isWhitespace() && text[j] != '>' && text[j] != '/') j++
                    return text.substring(i + 1, j) in ROOT_ELEMENTS
                }
            }
        }
    }
}
