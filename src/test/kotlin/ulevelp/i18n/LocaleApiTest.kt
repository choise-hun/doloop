package ulevelp.i18n

import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.HttpClient
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.db.DatabaseConfig
import ulevelp.note.GeminiSchemas
import ulevelp.service.CreditService
import ulevelp.service.Locales
import ulevelp.service.NoteService
import ulevelp.support.*
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.*

/**
 * L1-1 백엔드 언어 (`개발산출물/진행_다국어.md`, `계획/상용_서비스_계획.md` §3-4):
 * 첫 가입 `Accept-Language` → `profiles.locale`, `PATCH /me` `locale`(ko|en|ja|null), Gemini 프롬프트 언어 지시
 */
class LocaleApiTest {

    companion object {
        private lateinit var dataSource: HikariDataSource
        private lateinit var db: Database
        private lateinit var dbConfig: DatabaseConfig

        @JvmStatic
        @BeforeAll
        fun setUpAll() {
            dbConfig = PostgresTestContainer.getConfig()
            dataSource = DatabaseFactory.createDataSource(dbConfig)
            DatabaseFactory.migrate(dataSource)
            db = DatabaseFactory.connect(dataSource)
        }

        @JvmStatic
        @AfterAll
        fun tearDownAll() {
            if (::dataSource.isInitialized) {
                runCatching {
                    dataSource.connection.use { conn ->
                        conn.createStatement().use { stmt ->
                            stmt.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
                        }
                        conn.commit()
                    }
                }
                dataSource.close()
            }
        }
    }

    private val userA = UUID.fromString("00000000-0000-4000-8000-00000000c001")
    private val userB = UUID.fromString("00000000-0000-4000-8000-00000000c002")
    private val tokenA = TestJwt.token(sub = userA, email = "locale-a@example.com")
    private val tokenB = TestJwt.token(sub = userB, email = "locale-b@example.com")

    @BeforeEach
    fun setUp() {
        transaction(db) {
            CreditLedgerTable.deleteAll()
            ProgressionsTable.deleteAll()
            AnalysisJobsTable.deleteAll()
            NotesTable.deleteAll()
            ProfilesTable.deleteAll()
            UsersTable.deleteAll()
        }
    }

    private fun dbLocale(userId: UUID): String? = transaction(db) {
        ProfilesTable.select(ProfilesTable.locale).where { ProfilesTable.id eq userId }.single()[ProfilesTable.locale]
    }

    private suspend fun getMe(client: HttpClient, token: String, acceptLanguage: String? = null): HttpResponse =
        client.get("/api/v1/me") {
            header(HttpHeaders.Authorization, "Bearer $token")
            if (acceptLanguage != null) header(HttpHeaders.AcceptLanguage, acceptLanguage)
        }

    private suspend fun patchMe(client: HttpClient, token: String, body: String): HttpResponse =
        client.patch("/api/v1/me") {
            header(HttpHeaders.Authorization, "Bearer $token")
            header(HttpHeaders.ContentType, "application/json")
            setBody(body)
        }

    private fun localeOf(text: String): JsonElement? = Json.parseToJsonElement(text).jsonObject["locale"]

    @Test
    fun lc1_parseAcceptLanguage_qOrderAndPrimaryTag() {
        assertEquals("en", Locales.parseAcceptLanguage("fr-FR, ja;q=0.8, en-US;q=0.9"))
        assertEquals("ko", Locales.parseAcceptLanguage("ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"))
        assertEquals("ja", Locales.parseAcceptLanguage("JA-jp"))
        // 같은 q는 앞에 적힌 것
        assertEquals("ja", Locales.parseAcceptLanguage("ja, en"))
        // q=0(거절)·숫자 아닌 q·1 초과 q는 버린다
        assertEquals("ja", Locales.parseAcceptLanguage("en;q=0, ja;q=0.1"))
        assertEquals("ja", Locales.parseAcceptLanguage("en;q=abc, ja;q=0.5"))
        assertEquals("ko", Locales.parseAcceptLanguage("en;q=2, ko;q=0.3"))
        // 지원 언어가 없거나 비었으면 null (가입 시 locale NULL = 화면 자동)
        assertNull(Locales.parseAcceptLanguage("fr-FR, de;q=0.9, *;q=0.5"))
        assertNull(Locales.parseAcceptLanguage(""))
        assertNull(Locales.parseAcceptLanguage(null))
        assertNull(Locales.parseAcceptLanguage("kor, eng"))
    }

