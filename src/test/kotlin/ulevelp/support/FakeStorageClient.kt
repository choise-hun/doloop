package ulevelp.support

import kotlinx.coroutines.delay
import ulevelp.storage.StorageClient
import ulevelp.storage.StorageException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

class FakeStorageClient : StorageClient {
    val objects = ConcurrentHashMap<String, ByteArray>()
    val deleted = CopyOnWriteArrayList<String>()
    val downloadCount = AtomicInteger(0)
    @Volatile var failUpload = false
    @Volatile var failSign = false
    @Volatile var failDelete = false
    @Volatile var failDownload = false
    @Volatile var uploadDelayMs = 0L
    @Volatile var onUploadStart: (suspend (String) -> Unit)? = null
    @Volatile var onUploadSuccess: ((String) -> Unit)? = null

    override suspend fun upload(key: String, bytes: ByteArray, contentType: String) {
        onUploadStart?.invoke(key)
        if (uploadDelayMs > 0) {
            delay(uploadDelayMs)
        }
        if (failUpload) {
            throw StorageException("Fake upload failure")
        }
        objects[key] = bytes
        onUploadSuccess?.invoke(key)
    }

    override suspend fun createSignedUrl(key: String, expiresInSec: Int): String {
        if (failSign) {
            throw StorageException("Fake sign failure")
        }
        return "https://fake.storage/$key?exp=$expiresInSec"
    }

    override suspend fun delete(key: String) {
        if (failDelete) {
            throw StorageException("Fake delete failure")
        }
        objects.remove(key)
        deleted.add(key)
    }

    override suspend fun download(key: String): ByteArray {
        downloadCount.incrementAndGet()
        if (failDownload) {
            throw StorageException("Fake download failure")
        }
        return objects[key] ?: throw StorageException("Fake object not found: $key")
    }
}

