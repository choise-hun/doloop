package ulevelp.support

import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import ulevelp.auth.CronOidcConfig
import ulevelp.auth.CronOidcVerifier
import ulevelp.auth.StaticJwksProvider
import ulevelp.auth.SupabaseAuthConfig
import ulevelp.db.DatabaseConfig
import ulevelp.module
import ulevelp.notion.NotionClient
import ulevelp.note.AnalyzeJobDispatcher
import ulevelp.note.GeminiClient
import ulevelp.security.CryptoService
import ulevelp.service.IntegrationCheckClient
import ulevelp.service.NotionCheckResponse
import ulevelp.service.VideoMeta
import ulevelp.service.VideoMetaClient
import ulevelp.service.VideoDurationClient
import ulevelp.service.PlaylistClient
import ulevelp.service.YoutubePlaylist
import ulevelp.service.YoutubeDataPlaylistClient
import ulevelp.api.ApiException
import ulevelp.storage.StorageClient
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.interfaces.RSAPublicKey
import java.security.spec.ECGenParameterSpec
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.selectAll
import ulevelp.service.applyCredit
import kotlin.test.assertEquals
import kotlin.test.assertTrue

object TestJwt {
    private const val TEST_SUPABASE_URL = "https://testproj.supabase.co"
    const val TEST_ISSUER = "$TEST_SUPABASE_URL/auth/v1"
    const val TEST_AUDIENCE = "authenticated"
    const val EC_KID = "test-ec-key-1"

    val FIXED_NOW: Instant = Instant.parse("2026-10-30T12:00:00Z")
    val TEST_CLOCK: Clock = Clock.fixed(FIXED_NOW, ZoneOffset.UTC)
    private val urlEncoder = Base64.getUrlEncoder().withoutPadding()

    private val ecKeyPair: KeyPair = KeyPairGenerator.getInstance("EC").apply {
        initialize(ECGenParameterSpec("secp256r1"))
    }.generateKeyPair()

    val authConfig: SupabaseAuthConfig

    init {
        val ecPub = ecKeyPair.public as ECPublicKey
        val validJwksJson = buildJsonObject {
            putJsonArray("keys") {
                addJsonObject {
                    put("kty", "EC")
                    put("crv", "P-256")
                    put("alg", "ES256")
                    put("use", "sig")
                    put("kid", EC_KID)
                    put("x", urlEncoder.encodeToString(toFixedUnsignedBytes(ecPub.w.affineX, 32)))
                    put("y", urlEncoder.encodeToString(toFixedUnsignedBytes(ecPub.w.affineY, 32)))
                }
            }
        }.toString()

        val jwksProvider = StaticJwksProvider.fromJwksJson(validJwksJson)
        authConfig = SupabaseAuthConfig(
            issuer = TEST_ISSUER,
            audience = TEST_AUDIENCE,
            jwksProvider = jwksProvider,
            clock = TEST_CLOCK
        )
    }

    private fun toUnsignedBytes(bigInt: BigInteger): ByteArray {
        val bytes = bigInt.toByteArray()
        return if (bytes.size > 1 && bytes[0] == 0.toByte()) {
            bytes.copyOfRange(1, bytes.size)
        } else {
            bytes
        }
    }

    private fun toFixedUnsignedBytes(bigInt: BigInteger, length: Int): ByteArray {
        val unsigned = toUnsignedBytes(bigInt)
        return when {
            unsigned.size == length -> unsigned
            unsigned.size > length -> unsigned.copyOfRange(unsigned.size - length, unsigned.size)
            else -> ByteArray(length).also {
                System.arraycopy(unsigned, 0, it, length - unsigned.size, unsigned.size)
            }
        }
    }

    fun token(
        sub: UUID,
        email: String = "player@example.com",
        exp: Long = FIXED_NOW.epochSecond + 3600
    ): String {
        val headerJson = buildJsonObject {
            put("alg", "ES256")
            put("typ", "JWT")
            put("kid", EC_KID)
        }.toString()

        val payloadJson = buildJsonObject {
            put("iss", TEST_ISSUER)
            put("aud", TEST_AUDIENCE)
            put("sub", sub.toString())
            put("email", email)
            put("exp", exp)
        }.toString()

        val headerB64 = urlEncoder.encodeToString(headerJson.toByteArray(Charsets.UTF_8))
        val payloadB64 = urlEncoder.encodeToString(payloadJson.toByteArray(Charsets.UTF_8))
        val signingInput = "$headerB64.$payloadB64".toByteArray(Charsets.US_ASCII)

        val signatureBytes = Signature.getInstance("SHA256withECDSAinP1363Format").run {
            initSign(ecKeyPair.private)
            update(signingInput)
            sign()
        }

        val sigB64 = urlEncoder.encodeToString(signatureBytes)
        return "$headerB64.$payloadB64.$sigB64"
    }
}

