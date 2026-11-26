package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ulevelp.api.ApiException

/** NT-1 노트 첨부 형식(명세 §5.4). [ext] = 저장 키 확장자 */
enum class NoteFileType(val mime: String, val ext: String, val fileExts: Set<String>) {
    PDF("application/pdf", "pdf", setOf("pdf")),
    PNG("image/png", "png", setOf("png")),
    JPEG("image/jpeg", "jpg", setOf("jpg", "jpeg")),
    WEBP("image/webp", "webp", setOf("webp"));

    companion object {
        fun byMime(mime: String): NoteFileType? = entries.firstOrNull { it.mime == mime }
        fun byFileName(fileName: String): NoteFileType? {
            val ext = fileName.substringAfterLast('.', "").lowercase()
            return entries.firstOrNull { ext in it.fileExts }
        }
    }
}

/** 순수 함수(I/O 없음). 확장자와 매직바이트가 둘 다 맞아야 받는다. SVG·HEIC 등은 받지 않는다 */
object NoteFileValidator {
    const val MAX_FILE_BYTES = 20_971_520L          // 20MB (N6)
    const val MAX_REQUEST_BYTES = 22_020_096L       // 21MB (Content-Length 사전 거부·formFieldLimit)
    const val MAX_FILES_PER_DOC = 20                // N6
    const val MAX_DRIVE_BYTES = 2_147_483_648L      // Drive 참조 자기 신고 크기 상한(2GB)

    private val PDF_MAGIC = byteArrayOf(0x25, 0x50, 0x44, 0x46, 0x2D)                                  // %PDF-
    private val PNG_MAGIC = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
    private val JPEG_MAGIC = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte())
    private val RIFF = byteArrayOf(0x52, 0x49, 0x46, 0x46)
    private val WEBP = byteArrayOf(0x57, 0x45, 0x42, 0x50)

    fun invalid(message: String): ApiException = ApiException(
        HttpStatusCode.BadRequest,
        "INVALID_NOTE_FILE",
        message,
        detail = buildJsonObject { put("allowed", "pdf,png,jpg,jpeg,webp") }
    )

    fun detect(fileName: String, bytes: ByteArray): NoteFileType {
        val type = NoteFileType.byFileName(fileName)
            ?: throw invalid("PDF·PNG·JPEG·WebP 파일만 올릴 수 있습니다.")
        val ok = when (type) {
            NoteFileType.PDF -> bytes.startsWith(PDF_MAGIC)
            NoteFileType.PNG -> bytes.startsWith(PNG_MAGIC)
            NoteFileType.JPEG -> bytes.startsWith(JPEG_MAGIC)
            NoteFileType.WEBP -> bytes.startsWith(RIFF) && bytes.size >= 12 && bytes.copyOfRange(8, 12).contentEquals(WEBP)
        }
        if (!ok) throw invalid("파일 내용이 확장자(${type.ext})와 맞지 않습니다.")
        return type
    }

    private fun ByteArray.startsWith(prefix: ByteArray): Boolean =
        size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }
}
