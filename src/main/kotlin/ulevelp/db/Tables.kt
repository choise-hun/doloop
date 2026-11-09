package ulevelp.db

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.jetbrains.exposed.sql.ReferenceOption
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.TextColumnType
import org.jetbrains.exposed.sql.javatime.CurrentTimestampWithTimeZone
import org.jetbrains.exposed.sql.javatime.date
import org.jetbrains.exposed.sql.javatime.timestampWithTimeZone
import org.jetbrains.exposed.sql.json.jsonb
import java.math.BigDecimal

/**
 * 1. users (사용자 계정)
 */
object UsersTable : Table("users") {
    val id = uuid("id")
    val email = text("email")
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

/**
 * 2. profiles (사용자 프로필 및 쿼터)
 */
object ProfilesTable : Table("profiles") {
    val id = uuid("id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val displayName = text("display_name").default("")
    val role = text("role").default("user")
    val storageProvider = text("storage_provider").default("supabase")
    val driveFolderId = text("drive_folder_id").nullable()
    val takeQuotaBytes = long("take_quota_bytes").default(209_715_200L)
    val migratedLocalAt = timestampWithTimeZone("migrated_local_at").nullable()
    // V5 티어·크레딧·커뮤니티 열 (개발산출물/결과/M1-1_스키마설계.md §2-1). take_quota_bytes는 V5부터 읽지 않는다(A2)
    val billingTier = text("billing_tier").default("free")
    val tierOverride = text("tier_override").nullable()
    val tierOverrideUntil = timestampWithTimeZone("tier_override_until").nullable()
    val monthlyCredits = integer("monthly_credits").default(0)
    val purchasedCredits = integer("purchased_credits").default(0)
    // V7 크레딧 주기 (M1-3d): 다음 충전 시각·이번 주기에 지급한 티어. 둘 다 NULL = 주기 없음
    val creditCycleNextAt = timestampWithTimeZone("credit_cycle_next_at").nullable()
    val creditCycleTier = text("credit_cycle_tier").nullable()
    val locale = text("locale").nullable()
    val isCreator = bool("is_creator").default(false)
    val creatorBadge = text("creator_badge").nullable()
    val creatorBio = text("creator_bio").default("")
    val shareAutosync = bool("share_autosync").default(false)
    val sharePracticeLog = bool("share_practice_log").default(false)
    // V8 커뮤니티 공개 이름(N2): 커뮤니티 처음 쓸 때 직접 정함, 7일에 한 번 변경. NULL = 아직 안 정함(또는 owner 초기화)
    val publicName = text("public_name").nullable()
    val publicNameKey = text("public_name_key").nullable()
    val publicNameChangedAt = timestampWithTimeZone("public_name_changed_at").nullable()
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

/**
 * 3. songs (연습 곡 - 노션: 연습 곡 DB)
 */
object SongsTable : Table("songs") {
    val id = uuid("id").autoGenerate()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val title = text("title")
    val artist = text("artist").default("")
    val status = text("status").default("practicing")
    val videoId = text("video_id")
    val pos = decimal("pos", 8, 1).nullable()
    val a = decimal("a", 8, 1).nullable()
    val b = decimal("b", 8, 1).nullable()
    val rate = decimal("rate", 4, 2).default(BigDecimal("1.00"))
    val lastDate = date("last_date").nullable()
    val memo = text("memo").default("")
    val durationSec = integer("duration_sec").default(0)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)

    init {
        uniqueIndex(userId, videoId)
        uniqueIndex(userId, id)
    }
}

/**
 * 4. sessions (일별 연습 기록 - 노션: 연습 기록 DB)
 */
object SessionsTable : Table("sessions") {
    val id = uuid("id").autoGenerate()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val songId = uuid("song_id")
    val date = date("date")
    val seconds = integer("seconds").default(0)
    val loops = integer("loops").default(0)
    val rate = decimal("rate", 4, 2).nullable()
    val a = decimal("a", 8, 1).nullable()
    val b = decimal("b", 8, 1).nullable()
    val memo = text("memo").default("")
    val partStats = jsonb<JsonElement>("part_stats", Json).default(JsonArray(emptyList()))
    val coveragePct = integer("coverage_pct").default(0)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)