object TestCronJwt {
    const val TEST_CRON_AUDIENCE = "https://test-cron-service.run.app"
    const val TEST_CRON_SA_EMAIL = "test-cron-sa@test-project.iam.gserviceaccount.com"
    const val RSA_KID = "test-rsa-cron-key-1"

    val FIXED_NOW: Instant = Instant.parse("2026-10-30T12:00:00Z")
    val TEST_CLOCK: Clock = Clock.fixed(FIXED_NOW, ZoneOffset.UTC)
    private val urlEncoder = Base64.getUrlEncoder().withoutPadding()

    val rsaKeyPair: KeyPair = KeyPairGenerator.getInstance("RSA").apply {
        initialize(2048)
    }.generateKeyPair()

    val cronConfig: CronOidcConfig

    init {
        val rsaPub = rsaKeyPair.public as RSAPublicKey
        fun toUnsignedBytes(bigInt: BigInteger): ByteArray {
            val bytes = bigInt.toByteArray()
            return if (bytes.size > 1 && bytes[0] == 0.toByte()) {
                bytes.copyOfRange(1, bytes.size)
            } else {
                bytes
            }
        }

        val validJwksJson = buildJsonObject {
            putJsonArray("keys") {
                addJsonObject {
                    put("kty", "RSA")
                    put("alg", "RS256")
                    put("use", "sig")
                    put("kid", RSA_KID)
                    put("n", urlEncoder.encodeToString(toUnsignedBytes(rsaPub.modulus)))
                    put("e", urlEncoder.encodeToString(toUnsignedBytes(rsaPub.publicExponent)))
                }
            }
        }.toString()

        val jwksProvider = StaticJwksProvider.fromJwksJson(validJwksJson)
        cronConfig = CronOidcConfig(
            audience = TEST_CRON_AUDIENCE,
            serviceAccountEmail = TEST_CRON_SA_EMAIL,
            jwksProvider = jwksProvider,
            clock = TEST_CLOCK
        )
    }

    fun token(
        iss: String = "https://accounts.google.com",
        aud: String = TEST_CRON_AUDIENCE,
        email: String = TEST_CRON_SA_EMAIL,
        emailVerified: Boolean = true,
        exp: Long = FIXED_NOW.epochSecond + 3600,
        kid: String = RSA_KID,
        keyPair: KeyPair = rsaKeyPair,
        alg: String = "RS256"
    ): String {
        val headerJson = buildJsonObject {
            put("alg", alg)
            put("typ", "JWT")
            put("kid", kid)
        }.toString()

        val payloadJson = buildJsonObject {
            put("iss", iss)
            put("aud", aud)
            put("email", email)
            put("email_verified", emailVerified)
            put("exp", exp)
        }.toString()

        val headerB64 = urlEncoder.encodeToString(headerJson.toByteArray(Charsets.UTF_8))
        val payloadB64 = urlEncoder.encodeToString(payloadJson.toByteArray(Charsets.UTF_8))
        val signingInput = "$headerB64.$payloadB64".toByteArray(Charsets.US_ASCII)

        val signatureBytes = Signature.getInstance("SHA256withRSA").run {
            initSign(keyPair.private)
            update(signingInput)
            sign()
        }

        val sigB64 = urlEncoder.encodeToString(signatureBytes)
        return "$headerB64.$payloadB64.$sigB64"
    }
}

class FakeVideoMetaClient(
    @Volatile var meta: VideoMeta? = VideoMeta("Fake Title", "Fake Channel")
) : VideoMetaClient {
    val calls = CopyOnWriteArrayList<String>()

    override suspend fun fetch(videoId: String): VideoMeta? {
        calls.add(videoId)
        return meta
    }
}

