package ulevelp.service

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.db.*
import java.time.OffsetDateTime
import java.util.Base64
import java.util.UUID

@Serializable
data class PublicPartStatDto(val name: String, val a: Double, val b: Double, val rate: Double, val completed: Boolean, val seconds: Int, val loops: Int)
@Serializable
data class PublicSessionSnapshot(val videoId: String, val date: String, val seconds: Int, val loops: Int, val a: Double?, val b: Double?, val rate: Double?, val coveragePct: Int, val partStats: List<PublicPartStatDto>)
@Serializable
data class PublicEpisodeLogDto(val postId: String, val sessionId: String, val owner: PublicOwnerDto, val videoId: String, val youtubeTitle: String?, val youtubeArtist: String?, val title: String, val comment: String, val publishedAt: String, val date: String, val seconds: Int, val loops: Int, val a: Double?, val b: Double?, val rate: Double?, val coveragePct: Int, val partStats: List<PublicPartStatDto>)
@Serializable
data class EpisodeLogListResponse(val posts: List<PublicEpisodeLogDto>, val next: String?)
@Serializable
data class EpisodeReportCountsDto(val open: Int, val resolved: Int, val dismissed: Int)
@Serializable
data class MyEpisodeLogDto(val postId: String, val sessionId: String, val title: String, val comment: String, val publishedAt: String, val status: String, val hiddenAt: String?, val hiddenReason: String?, val tierPausedAt: String?, val withdrawnAt: String?, val createdAt: String, val updatedAt: String, val canRepublish: Boolean, val reportCounts: EpisodeReportCountsDto, val card: PublicEpisodeLogDto?)
@Serializable
data class MyEpisodeLogListResponse(val posts: List<MyEpisodeLogDto>, val next: String?)
@Serializable
data class ShareEpisodeResponse(val post: MyEpisodeLogDto)
@Serializable
data class WithdrawEpisodeResponse(val ok: Boolean = true)
@Serializable
data class ReportEpisodeResponse(val reportId: String)
@Serializable
data class AdminEpisodeReportDto(val reportId: String, val postId: String, val ownerId: String, val ownerPublicName: String?, val reporterId: String, val reason: String, val detail: String, val status: String, val createdAt: String, val resolvedAt: String?, val postStatus: String, val withdrawnAt: String?, val hiddenAt: String?)
@Serializable
data class AdminEpisodeReportListResponse(val reports: List<AdminEpisodeReportDto>, val next: String?)
@Serializable
data class AdminEpisodeModerationDto(val postId: String, val status: String, val hiddenAt: String?, val hiddenReason: String?, val tierPausedAt: String?, val withdrawnAt: String?, val updatedAt: String)

internal fun episodeConflict(code: String): Nothing = throw ApiException(HttpStatusCode.Conflict, code, "게시물 상태를 확인해 주세요.")
internal fun episodeTs(at: OffsetDateTime?): String? = at?.toInstant()?.toString()

/** 신규 입력에만 적용한다. 기존 UTF-16 길이 기반 API 계약은 유지한다. */
internal fun JsonObject.episodeKeys(vararg allowed: String) {
    if (keys.any { it !in allowed }) throw InvalidInputException("정의되지 않은 필드입니다.")
}
internal fun episodeText(raw: String, max: Int, multiline: Boolean = false): String {
    // trim 전에 검사해 NUL/제어 문자가 가장자리에 있어도 거절한다.
    if (raw.any { (it.isISOControl() && !(multiline && it in "\n\t")) || it == '\u007f' })
        throw InvalidInputException("허용되지 않은 제어 문자입니다.")
    var i = 0
    while (i < raw.length) {
        val c = raw[i++]
        if (c.isHighSurrogate()) {
            if (i == raw.length || !raw[i++].isLowSurrogate()) throw InvalidInputException("잘못된 Unicode입니다.")
        } else if (c.isLowSurrogate()) throw InvalidInputException("잘못된 Unicode입니다.")
    }
    val value = raw.trim()
    if (value.codePointCount(0, value.length) > max) throw InvalidInputException("문자 수 제한을 초과했습니다.")
    return value
}
internal fun JsonObject.episodeString(key: String, max: Int, multiline: Boolean = false, required: Boolean = false): String {
    val e = this[key]
    if (e == null || e is JsonNull) {
        if (required) throw InvalidInputException("$key 값이 필요합니다.")
        return ""
    }
    val value = (e as? JsonPrimitive)?.takeIf { it.isString }?.content ?: throw InvalidInputException("$key 형식이 올바르지 않습니다.")
    return episodeText(value, max, multiline).also { if (required && it.isEmpty()) throw InvalidInputException("$key 값이 필요합니다.") }
}

@Serializable
internal data class EpisodeCursor(val v: Int, val kind: String, val scope: String, val at: String, val id: String) {
    // Keep the wire format unchanged and reuse the validated SQL parameter.
    @Transient
    val queryAt: OffsetDateTime = OffsetDateTime.parse(at).also {
        require(it >= MIN_QUERY_AT && it <= MAX_QUERY_AT)
    }

    fun encode(): String = Base64.getUrlEncoder().withoutPadding().encodeToString(Json.encodeToString(serializer(), this).toByteArray(Charsets.UTF_8))
    companion object {
        // PostgreSQL timestamp.h: Julian day zero through the last finite microsecond.
        private val MIN_QUERY_AT = OffsetDateTime.parse("-4713-11-24T00:00:00Z")
        private val MAX_QUERY_AT = OffsetDateTime.parse("+294276-12-31T23:59:59.999999Z")

        fun parse(raw: String?, kind: String, scope: String): EpisodeCursor? {
            if (raw == null) return null
            try {
                require(raw.length in 1..1024 && raw.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it in "_-" })
                val c = Json.decodeFromString(serializer(), Base64.getUrlDecoder().decode(raw).toString(Charsets.UTF_8))
                require(c.v == 1 && c.kind == kind && c.scope == scope && c.at.endsWith("Z"))
                require(Regex("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$").matches(c.id))
                return c
            } catch (_: IllegalArgumentException) { throw InvalidInputException("cursor 형식이 올바르지 않습니다.") }
              catch (_: java.time.DateTimeException) { throw InvalidInputException("cursor 시각이 올바르지 않습니다.") }
        }
    }
}
internal fun episodeBefore(at: Column<OffsetDateTime>, id: Column<UUID>, cursor: EpisodeCursor?): Op<Boolean> =
    if (cursor == null) Op.TRUE else SqlExpressionBuilder.run {
        val t = cursor.queryAt
        (at less t) or ((at eq t) and (id less UUID.fromString(cursor.id)))
    }
internal fun episodeNext(row: ResultRow, kind: String, scope: String, at: Column<OffsetDateTime>, id: Column<UUID>): String =
    EpisodeCursor(1, kind, scope, episodeTs(row[at])!!, row[id].toString()).encode()
