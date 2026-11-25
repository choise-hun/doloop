package ulevelp.song

import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.service.TabFileValidator
import ulevelp.service.TabFormat
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** TB-1 명세 §5.2 판정(TB1-U3·U4의 바이트 단위 검사) */
class TabFileValidatorTest {
    private fun fixture(name: String): ByteArray =
        requireNotNull(javaClass.getResourceAsStream("/tab/$name")) { "fixture $name" }.readBytes()

    private fun zip(vararg entries: Pair<String, ByteArray>): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            for ((name, body) in entries) {
                z.putNextEntry(ZipEntry(name)); z.write(body); z.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private fun reason(name: String, bytes: ByteArray): String {
        val e = assertFailsWith<ApiException> { TabFileValidator.detect(name, bytes) }
        assertEquals("TAB_FORMAT_INVALID", e.code)
        assertEquals(400, e.status.value)
        return e.detail!!["reason"]!!.jsonPrimitive.content
    }

    private val container = """<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>""".toByteArray()
    private val minimalXml = """<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>""".toByteArray()

    @Test
    fun `정상 3종은 형식을 돌려준다`() {
        assertEquals(TabFormat.GP, TabFileValidator.detect("A.gp", fixture("A.gp")))
        assertEquals(TabFormat.XML, TabFileValidator.detect("B.xml", fixture("B.xml")))
        assertEquals(TabFormat.MXL, TabFileValidator.detect("B.mxl", fixture("B.mxl")))
        assertEquals(TabFormat.GP, TabFileValidator.detect("UPPER.GP", fixture("A.gp")))
        // BOM·주석·timewise
        val bom = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + "<!-- c --><score-timewise/>".toByteArray()
        assertEquals(TabFormat.XML, TabFileValidator.detect("t.xml", bom))
    }

    @Test
    fun `허용 목록 밖 확장자는 extension`() {
        for (n in listOf("a.gp5", "a.gpx", "a.gp3", "a.txt", "noext", "a.gp.zip")) {
            assertEquals("extension", reason(n, fixture("A.gp")), n)
        }
    }

    @Test
    fun `내용이 확장자와 맞지 않으면 content`() {
        assertEquals("content", reason("broken.gp", fixture("broken.gp")))
        assertEquals("content", reason("a.gp", zip("other.txt" to "x".toByteArray())))
        assertEquals("content", reason("a.gp", fixture("B.xml")))
        assertEquals("content", reason("a.xml", fixture("A.gp")))
        assertEquals("content", reason("a.mxl", fixture("A.gp")))
        assertEquals("content", reason("a.mxl", zip("META-INF/container.xml" to container)))  // rootfile 없음
        assertEquals("content", reason("a.xml", "<!DOCTYPE x [<!ENTITY a \"b\">]><score-partwise/>".toByteArray()))
        assertEquals("content", reason("a.xml", "<!ENTITY a \"b\"><score-partwise/>".toByteArray()))
        assertEquals("content", reason("a.xml", "<html><body/></html>".toByteArray()))
        assertEquals("content", reason("a.xml", "plain text".toByteArray()))
        val utf16 = byteArrayOf(0xFF.toByte(), 0xFE.toByte()) + "<score-partwise/>".toByteArray(Charsets.UTF_16LE)
        assertEquals("content", reason("a.xml", utf16))
        assertEquals("content", reason("a.xml", byteArrayOf(0x3C, 0xC3.toByte(), 0x28)))   // 잘못된 UTF-8
        assertEquals("content", reason("a.gp", zip("../evil" to "x".toByteArray(), "Content/score.gpif" to minimalXml)))
        val badContainer = """<!DOCTYPE c [<!ENTITY x "y">]><container><rootfile full-path="s.xml"/></container>""".toByteArray()
        assertEquals("content", reason("a.mxl", zip("META-INF/container.xml" to badContainer, "s.xml" to minimalXml)))
    }

    @Test
    fun `ZIP 한도 - 항목 200개는 통과, 201개와 압축 해제 50MB 초과는 거부`() {
        val ok = (1 until 200).map { "f$it" to ByteArray(1) }.toTypedArray()
        assertEquals(TabFormat.GP, TabFileValidator.detect("a.gp", zip("Content/score.gpif" to minimalXml, *ok)))
        val many = (1..200).map { "f$it" to ByteArray(1) }.toTypedArray()
        assertEquals("content", reason("a.gp", zip("Content/score.gpif" to minimalXml, *many)))
        val bomb = zip("Content/score.gpif" to ByteArray((TabFileValidator.MAX_UNZIPPED_BYTES + 1).toInt()))
        assert(bomb.size < 1_000_000) // 압축이 잘 되는 0 바이트
        assertEquals("content", reason("a.gp", bomb))
    }

    @Test
    fun `ZIP 한도는 이름이 중복돼도 전체 항목을 센다`() {
        fun archive(entryCount: Int): ByteArray {
            val entries = (1 until entryCount).map { "extra-${it.toString().padStart(3, '0')}.txt" to ByteArray(0) }
            val bytes = zip("Content/score.gpif" to minimalXml, *entries.toTypedArray())
            // ZipOutputStream은 중복 이름을 거부하므로 생성 후 ZIP 헤더에 같은 길이의 이름을 쓴다.
            return bytes.toString(Charsets.ISO_8859_1)
                .replace(Regex("extra-[0-9]{3}\\.txt"), "extra-000.txt")
                .toByteArray(Charsets.ISO_8859_1)
        }

        assertEquals(TabFormat.GP, TabFileValidator.detect("a.gp", archive(200)))
        assertEquals("content", reason("a.gp", archive(201)))
    }

    @Test
    fun `xml 앞 64KB 경계에서 다중 바이트 문자가 잘려도 정상 판정`() {
        val head = "<?xml version=\"1.0\"?><score-partwise><work-title>".toByteArray()
        val body = "가".repeat(30_000).toByteArray()   // 3바이트 × 30000 = 90KB
        assertEquals(TabFormat.XML, TabFileValidator.detect("k.xml", head + body))
    }

    @Test
    fun `파일 이름 정리`() {
        assertEquals("x.gp", TabFileValidator.sanitizeFileName("../../x.gp"))
        assertEquals("b.gp", TabFileValidator.sanitizeFileName("C:\\a\\b.gp"))
        assertEquals("연습곡.gp", TabFileValidator.sanitizeFileName("  연\u0000습\u202E곡.gp  "))
        assertEquals("가", TabFileValidator.sanitizeFileName("\u1100\u1161")) // NFC
        val long = "가".repeat(300) + ".mxl"
        val cut = TabFileValidator.sanitizeFileName(long)
        assertEquals(200, cut.codePointCount(0, cut.length))
        assert(cut.endsWith(".mxl"))
        assertFailsWith<InvalidInputException> { TabFileValidator.sanitizeFileName("  /  ") }
        assertFailsWith<InvalidInputException> { TabFileValidator.sanitizeFileName(null) }
        assertEquals("My Song", TabFileValidator.baseName("My Song.gp"))
    }
}
