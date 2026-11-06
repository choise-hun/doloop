package ulevelp.service

import io.ktor.http.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.update
import ulevelp.api.ApiException
import ulevelp.api.InvalidInputException
import ulevelp.api.NotFoundException
import ulevelp.db.DatabaseFactory
import ulevelp.db.IntegrationsTable
import ulevelp.db.NotionSyncTable
import ulevelp.security.CryptoService
import ulevelp.security.EncryptedPayload
import ulevelp.security.InvalidIntegrationKeyException
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

@Serializable
data class IntegrationDto(
    val provider: String,
    val hint: String,
    val config: JsonObject,
    val updatedAt: String,
    val verified: Boolean = false,
    val displayName: String? = null
)

@Serializable
data class IntegrationListResponse(
    val integrations: List<IntegrationDto>
)

data class SaveNotionKeyInput(
    val appId: String,
    val token: String?,
    val songsDb: String,
    val sessionsDb: String,
    val notesDb: String?
)

data class DecryptedNotionIntegration(
    val token: String,
    val songsDb: String,
    val sessionsDb: String,
    val notesDb: String?
)

class IntegrationService(
    private val db: Database?,
    private val cryptoService: CryptoService?,
    private val checkClient: IntegrationCheckClient
) {

    companion object {
        val VALID_APP_IDS = setOf("ulevelp")
        /** Gemini는 M1-3b부터 서버 키 + 크레딧(BYOK 제거, V6) */
        val VALID_PROVIDERS = setOf("notion")
        const val REMOVED_PROVIDER_GEMINI = "gemini"

        private fun formatTimestamp(dt: OffsetDateTime): String =
            DateTimeFormatter.ISO_INSTANT.format(dt.toInstant())
    }

    private fun requireDb(): Database =
        db ?: throw ApiException(
            status = HttpStatusCode.ServiceUnavailable,
            code = "DB_UNAVAILABLE",
            message = "데이터베이스가 연결되어 있지 않습니다."
        )

    private fun requireCrypto(): CryptoService =
        cryptoService ?: throw ApiException(
            status = HttpStatusCode.ServiceUnavailable,
            code = "CRYPTO_UNAVAILABLE",
            message = "서버 암호화 키(APP_MASTER_KEY)가 설정되어 있지 않습니다."
        )

    private fun validateAppId(appId: String) {
        if (appId !in VALID_APP_IDS) {
            throw InvalidInputException("appId 값이 올바르지 않습니다.")
        }
    }

    private fun normalizeDbField(fieldName: String, raw: String): String =
        try {
            CryptoService.normalizeNotionDatabaseId(raw)
        } catch (_: InvalidIntegrationKeyException) {
            throw InvalidInputException("$fieldName 형식이 올바르지 않습니다 (32자리 16진수 ID가 필요합니다).")
        }

    suspend fun list(userId: UUID, appId: String): List<IntegrationDto> {
        validateAppId(appId)
        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            IntegrationsTable
                .selectAll()
                .where { (IntegrationsTable.userId eq userId) and (IntegrationsTable.appId eq appId) }
                .orderBy(IntegrationsTable.provider to SortOrder.ASC)
                .map { row ->
                    val configElem = row[IntegrationsTable.config]
                    val configObj = if (configElem is JsonObject) configElem else JsonObject(emptyMap())
                    IntegrationDto(
                        provider = row[IntegrationsTable.provider],
                        hint = row[IntegrationsTable.hint],
                        config = configObj,
                        updatedAt = formatTimestamp(row[IntegrationsTable.updatedAt])
                    )
                }
        }
    }

    suspend fun saveNotion(userId: UUID, input: SaveNotionKeyInput): IntegrationDto {
        validateAppId(input.appId)
        val crypto = requireCrypto()

        val normSongsDb = normalizeDbField("songsDb", input.songsDb)
        val normSessionsDb = normalizeDbField("sessionsDb", input.sessionsDb)
        val normNotesDb = input.notesDb?.takeIf { it.isNotBlank() }?.let { normalizeDbField("notesDb", it) }

        val rawToken = input.token?.trim()?.takeIf { it.isNotEmpty() }
        val encryptedPayload: EncryptedPayload? = if (rawToken != null) {
            try {
                crypto.encryptProviderKey(userId, "notion", rawToken, appId = input.appId)
            } catch (e: InvalidIntegrationKeyException) {
                throw InvalidInputException(e.message)
            }
        } else {
            null
        }

        val configJson = buildJsonObject {
            put("songsDb", normSongsDb)
            put("sessionsDb", normSessionsDb)
            if (normNotesDb != null) {
                put("notesDb", normNotesDb)
            } else {
                put("notesDb", JsonNull)
            }
        }

        val database = requireDb()
        return DatabaseFactory.dbQuery(database) {
            val existing = IntegrationsTable
                .selectAll()
                .where {
                    (IntegrationsTable.userId eq userId) and
                    (IntegrationsTable.appId eq input.appId) and
                    (IntegrationsTable.provider eq "notion")
                }
                .singleOrNull()

            if (existing == null && encryptedPayload == null) {
                throw InvalidInputException("최초 등록 시 노션 통합 토큰(token)이 필요합니다.")
            }

            val now = OffsetDateTime.now(ZoneOffset.UTC)
            if (existing == null) {
                IntegrationsTable.insert {
                    it[this.userId] = userId
                    it[this.appId] = input.appId
                    it[this.provider] = "notion"
                    it[this.encryptedSecret] = encryptedPayload!!.encryptedSecret
                    it[this.iv] = encryptedPayload.iv
                    it[this.keyVersion] = encryptedPayload.keyVersion
                    it[this.hint] = encryptedPayload.hint
                    it[this.config] = configJson
                    it[this.createdAt] = now
                    it[this.updatedAt] = now
                }
            } else {
                IntegrationsTable.update({
                    (IntegrationsTable.userId eq userId) and
                    (IntegrationsTable.appId eq input.appId) and
                    (IntegrationsTable.provider eq "notion")
                }) {
                    it[config] = configJson
                    if (encryptedPayload != null) {
                        it[encryptedSecret] = encryptedPayload.encryptedSecret
                        it[iv] = encryptedPayload.iv
                        it[keyVersion] = encryptedPayload.keyVersion
                        it[hint] = encryptedPayload.hint
                    }
                    it[updatedAt] = now
                }
            }

            val updatedRow = IntegrationsTable
                .selectAll()
                .where {
                    (IntegrationsTable.userId eq userId) and
                    (IntegrationsTable.appId eq input.appId) and
                    (IntegrationsTable.provider eq "notion")
                }
                .single()

            IntegrationDto(
                provider = "notion",
                hint = updatedRow[IntegrationsTable.hint],
                config = updatedRow[IntegrationsTable.config] as? JsonObject ?: configJson,
                updatedAt = formatTimestamp(updatedRow[IntegrationsTable.updatedAt])
            )
        }
    }

    suspend fun checkNotion(userId: UUID, appId: String): NotionCheckResponse {
        val decrypted = requireDecryptedNotion(userId, appId)
        return checkClient.checkNotion(
            token = decrypted.token,
            songsDb = decrypted.songsDb,
            sessionsDb = decrypted.sessionsDb,
            notesDb = decrypted.notesDb
        )
    }

    suspend fun delete(userId: UUID, appId: String, provider: String) {
        validateAppId(appId)
        if (provider !in VALID_PROVIDERS) {
            throw NotFoundException("지원하지 않는 연동 공급자입니다.")
        }
        val database = requireDb()
        DatabaseFactory.dbQuery(database) {
            IntegrationsTable.deleteWhere {
                (IntegrationsTable.userId eq userId) and
                (IntegrationsTable.appId eq appId) and
                (IntegrationsTable.provider eq provider)
            }
            if (provider == "notion" && appId == "ulevelp") {
                NotionSyncTable.update({ NotionSyncTable.userId eq userId }) {
                    it[enabled] = false
                    it[leaseUntil] = null
                    it[leaseOwner] = null
                }
            }
        }
    }

    internal suspend fun requireDecryptedNotion(userId: UUID, appId: String = "ulevelp"): DecryptedNotionIntegration {
        validateAppId(appId)
        val crypto = requireCrypto()
        val database = requireDb()

        return DatabaseFactory.dbQuery(database) {
            val row = IntegrationsTable
                .selectAll()
                .where {
                    (IntegrationsTable.userId eq userId) and
                    (IntegrationsTable.appId eq appId) and
                    (IntegrationsTable.provider eq "notion")
                }
                .singleOrNull()
                ?: throw ApiException(
                    HttpStatusCode.PreconditionFailed,
                    "NO_KEY",
                    "등록된 키가 없습니다. 먼저 키를 저장해 주세요."
                )

            val decryptedToken = crypto.decryptProviderKey(
                userId = userId,
                provider = "notion",
                encryptedSecret = row[IntegrationsTable.encryptedSecret],
                iv = row[IntegrationsTable.iv],
                appId = appId
            )

            val configObj = row[IntegrationsTable.config] as? JsonObject ?: JsonObject(emptyMap())
            val sDb = (configObj["songsDb"] as? JsonPrimitive)?.content ?: ""
            val sessDb = (configObj["sessionsDb"] as? JsonPrimitive)?.content ?: ""
            val nDb = (configObj["notesDb"] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.takeIf { it.isNotBlank() }

            DecryptedNotionIntegration(
                token = decryptedToken,
                songsDb = sDb,
                sessionsDb = sessDb,
                notesDb = nDb
            )
        }
    }
}