    @Test
    fun lc2_firstSignup_storesAcceptLanguage_andNeverOverwrites() = testApplication {
        configureApiTestApp(dbConfig)

        val first = getMe(client, tokenA, "ja-JP,ja;q=0.9,en;q=0.8")
        assertEquals(HttpStatusCode.OK, first.status)
        assertEquals("ja", localeOf(first.bodyAsText())?.jsonPrimitive?.content)
        assertEquals("ja", dbLocale(userA))

        // 다른 브라우저(영어)로 다시 와도 저장된 값 유지
        val second = getMe(client, tokenA, "en-US,en;q=0.9")
        assertEquals("ja", localeOf(second.bodyAsText())?.jsonPrimitive?.content)
        assertEquals("ja", dbLocale(userA))

        // 사용자가 자동(null)으로 돌린 뒤에도 헤더로 다시 채우지 않는다
        assertEquals(HttpStatusCode.OK, patchMe(client, tokenA, """{"locale":null}""").status)
        getMe(client, tokenA, "ko-KR")
        assertNull(dbLocale(userA))
    }

    @Test
    fun lc3_firstSignup_unsupportedOrMissingHeader_isNull() = testApplication {
        configureApiTestApp(dbConfig)

        val a = getMe(client, tokenA, "fr-FR,de;q=0.9")
        assertEquals(HttpStatusCode.OK, a.status)
        assertTrue(localeOf(a.bodyAsText()) is JsonNull)
        assertNull(dbLocale(userA))

        val b = getMe(client, tokenB)
        assertEquals(HttpStatusCode.OK, b.status)
        assertTrue(localeOf(b.bodyAsText()) is JsonNull)
        assertNull(dbLocale(userB))
    }

    @Test
    fun lc4_patchMe_locale_validValuesAndNull() = testApplication {
        configureApiTestApp(dbConfig)
        getMe(client, tokenA)

        for (value in listOf("en", "ja", "ko")) {
            val res = patchMe(client, tokenA, """{"locale":"$value"}""")
            assertEquals(HttpStatusCode.OK, res.status)
            assertEquals(value, localeOf(res.bodyAsText())?.jsonPrimitive?.content)
            assertEquals(value, dbLocale(userA))
        }

        // locale 키가 없으면 그대로
        val other = patchMe(client, tokenA, """{"displayName":"로케일 A"}""")
        assertEquals(HttpStatusCode.OK, other.status)
        assertEquals("ko", dbLocale(userA))

        // null = 자동으로 되돌림
        val auto = patchMe(client, tokenA, """{"locale":null}""")
        assertEquals(HttpStatusCode.OK, auto.status)
        assertTrue(localeOf(auto.bodyAsText()) is JsonNull)
        assertNull(dbLocale(userA))
    }

    @Test
    fun lc5_patchMe_invalidLocale_returns400_andKeepsValue() = testApplication {
        configureApiTestApp(dbConfig)
        getMe(client, tokenA)
        assertEquals(HttpStatusCode.OK, patchMe(client, tokenA, """{"locale":"en"}""").status)

        val invalid = listOf(
            """{"locale":"fr"}""", """{"locale":""}""", """{"locale":"KO"}""", """{"locale":"ko-KR"}""",
            """{"locale":123}""", """{"locale":true}""", """{"locale":["ko"]}""", """{"locale":{"v":"ko"}}""",
            // 다른 필드와 같이 와도 전체 거절(부분 반영 없음)
            """{"displayName":"바뀌면 안 됨","locale":"de"}"""
        )
        for (body in invalid) {
            val res = patchMe(client, tokenA, body)
            assertEquals(HttpStatusCode.BadRequest, res.status, body)
            assertStandardError(res.bodyAsText(), 400, "INVALID_INPUT")
        }
        assertEquals("en", dbLocale(userA))
        val me = Json.parseToJsonElement(getMe(client, tokenA).bodyAsText()).jsonObject
        assertNotEquals("바뀌면 안 됨", me["displayName"]?.jsonPrimitive?.content)
    }

    @Test
    fun lc6_patchMe_locale_isolatedPerUser() = testApplication {
        configureApiTestApp(dbConfig)
        getMe(client, tokenA)
        getMe(client, tokenB, "en-US")

        assertEquals(HttpStatusCode.OK, patchMe(client, tokenA, """{"locale":"ja"}""").status)
        assertEquals("ja", dbLocale(userA))
        assertEquals("en", dbLocale(userB))
        assertEquals("en", localeOf(getMe(client, tokenB).bodyAsText())?.jsonPrimitive?.content)
    }