    init {
        uniqueIndex(userId, songId, date)
        uniqueIndex(userId, id, songId)
    }
}

/**
 * 5. takes (오디오 녹음 - 노션: 연습 기록 본문 오디오 블록 + 녹음 속성)
 */
object TakesTable : Table("takes") {
    val id = uuid("id").autoGenerate()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val sessionId = uuid("session_id")
    val songId = uuid("song_id")
    val recordedAt = timestampWithTimeZone("recorded_at")
    val a = decimal("a", 8, 1).nullable()
    val b = decimal("b", 8, 1).nullable()
    val rate = decimal("rate", 4, 2).nullable()
    val durationSec = integer("duration_sec")
    val mime = text("mime")
    val sizeBytes = long("size_bytes")
    val storage = text("storage")
    val storageKey = text("storage_key")
    val memo = text("memo").default("")
    val partName = text("part_name").default("")
    val completed = bool("completed").default(false)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

/**
 * 5.1 song_presets (곡별 구간 프리셋 - V9)
 */
object SongPresetsTable : Table("song_presets") {
    val id = uuid("id").autoGenerate()
    val songId = uuid("song_id").references(SongsTable.id, onDelete = ReferenceOption.CASCADE)
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val name = text("name")
    val a = decimal("a", 8, 1)
    val b = decimal("b", 8, 1)
    val rate = decimal("rate", 4, 2).default(BigDecimal("1.00"))
    val completed = bool("completed").default(false)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)

    init {
        uniqueIndex(songId, name)
        index(false, userId, songId)
    }
}

/**
 * 6. notes (Gemini 학습 영상 노트)
 */
object NotesTable : Table("notes") {
    val id = uuid("id").autoGenerate()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val videoId = text("video_id")
    val title = text("title")
    val channel = text("channel").default("")
    val tags = array<String>("tags", TextColumnType())
    val memo = text("memo").default("")
    val headline = text("headline").default("")
    val points = array<String>("points", TextColumnType()).default(emptyList())
    val keywords = array<String>("keywords", TextColumnType()).default(emptyList())
    val difficulty = text("difficulty").nullable()
    val analysis = jsonb<JsonElement>("analysis", Json)
    val diagramsSvg = jsonb<JsonElement>("diagrams_svg", Json).default(JsonArray(emptyList()))
    val model = text("model").default("")
    val collectProgressions = bool("collect_progressions").default(false)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

/**
 * 7. analysis_jobs (Gemini 비동기 분석 작업 큐)
 */
object AnalysisJobsTable : Table("analysis_jobs") {
    val id = uuid("id").autoGenerate()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val url = text("url")
    val tags = array<String>("tags", TextColumnType())
    val memo = text("memo").default("")
    val status = text("status").default("queued")
    val error = text("error").nullable()
    val noteId = uuid("note_id").references(NotesTable.id, onDelete = ReferenceOption.SET_NULL).nullable()
    val kind = text("kind").default("note")
    /** V4: 코드 진행 영상 분석 구간·속도 (노트 분석은 NULL) */
    val startSec = integer("start_sec").nullable()
    val endSec = integer("end_sec").nullable()
    val pace = text("pace").nullable()
    /** V5 과금 열(M1-3b가 채운다). 예약 0/0 = 과금 없는 옛 작업, charged NULL = 미정산 */
    val reservedMonthly = integer("reserved_monthly").default(0)
    val reservedPurchased = integer("reserved_purchased").default(0)
    val chargedCredits = integer("charged_credits").nullable()
    val promptTokens = integer("prompt_tokens").nullable()
    val outputTokens = integer("output_tokens").nullable()
    val thoughtsTokens = integer("thoughts_tokens").nullable()
    val modelVersion = text("model_version").nullable()
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val startedAt = timestampWithTimeZone("started_at").nullable()
    val finishedAt = timestampWithTimeZone("finished_at").nullable()

    override val primaryKey = PrimaryKey(id)
}

/**
 * 8. integrations (외부 API 키 보관 - AES-256-GCM 암호화)
 */
object IntegrationsTable : Table("integrations") {
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val appId = text("app_id")
    val provider = text("provider")
    val encryptedSecret = binary("encrypted_secret")
    val iv = binary("iv", 12)
    val keyVersion = short("key_version").default(1)
    val hint = text("hint")
    val config = jsonb<JsonElement>("config", Json).default(JsonObject(emptyMap()))
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(userId, appId, provider)
}

/**
 * 9. notion_sync (사용자별 노션 동기화 상태 및 Push 워커 lease)
 */
object NotionSyncTable : Table("notion_sync") {
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val enabled = bool("enabled").default(false)
    val lastPushAt = timestampWithTimeZone("last_push_at").nullable()
    val lastPullAt = timestampWithTimeZone("last_pull_at").nullable()
    val lastError = text("last_error").nullable()
    val leaseUntil = timestampWithTimeZone("lease_until").nullable()
    val leaseOwner = text("lease_owner").nullable()
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(userId)
}

/**
 * 10. notion_links (로컬 엔티티 ID ↔ 노션 페이지/블록 ID 매핑)
 */
object NotionLinksTable : Table("notion_links") {
    val entity = text("entity")
    val entityId = uuid("entity_id")
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val notionPageId = text("notion_page_id")
    val notionExtra = text("notion_extra").nullable()
    val syncedAt = timestampWithTimeZone("synced_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(entity, entityId)

    init {
        uniqueIndex(userId, notionPageId)
    }
}

/**
 * 11. sync_outbox (노션 실시간 Push 대기열)
 */
object SyncOutboxTable : Table("sync_outbox") {
    val id = long("id").autoIncrement()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val entity = text("entity")
    val entityId = uuid("entity_id")
    val op = text("op")
    val attempts = integer("attempts").default(0)
    val lastError = text("last_error").nullable()
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val doneAt = timestampWithTimeZone("done_at").nullable()

