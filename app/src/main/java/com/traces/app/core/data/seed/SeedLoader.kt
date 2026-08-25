package com.traces.app.core.data.seed

import android.content.Context
import android.util.Log
import com.traces.app.core.data.db.MemoryDao
import com.traces.app.core.data.db.MemoryEntity
import com.traces.app.core.data.db.TraceMapDao
import com.traces.app.core.data.db.TraceMapEntity
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.domain.geo.Geohash
import com.traces.app.core.domain.model.Visibility
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.util.UUID

/**
 * Fills the world map and the map feed once, on first launch.
 *
 * Called from AppContainer on an application scope — never from
 * RoomDatabase.Callback.onCreate, which would deadlock against the database
 * that is still being constructed.
 */
class SeedLoader(
    private val context: Context,
    private val memoryDao: MemoryDao,
    private val mapDao: TraceMapDao,
    private val preferences: UserPreferences,
) {

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun loadIfNeeded() = withContext(Dispatchers.IO) {
        if (preferences.seedLoaded) return@withContext
        runCatching {
            if (mapDao.totalCount() == 0) mapDao.insertAll(readMaps())
            if (memoryDao.totalCount() == 0) memoryDao.insertAll(readMemories())
            preferences.seedLoaded = true
        }.onFailure { Log.e(TAG, "Seeding failed", it) }
        Unit
    }

    private fun readMaps(): List<TraceMapEntity> {
        val parsed = json.decodeFromString<List<SeedMapJson>>(readAsset(MAPS_ASSET))
        val now = System.currentTimeMillis()
        return parsed.mapIndexed { index, item ->
            TraceMapEntity(
                id = item.id,
                title = item.title,
                titleLower = item.title.lowercase(),
                description = item.description,
                emoji = item.emoji,
                ownerId = "seed_owner_$index",
                ownerName = item.ownerName,
                visibility = Visibility.PUBLIC.name,
                isPinned = false,
                // The local user is not a member of the examples until they join.
                isMember = false,
                createdAt = now,
                isSeed = true,
            )
        }
    }

    private fun readMemories(): List<MemoryEntity> {
        val parsed = json.decodeFromString<List<SeedMemoryJson>>(readAsset(MEMORIES_ASSET))

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
                mapId = item.map,
                // Seeded points belong to strangers, so they are on nobody's
                // personal map.
                inPersonalMap = false,
                happenedYear = item.happenedYear,
                happenedMonth = item.happenedMonth,
                happenedDay = item.happenedDay,
                createdAt = now,
                visibility = Visibility.PUBLIC.name,
                isSeed = true,
            )
        }
    }

    private fun readAsset(name: String): String =
        context.assets.open(name).bufferedReader().use { it.readText() }

    private companion object {
        const val MEMORIES_ASSET = "seed_memories.json"
        const val MAPS_ASSET = "seed_maps.json"
        const val TAG = "SeedLoader"
    }
}