    @Test
    fun lc7_prompt_koUnchanged_enJaAppendDirective_schemaSame() {
        val tags = listOf("화성", "믹싱")
        val memo = "보이싱 위주"
        val (koSchema, koPrompt) = GeminiSchemas.buildPrompt(tags, memo)
        val (progSchema, progPrompt) = GeminiSchemas.buildProgressionPrompt(memo)

        // ko·모르는 값은 기본 호출과 1글자도 같다
        for (loc in listOf("ko", "fr", "")) {
            assertEquals(koPrompt, GeminiSchemas.buildPrompt(tags, memo, loc).second, loc)
            assertEquals(progPrompt, GeminiSchemas.buildProgressionPrompt(memo, loc).second, loc)
        }

        for (loc in listOf("en", "ja")) {
            val directive = GeminiSchemas.LANGUAGE_DIRECTIVES.getValue(loc)
            val (schema, prompt) = GeminiSchemas.buildPrompt(tags, memo, loc)
            assertEquals(koPrompt + directive, prompt, loc)
            assertEquals(koSchema, schema, loc) // enum(입문/중급/고급·건반/기타·말함/화면/추정) 그대로
            val (pSchema, pPrompt) = GeminiSchemas.buildProgressionPrompt(memo, loc)
            assertEquals(progPrompt + directive, pPrompt, loc)
            assertEquals(progSchema, pSchema, loc)
            // 번역 금지 값을 지시문에 못박았는지
            for (keep in listOf("입문/중급/고급", "건반/기타", "말함/화면/추정", "F Major", "A min")) {
                assertTrue(directive.contains(keep), "$loc: $keep")
            }
        }
        assertTrue(GeminiSchemas.LANGUAGE_DIRECTIVES.getValue("en").contains("in English"))
        assertTrue(GeminiSchemas.LANGUAGE_DIRECTIVES.getValue("ja").contains("日本語"))
    }

    @Test
    fun lc8_executeJob_usesOwnerLocale_nullIsKo() = testApplication {
        val prompts = CopyOnWriteArrayList<String>()
        val fakeGemini = FakeGeminiClient().apply {
            handler = { _, _, _, prompt, _ ->
                prompts.add(prompt)
                FakeGeminiClient.defaultSuccessResult()
            }
        }
        val dispatcher = FakeAnalyzeJobDispatcher()
        configureApiTestApp(dbConfig, geminiClient = fakeGemini, analyzeJobDispatcher = dispatcher)

        getMe(client, tokenA)
        getMe(client, tokenB)
        TestCredits.seedPaid(db, userA)
        TestCredits.seedPaid(db, userB)
        assertEquals(HttpStatusCode.OK, patchMe(client, tokenA, """{"locale":"en"}""").status)

        suspend fun analyze(token: String): UUID {
            val res = client.post("/api/v1/notes/analyze") {
                header(HttpHeaders.Authorization, "Bearer $token")
                header(HttpHeaders.ContentType, "application/json")
                setBody("""{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","tags":["화성"],"memo":"보이싱"}""")
            }
            assertEquals(HttpStatusCode.Accepted, res.status, res.bodyAsText())
            return UUID.fromString(Json.parseToJsonElement(res.bodyAsText()).jsonObject["jobId"]!!.jsonPrimitive.content)
        }

        val noteService = NoteService(
            db = db,
            creditService = CreditService(db, FakeVideoDurationClient()),
            geminiApiKey = TestCredits.SYSTEM_GEMINI_KEY,
            videoMetaClient = FakeVideoMetaClient(),
            geminiClient = fakeGemini
        )
        noteService.executeJob(analyze(tokenA))
        noteService.executeJob(analyze(tokenB))

        assertEquals(2, prompts.size)
        val koPrompt = GeminiSchemas.buildPrompt(listOf("화성"), "보이싱").second
        assertEquals(koPrompt + GeminiSchemas.LANGUAGE_DIRECTIVES.getValue("en"), prompts[0]) // A = en
        assertEquals(koPrompt, prompts[1]) // B = NULL → ko, 기존과 같음

        // 결과 노트의 enum 값은 언어와 무관(가짜 응답 그대로 저장)
        val difficulties = transaction(db) { NotesTable.selectAll().map { it[NotesTable.difficulty] } }
        assertEquals(listOf("중급", "중급"), difficulties)
    }
}