    override val primaryKey = PrimaryKey(id)
}

/**
 * 12. storage_trash (지울 스토리지 파일 대기열)
 */
object StorageTrashTable : Table("storage_trash") {
    val id = long("id").autoIncrement()
    val storageKey = text("storage_key")
    val attempts = integer("attempts").default(0)
    val lastError = text("last_error").nullable()
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

/**
 * 13. categories (사용자 정의 곡 분류 - V2, 노션 미전송)
 */
object CategoriesTable : Table("categories") {
    val id = uuid("id").autoGenerate()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val name = text("name")
    val sortOrder = integer("sort_order").default(0)
    val onHome = bool("on_home").default(true)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)

    init {
        uniqueIndex(userId, id)
    }
}

/**
 * 14. song_categories (곡 ↔ 분류 N:M - V2)
 */
object SongCategoriesTable : Table("song_categories") {
    val userId = uuid("user_id")
    val songId = uuid("song_id")
    val categoryId = uuid("category_id")

    override val primaryKey = PrimaryKey(songId, categoryId)
}

/**
 * 15. progressions (코드 진행 모음 CHORDS - V3. 한 행 = 진행 하나)
 */
object ProgressionsTable : Table("progressions") {
    val id = uuid("id").autoGenerate()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val kind = text("kind")
    val origin = text("origin")
    val route = text("route")
    val evidence = text("evidence").nullable()
    val title = text("title")
    val part = text("part").default("")
    val artist = text("artist").default("")
    val album = text("album").default("")
    val channel = text("channel").default("")
    val releaseDate = date("release_date").nullable()
    val key = text("key").nullable()
    val instrument = text("instrument").nullable()
    val chords = jsonb<JsonElement>("chords", Json)
    val moods = array<String>("moods", TextColumnType()).default(emptyList())
    val genres = array<String>("genres", TextColumnType()).default(emptyList())
    val tags = array<String>("tags", TextColumnType()).default(emptyList())
    val url = text("url").default("")
    val videoId = text("video_id").nullable()
    val startSec = integer("start_sec").nullable()
    val endSec = integer("end_sec").nullable()
    val memo = text("memo").default("")
    val noteId = uuid("note_id").references(NotesTable.id, onDelete = ReferenceOption.SET_NULL).nullable()
    val noteProgIndex = short("note_prog_index").nullable()
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

/**
 * 16. credit_ledger (크레딧 원장, V5). 버킷별 delta 합계 = profiles의 그 버킷 잔액
 */
object CreditLedgerTable : Table("credit_ledger") {
    val id = long("id").autoIncrement()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val bucket = text("bucket")
    val delta = integer("delta")
    val balanceAfter = integer("balance_after")
    val reason = text("reason")
    val period = text("period").nullable()
    val jobId = uuid("job_id").nullable()
    val auditId = long("audit_id").nullable()
    val memo = text("memo").default("")
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

/**
 * 17. admin_audit (owner 관리 작업 기록, V5). 계정 삭제 뒤에도 남도록 FK 없음
 */
object AdminAuditTable : Table("admin_audit") {
    val id = long("id").autoIncrement()
    val actorId = uuid("actor_id")
    val action = text("action")
    val targetUserId = uuid("target_user_id").nullable()
    val targetId = text("target_id").nullable()
    val before = jsonb<JsonElement>("before", Json).nullable()
    val after = jsonb<JsonElement>("after", Json).nullable()
    val reason = text("reason")
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

val ALL_TABLES: List<Table> = listOf(
    SharedPracticeCardsTable, SharedPracticeCardReportsTable,
    UsersTable,
    ProfilesTable,
    SongsTable,
    SessionsTable,
    TakesTable,
    NotesTable,
    AnalysisJobsTable,
    IntegrationsTable,
    NotionSyncTable,
    NotionLinksTable,
    SyncOutboxTable,
    StorageTrashTable,
    CategoriesTable,
    SongCategoriesTable,
    ProgressionsTable,
    CreditLedgerTable,
    AdminAuditTable,
    VideoTitlesTable,
    SharedFoldersTable,
    SharedFolderItemsTable,
    FollowsTable,
    FolderLikesTable,
    FolderReportsTable,
    SongPresetsTable
)


/**
 * V8 커뮤니티 (개발산출물/결과/M1-1_스키마설계.md §2-2 + N1~N3, `V8__community.sql`)
 */
object VideoTitlesTable : Table("video_titles") {
    val videoId = text("video_id")
    val title = text("title")
    val author = text("author").default("")
    val fetchedAt = timestampWithTimeZone("fetched_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(videoId)
}

object SharedFoldersTable : Table("shared_folders") {
    val id = uuid("id").autoGenerate()
    val kind = text("kind")
    val ownerId = uuid("owner_id").nullable()
    val sourceCategoryId = uuid("source_category_id").nullable()
    val title = text("title")
    val titleI18n = jsonb<JsonElement>("title_i18n", Json).default(JsonObject(emptyMap()))
    val descriptionI18n = jsonb<JsonElement>("description_i18n", Json).default(JsonObject(emptyMap()))
    val month = date("month").nullable()
    val isPublic = bool("is_public").default(false)
    val autoSync = bool("auto_sync").default(false)
    val sortOrder = integer("sort_order").default(0)
    val cloneCount = integer("clone_count").default(0)
    val likeCount = integer("like_count").default(0)
    val publishedAt = timestampWithTimeZone("published_at").nullable()
    val hiddenAt = timestampWithTimeZone("hidden_at").nullable()
    val hiddenReason = text("hidden_reason").nullable()
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(id)
}

object SharedFolderItemsTable : Table("shared_folder_items") {
    val folderId = uuid("folder_id").references(SharedFoldersTable.id, onDelete = ReferenceOption.CASCADE)
    val videoId = text("video_id")
    val position = integer("position")
    val a = decimal("a", 8, 1).nullable()
    val b = decimal("b", 8, 1).nullable()
    val rate = decimal("rate", 4, 2).default(BigDecimal("1.00"))
    val noteI18n = jsonb<JsonElement>("note_i18n", Json).default(JsonObject(emptyMap()))
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(folderId, videoId)
}

object FollowsTable : Table("follows") {
    val followerId = uuid("follower_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val followeeId = uuid("followee_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(followerId, followeeId)
}

object FolderLikesTable : Table("folder_likes") {
    val folderId = uuid("folder_id").references(SharedFoldersTable.id, onDelete = ReferenceOption.CASCADE)
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)

