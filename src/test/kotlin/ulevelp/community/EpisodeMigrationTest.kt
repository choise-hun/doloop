package ulevelp.community

import io.ktor.server.testing.*
import org.flywaydb.core.Flyway
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.support.configureApiTestApp
import java.util.UUID
import kotlin.test.*

class EpisodeMigrationTest : EpisodeTestSupport() {
    @Test fun upgradesV9WithoutAutomaticPublication() {
        val schema = "cm_upgrade_" + UUID.randomUUID().toString().replace("-", "")
        fun migration(target: String) = Flyway.configure().dataSource(config.jdbcUrl,config.username,config.password)
            .locations("classpath:db/migration").schemas(schema).defaultSchema(schema).target(target).load()
        try {
            assertEquals(9,migration("9").migrate().migrationsExecuted)
            java.sql.DriverManager.getConnection(config.jdbcUrl,config.username,config.password).use { conn ->
                val user = UUID.randomUUID(); val song = UUID.randomUUID()
                conn.createStatement().use { statement ->
                    statement.execute("INSERT INTO $schema.users(id,email) VALUES ('$user','migration@example.com')")
                    statement.execute("INSERT INTO $schema.songs(id,user_id,title,video_id) VALUES ('$song','$user','private','vid00000001')")
                    statement.execute("INSERT INTO $schema.sessions(user_id,song_id,date) VALUES ('$user','$song','2026-11-09')")
                }
            }
            assertEquals(1,migration("10").migrate().migrationsExecuted)
            java.sql.DriverManager.getConnection(config.jdbcUrl,config.username,config.password).use { conn ->
                conn.createStatement().use { statement ->
                    statement.executeQuery("SELECT count(*) FROM $schema.shared_practice_cards").use { rs -> rs.next(); assertEquals(0,rs.getInt(1)) }
                    statement.executeQuery("SELECT count(*) FROM $schema.sessions").use { rs -> rs.next(); assertEquals(1,rs.getInt(1)) }
                }
            }
        } finally {
            // Generated schema is scoped to this isolated test database.
            java.sql.DriverManager.getConnection(config.jdbcUrl,config.username,config.password).use { conn ->
                conn.createStatement().use { it.execute("DROP SCHEMA IF EXISTS $schema CASCADE") }
            }
        }
    }

    @Test fun databaseConstraintsRejectInvalidRows() = testApplication {
        configureApiTestApp(config)
        val a = client.user(); val s = session(a)
        val invalid = listOf(
            "'moderation_hidden',NULL,NULL,NULL,'{}'::jsonb",
            "'published',now(),'reason',NULL,'{}'::jsonb",
            "'published',NULL,NULL,now(),'{}'::jsonb",
            "'tier_paused',NULL,NULL,NULL,'{}'::jsonb",
            "'published',NULL,NULL,NULL,'[]'::jsonb"
        )
        for (values in invalid) {
            assertFailsWith<org.jetbrains.exposed.exceptions.ExposedSQLException> {
                transaction(db) { exec("INSERT INTO shared_practice_cards(session_id,user_id,status,hidden_at,hidden_reason,tier_paused_at,public_session) VALUES ('$s','${a.id}',$values)") }
            }
            assertEquals(0L,cardCount())
        }
        val p = client.publish(a,s)
        assertFailsWith<org.jetbrains.exposed.exceptions.ExposedSQLException> {
            transaction(db) { exec("INSERT INTO shared_practice_cards(session_id,user_id,public_session) VALUES ('$s','${a.id}','{}')") }
        }
        assertEquals(1L,cardCount())
        val b = client.user(false)
        assertFailsWith<org.jetbrains.exposed.exceptions.ExposedSQLException> {
            transaction(db) { exec("INSERT INTO shared_practice_card_reports(card_id,reporter_id,reason,status,resolved_at) VALUES ('$p','${b.id}','other','resolved',NULL)") }
        }
        assertEquals(0L,transaction(db) { SharedPracticeCardReportsTable.selectAll().count() })
    }
}
