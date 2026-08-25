package com.traces.app.core.data.db

import androidx.room.TypeConverter
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Photo paths live in one JSON column, mirroring the array field a Firestore document would carry. */
class Converters {

    @TypeConverter
    fun fromPhotoPaths(paths: List<String>): String = json.encodeToString(paths)

    @TypeConverter
    fun toPhotoPaths(raw: String): List<String> =
        runCatching { json.decodeFromString<List<String>>(raw) }.getOrDefault(emptyList())

    private companion object {
        val json = Json { ignoreUnknownKeys = true }
    }
}
