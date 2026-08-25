package com.traces.app.core.data.media

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * Copies picked media into the app's private storage.
 *
 * The uri a picker returns carries a read grant that dies with the process, and
 * takePersistableUriPermission does not work on the photo picker's uris — store
 * one in Room and the user sees empty placeholders a day later. So the bytes are
 * copied once and only a relative path is persisted.
 */
class MediaStorage(context: Context) {

    private val filesDir: File = context.applicationContext.filesDir
    private val contentResolver = context.applicationContext.contentResolver

    /** @return a path relative to filesDir, e.g. "photos/<uuid>.jpg", or null on failure. */
    suspend fun copyPhoto(uri: Uri): String? = copy(uri, PHOTOS, "jpg")

    /** @return a path relative to filesDir, e.g. "audio/<uuid>.m4a", or null on failure. */
    suspend fun copyAudio(uri: Uri): String? = copy(uri, AUDIO, "m4a")

    /** The name the file had wherever the user picked it, for display. */
    suspend fun displayName(uri: Uri): String? = withContext(Dispatchers.IO) {
        runCatching {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) cursor.getString(0) else null
                }
        }.getOrNull()
    }

    suspend fun delete(relativePath: String?) {
        if (relativePath.isNullOrBlank()) return
        withContext(Dispatchers.IO) {
            runCatching { File(filesDir, relativePath).delete() }
        }
    }

    fun resolve(relativePath: String): File = File(filesDir, relativePath)

    private suspend fun copy(uri: Uri, dir: String, extension: String): String? = withContext(Dispatchers.IO) {
        val relativePath = "$dir/${UUID.randomUUID()}.$extension"
        val target = File(filesDir, relativePath)
        target.parentFile?.mkdirs()
        runCatching {
            contentResolver.openInputStream(uri)?.use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            } ?: error("openInputStream returned null for $uri")
            relativePath
        }.getOrElse { error ->
            Log.w(TAG, "Failed to copy media", error)
            target.delete()
            null
        }
    }

    private companion object {
        const val PHOTOS = "photos"
        const val AUDIO = "audio"
        const val TAG = "MediaStorage"
    }
}