/** 가짜 YouTube 재생목록. [playlists]에 없는 id는 404, [error]가 있으면 그 예외 */
class FakePlaylistClient(
    val playlists: MutableMap<String, YoutubePlaylist> = mutableMapOf(),
    @Volatile var error: ApiException? = null
) : PlaylistClient {
    val calls = CopyOnWriteArrayList<Pair<String, Int>>()

    override suspend fun fetch(playlistId: String, maxItems: Int): YoutubePlaylist {
        calls.add(playlistId to maxItems)
        error?.let { throw it }
        val p = playlists[playlistId] ?: throw YoutubeDataPlaylistClient.playlistNotFound()
        return p.copy(items = p.items.take(maxItems))
    }
}

/** 가짜 YouTube 영상 길이(M1-3b). [error]가 있으면 그 예외 */
class FakeVideoDurationClient(
    @Volatile var durationSec: Int = 240,
    @Volatile var error: ApiException? = null
) : VideoDurationClient {
    val calls = CopyOnWriteArrayList<String>()

    override suspend fun durationSec(videoId: String): Int {
        calls.add(videoId)
        error?.let { throw it }
        return durationSec
    }
}

object TestCrypto {
    val keyBytes = ByteArray(32) { (it + 1).toByte() }
    val service = CryptoService(keyBytes)
}

class FakeIntegrationCheckClient : IntegrationCheckClient {
    @Volatile var notionHandler: (suspend (token: String, songsDb: String, sessionsDb: String, notesDb: String?) -> NotionCheckResponse)? = null

    val notionCalls = CopyOnWriteArrayList<List<String?>>()

    override suspend fun checkNotion(
        token: String,
        songsDb: String,
        sessionsDb: String,
        notesDb: String?
    ): NotionCheckResponse {
        notionCalls.add(listOf(token, songsDb, sessionsDb, notesDb))
        val handler = notionHandler
        if (handler != null) return handler(token, songsDb, sessionsDb, notesDb)
        return NotionCheckResponse(
            ok = true,
            provider = "notion",
            songsTitle = "연습 곡",
            sessionsTitle = "연습 기록",
            notesTitle = if (notesDb != null) "학습 영상 노트" else null,
            maxUploadMB = 5
        )
    }
}

fun ApplicationTestBuilder.configureApiTestApp(
    dbConfig: DatabaseConfig,
    videoMetaClient: VideoMetaClient = FakeVideoMetaClient(),
    playlistClient: PlaylistClient = FakePlaylistClient(),
    storageClient: StorageClient? = null,
    cryptoService: CryptoService? = TestCrypto.service,
    integrationCheckClient: IntegrationCheckClient = FakeIntegrationCheckClient(),
    notionClient: NotionClient = FakeNotionClient(),
    cronOidcVerifier: CronOidcVerifier? = CronOidcVerifier(TestCronJwt.cronConfig),
    geminiClient: GeminiClient = FakeGeminiClient(),
    analyzeJobDispatcher: AnalyzeJobDispatcher? = null,
    videoDurationClient: VideoDurationClient = FakeVideoDurationClient(),
    geminiApiKey: String? = TestCredits.SYSTEM_GEMINI_KEY
) {
    application {
        module(
            dbConfig = dbConfig.copy(runMigrations = false),
            authConfig = TestJwt.authConfig,
            allowedOrigins = listOf("http://localhost:3000"),
            videoMetaClient = videoMetaClient,
            playlistClient = playlistClient,
            publicAppUrl = "https://choise-hun.github.io/ULevelP/",
            storageClient = storageClient,
            cryptoService = cryptoService,
            integrationCheckClient = integrationCheckClient,
            notionClient = notionClient,
            cronOidcVerifier = cronOidcVerifier,
            geminiClient = geminiClient,
            geminiApiKey = geminiApiKey,
            videoDurationClient = videoDurationClient,
            analyzeJobDispatcher = analyzeJobDispatcher
        )
    }
}

fun assertStandardError(
    bodyText: String,
    expectedStatus: Int,
    expectedCode: String,
    expectedSource: String = "server"
): JsonObject {
    val obj = Json.parseToJsonElement(bodyText).jsonObject
    // detail은 선택 필드(M1-1 A10) — 있을 때만 나온다
    assertEquals(
        setOf("ok", "source", "status", "code", "message", "retryAfter"),
        obj.keys - "detail",
        "Standard error response must contain exact 6 keys (+ optional detail)"
    )
    obj["detail"]?.let { assertTrue(it is JsonObject, "detail must be an object") }
    assertEquals(false, obj["ok"]?.jsonPrimitive?.boolean)
    assertEquals(expectedSource, obj["source"]?.jsonPrimitive?.content)
    assertEquals(expectedStatus, obj["status"]?.jsonPrimitive?.int)
    assertEquals(expectedCode, obj["code"]?.jsonPrimitive?.content)
    assertTrue(obj["message"]?.jsonPrimitive?.content?.isNotBlank() == true)
    assertTrue(obj["retryAfter"] is JsonNull)
    return obj
}

