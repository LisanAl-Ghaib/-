package com.traces.app.core.data.seed

import android.content.Context
import android.util.Log
import com.traces.app.core.data.db.MemoryDao
import com.traces.app.core.data.db.MemoryEntity
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.domain.geo.Geohash
import com.traces.app.core.domain.model.Visibility
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.util.UUID

/**
 * Fills the world map once, on first launch.
 *
 * Called from AppContainer on an application scope — never from
 * RoomDatabase.Callback.onCreate, which would deadlock against the database
 * that is still being constructed.
 */
class SeedLoader(
    private val context: Context,
    private val dao: MemoryDao,
    private val preferences: UserPreferences,
) {

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun loadIfNeeded() = withContext(Dispatchers.IO) {
        if (preferences.seedLoaded) return@withContext
        runCatching {
            if (dao.totalCount() == 0) {
                dao.insertAll(readSeed())
            }
            preferences.seedLoaded = true
        }.onFailure { Log.e(TAG, "Seeding failed", it) }
        Unit
    }

    private fun readSeed(): List<MemoryEntity> {
        val raw = context.assets.open(ASSET).bufferedReader().use { it.readText() }
        val parsed = json.decodeFromString<List<SeedMemoryJson>>(raw)

        // One author id per distinct name, stable across the whole file.
        val authorIds = parsed.map { it.authorName }.distinct()
            .withIndex()
            .associate { (index, name) -> name to "seed_$index" }

        val now = System.currentTimeMillis()
        return parsed.map { item ->
            MemoryEntity(
                id = UUID.randomUUID().toString(),
                authorId = authorIds.getValue(item.authorName),
                authorName = item.authorName,
                lat = item.lat,
                lng = item.lng,
                geohash = Geohash.encode(item.lat, item.lng),
                text = item.text,
                textLower = item.text.lowercase(),
                photoPaths = emptyList(),
                audioPath = null,
                audioTitle = null,
                happenedYear = item.happenedYear,
                happenedMonth = item.happenedMonth,
                happenedDay = item.happenedDay,
                createdAt = now,
                visibility = Visibility.PUBLIC.name,
                isSeed = true,
            )
        }
    }

    private companion object {
        const val ASSET = "seed_memories.json"
        const val TAG = "SeedLoader"
    }
}