    override val primaryKey = PrimaryKey(folderId, userId)
}

object FolderReportsTable : Table("folder_reports") {
    val id = long("id").autoIncrement()
    val folderId = uuid("folder_id").references(SharedFoldersTable.id, onDelete = ReferenceOption.CASCADE)
    val reporterId = uuid("reporter_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val reason = text("reason")
    val detail = text("detail").default("")
    val status = text("status").default("open")
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val resolvedAt = timestampWithTimeZone("resolved_at").nullable()

    override val primaryKey = PrimaryKey(id)
}

object SharedPracticeCardsTable : Table("shared_practice_cards") {
    val id = uuid("id").autoGenerate()
    val sessionId = uuid("session_id").references(SessionsTable.id, onDelete = ReferenceOption.CASCADE).uniqueIndex()
    val userId = uuid("user_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val title = text("title").default("")
    val comment = text("comment").default("")
    val status = text("status").default("published")
    val publishedAt = timestampWithTimeZone("published_at").defaultExpression(CurrentTimestampWithTimeZone)
    val hiddenAt = timestampWithTimeZone("hidden_at").nullable()
    val hiddenReason = text("hidden_reason").nullable()
    val tierPausedAt = timestampWithTimeZone("tier_paused_at").nullable()
    val withdrawnAt = timestampWithTimeZone("withdrawn_at").nullable()
    val publicSession = jsonb<JsonElement>("public_session", Json)
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val updatedAt = timestampWithTimeZone("updated_at").defaultExpression(CurrentTimestampWithTimeZone)
    override val primaryKey = PrimaryKey(id)
}

object SharedPracticeCardReportsTable : Table("shared_practice_card_reports") {
    val id = uuid("id").autoGenerate()
    val cardId = uuid("card_id").references(SharedPracticeCardsTable.id, onDelete = ReferenceOption.CASCADE)
    val reporterId = uuid("reporter_id").references(UsersTable.id, onDelete = ReferenceOption.CASCADE)
    val reason = text("reason")
    val detail = text("detail").default("")
    val status = text("status").default("open")
    val createdAt = timestampWithTimeZone("created_at").defaultExpression(CurrentTimestampWithTimeZone)
    val resolvedAt = timestampWithTimeZone("resolved_at").nullable()
    override val primaryKey = PrimaryKey(id)
}
