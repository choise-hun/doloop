package ulevelp.community

import org.junit.jupiter.api.Test
import ulevelp.service.AudioSignature
import kotlin.test.*

class AudioSignatureTest {
    private fun check(mime: String, bytes: ByteArray) {
        assertTrue(AudioSignature.matches(mime, bytes))
        assertFalse(AudioSignature.matches("application/octet-stream", bytes))
        for (size in 0 until bytes.size) assertFalse(AudioSignature.matches(mime, bytes.copyOf(size)), "$mime size=$size")
    }
    @Test fun mp4() = check("audio/mp4", byteArrayOf(0, 0, 0, 8) + "ftyp".toByteArray())
    @Test fun webm() = check("audio/webm", byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte()))
    @Test fun ogg() = check("audio/ogg", "OggS".toByteArray())
    @Test fun mpeg() {
        check("audio/mpeg", "ID3".toByteArray())
        check("audio/mpeg", byteArrayOf(0xFF.toByte(), 0xE0.toByte()))
        assertFalse(AudioSignature.matches("audio/mpeg", byteArrayOf(0xFF.toByte(), 0xC0.toByte())))
    }
    @Test fun wav() = check("audio/wav", "RIFF0000WAVE".toByteArray())
    @Test fun aac() {
        check("audio/aac", byteArrayOf(0xFF.toByte(), 0xF1.toByte()))
        assertFalse(AudioSignature.matches("audio/aac", byteArrayOf(0xFF.toByte(), 0xF7.toByte())))
    }
    @Test fun crossMimeAndEmpty() {
        for (mime in listOf("audio/mp4", "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/aac")) {
            assertFalse(AudioSignature.matches(mime, byteArrayOf()))
            assertFalse(AudioSignature.matches(mime, ByteArray(12)))
            if (mime != "audio/ogg") assertFalse(AudioSignature.matches(mime, "OggS".toByteArray()))
        }
    }
}
