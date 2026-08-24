package com.traces.app.data.photo

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * Copies picked images into the app's private storage.
 *
 * The uri a photo picker returns carries a read grant that dies with the
 * process, and takePersistableUriPermission does not work on it — storing that
 * uri in Room gives the user empty placeholders a day later. So the bytes are
 * copied once and only a relative path is persisted.
 */
class PhotoStorage(context: Context) {

    private val filesDir: File = context.applicationContext.filesDir
    private val contentResolver = context.applicationContext.contentResolver

    /** @return a path relative to filesDir, e.g. "photos/<uuid>.jpg", or null on failure. */
    suspend fun copyToInternal(uri: Uri): String? = withContext(Dispatchers.IO) {
        val relativePath = "$DIR/${UUID.randomUUID()}.jpg"
        val target = File(filesDir, relativePath)
        target.parentFile?.mkdirs()
        runCatching {
            contentResolver.openInputStream(uri)?.use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            } ?: error("openInputStream returned null for $uri")
            relativePath
        }.getOrElse { error ->
            Log.w(TAG, "Failed to copy photo", error)
            target.delete()
            null
        }
    }

    suspend fun delete(relativePath: String?) {
        if (relativePath.isNullOrBlank()) return
        withContext(Dispatchers.IO) {
            runCatching { File(filesDir, relativePath).delete() }
        }
    }

    fun resolve(relativePath: String): File = File(filesDir, relativePath)

    private companion object {
        const val DIR = "photos"
        const val TAG = "PhotoStorage"
    }
}
