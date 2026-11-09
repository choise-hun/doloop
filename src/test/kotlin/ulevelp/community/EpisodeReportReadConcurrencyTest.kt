package ulevelp.community

import io.ktor.server.testing.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import ulevelp.db.*
import ulevelp.service.AdminService
import ulevelp.support.configureApiTestApp
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Proxy
import java.sql.Connection
import java.sql.PreparedStatement
import javax.sql.DataSource
import kotlin.test.*

class EpisodeReportReadConcurrencyTest : EpisodeTestSupport() {
    @Test fun reportSnapshotSurvivesCommittedCascadeDeletes() = testApplication {
        configureApiTestApp(config)
        val reporter = client.user(false)
        val owner = client.user(owner = true)
        for (target in listOf("session", "song", "user")) {
            val author = client.user()
            val session = session(author)
            val post = client.publish(author, session)
            client.report(reporter, post)
            val publicName = transaction(db) {
                ProfilesTable.selectAll().where { ProfilesTable.id eq author.id }.single()[ProfilesTable.publicName]
            }
            DatabaseFactory.createDataSource(config).use { source ->
                var reads = 0
                var deleted = false
                // JDBC buffers this small result before returning it. Commit the cascade on
                // another connection after the SELECT, before Exposed maps its result rows.
                val observed = object : DataSource by source {
                    override fun getConnection(): Connection = proxy(source.connection) { method, args, result ->
                        if (method == "prepareStatement" && result is PreparedStatement) {
                            val sql = args[0] as String
                            proxy(result) { operation, _, value ->
                                if (operation == "executeQuery" && sql.startsWith("SELECT", true) &&
                                    sql.contains("shared_practice_card_reports", true)) {
                                    reads++
                                    if (!deleted) {
                                        transaction(db) {
                                            when (target) {
                                                "session" -> SessionsTable.deleteWhere { SessionsTable.id eq session }
                                                "song" -> SongsTable.deleteWhere { SongsTable.userId eq author.id }
                                                else -> UsersTable.deleteWhere { UsersTable.id eq author.id }
                                            }
                                        }
                                        deleted = true
                                    }
                                }
                                value
                            }
                        } else result
                    }
                }
                val service = AdminService(DatabaseFactory.connect(observed))
                val response = service.listEpisodeReports(owner.id, "open", 20, null)
                assertTrue(deleted, target)
                val report = response.reports.single()
                assertEquals(post.toString(), report.postId, target)
                assertEquals(author.id.toString(), report.ownerId, target)
                assertEquals(publicName, report.ownerPublicName, target)
                assertEquals(reporter.id.toString(), report.reporterId, target)
                assertNull(response.next, target)
                assertEquals(1, reads, "one report snapshot SELECT: $target")
                assertEquals(0L, cardCount(), target)
                assertEquals(0L, transaction(db) { SharedPracticeCardReportsTable.selectAll().count() }, target)
                assertTrue(service.listEpisodeReports(owner.id, "open", 20, null).reports.isEmpty(), target)
            }
        }
    }

    private inline fun <reified T> proxy(
        delegate: T,
        crossinline after: (String, Array<out Any?>, Any?) -> Any?
    ): T = T::class.java.cast(Proxy.newProxyInstance(T::class.java.classLoader, arrayOf(T::class.java)) { _, method, args ->
        val arguments = args ?: emptyArray()
        val result = try {
            method.invoke(delegate, *arguments)
        } catch (e: InvocationTargetException) {
            throw e.targetException
        }
        after(method.name, arguments, result)
    })
}
