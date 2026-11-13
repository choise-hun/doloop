package ulevelp.service

object AudioSignature {
    fun matches(mime: String, bytes: ByteArray): Boolean {
        fun at(offset: Int, value: String) = bytes.size >= offset + value.length &&
            value.indices.all { bytes[offset + it].toInt() and 0xFF == value[it].code }
        fun b(i: Int) = bytes[i].toInt() and 0xFF
        return when (mime) {
            "audio/mp4" -> at(4, "ftyp")
            "audio/webm" -> bytes.size >= 4 && b(0) == 0x1A && b(1) == 0x45 && b(2) == 0xDF && b(3) == 0xA3
            "audio/ogg" -> at(0, "OggS")
            "audio/mpeg" -> at(0, "ID3") || (bytes.size >= 2 && b(0) == 0xFF && b(1) and 0xE0 == 0xE0)
            "audio/wav" -> at(0, "RIFF") && at(8, "WAVE")
            "audio/aac" -> bytes.size >= 2 && b(0) == 0xFF && b(1) and 0xF6 == 0xF0
            else -> false
        }
    }
}