/**
 * 테스트용 티어 지정 (M1-2a). 관리 API를 거치지 않고 override를 직접 쓴다 — 한도와 무관한 기존 테스트가
 * 무료 한도(곡 10·분류 2·녹음 5MB/2곡)에 걸리지 않게 할 때 쓴다
 */
object TestTier {
    fun set(db: org.jetbrains.exposed.sql.Database, userId: UUID, tier: String?) {
        org.jetbrains.exposed.sql.transactions.transaction(db) {
            ulevelp.db.ProfilesTable.update({ ulevelp.db.ProfilesTable.id eq userId }) {
                it[ulevelp.db.ProfilesTable.tierOverride] = tier
                it[ulevelp.db.ProfilesTable.tierOverrideUntil] = null
            }
        }
    }

    fun setRole(db: org.jetbrains.exposed.sql.Database, userId: UUID, role: String) {
        org.jetbrains.exposed.sql.transactions.transaction(db) {
            ulevelp.db.ProfilesTable.update({ ulevelp.db.ProfilesTable.id eq userId }) {
                it[ulevelp.db.ProfilesTable.role] = role
            }
        }
    }
}

/**
 * 테스트용 크레딧 (M1-3b). 지급도 원장 행으로 한다(applyCredit) — "원장 합계 = 잔액" 불변식이 테스트 내내 지켜지게
 */
object TestCredits {
    const val SYSTEM_GEMINI_KEY = "test-system-gemini-key"

    fun grant(db: org.jetbrains.exposed.sql.Database, userId: UUID, amount: Int, bucket: String = ulevelp.service.BUCKET_PURCHASED) {
        org.jetbrains.exposed.sql.transactions.transaction(db) {
            applyCredit(userId, bucket, amount, "admin_adjust")
        }
    }

    /** 유료 티어 + 크레딧 (기존 BYOK 키 시드 자리) */
    fun seedPaid(db: org.jetbrains.exposed.sql.Database, userId: UUID, purchased: Int = 500, tier: String = "pro") {
        TestTier.set(db, userId, tier)
        if (purchased > 0) grant(db, userId, purchased)
    }

    /** (monthly, purchased) */
    fun balances(db: org.jetbrains.exposed.sql.Database, userId: UUID): Pair<Int, Int> =
        org.jetbrains.exposed.sql.transactions.transaction(db) {
            val row = ulevelp.db.ProfilesTable.selectAll().where { ulevelp.db.ProfilesTable.id eq userId }.single()
            row[ulevelp.db.ProfilesTable.monthlyCredits] to row[ulevelp.db.ProfilesTable.purchasedCredits]
        }

    /** 불변식(진행 파일 §5): 버킷별 SUM(delta) = 잔액, 모든 balance_after ≥ 0, 버킷별 마지막 balance_after = 잔액 */
    fun assertInvariant(db: org.jetbrains.exposed.sql.Database, userId: UUID) {
        org.jetbrains.exposed.sql.transactions.transaction(db) {
            val (monthly, purchased) = balances(db, userId)
            val rows = ulevelp.db.CreditLedgerTable.selectAll()
                .where { ulevelp.db.CreditLedgerTable.userId eq userId }
                .orderBy(ulevelp.db.CreditLedgerTable.id)
                .toList()
            for ((bucket, balance) in listOf("monthly" to monthly, "purchased" to purchased)) {
                val bucketRows = rows.filter { it[ulevelp.db.CreditLedgerTable.bucket] == bucket }
                assertEquals(balance, bucketRows.sumOf { it[ulevelp.db.CreditLedgerTable.delta] }, "원장 합계 = 잔액 ($bucket)")
                assertTrue(bucketRows.all { it[ulevelp.db.CreditLedgerTable.balanceAfter] >= 0 }, "balance_after >= 0 ($bucket)")
                bucketRows.lastOrNull()?.let {
                    assertEquals(balance, it[ulevelp.db.CreditLedgerTable.balanceAfter], "마지막 balance_after = 잔액 ($bucket)")
                }
            }
        }
    }
}
