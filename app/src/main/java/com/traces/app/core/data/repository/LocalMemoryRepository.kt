package com.traces.app.core.data.repository

import android.net.Uri
import com.traces.app.core.data.db.MemoryDao
import com.traces.app.core.data.db.MemoryEntity
import com.traces.app.core.data.db.toDomain
import com.traces.app.core.data.media.MediaStorage
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.domain.geo.Geohash
import com.traces.app.core.domain.model.AudioRef
import com.traces.app.core.domain.model.AuthorRef
import com.traces.app.core.domain.model.GeoBounds
import com.traces.app.core.domain.model.MapMode
import com.traces.app.core.domain.model.MAX_PHOTOS
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.domain.model.MemoryDraft
import com.traces.app.core.domain.model.MemoryFilter
import com.traces.app.core.domain.model.PhotoRef
import com.traces.app.core.domain.repository.MemoryRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

/**
 * Room-backed implementation. Also owns the lifecycle of photo files, so a
 * record and its bytes can never drift apart.
 */
class LocalMemoryRepository(
    private val dao: MemoryDao,
    private val mediaStorage: MediaStorage,
    private val preferences: UserPreferences,
) : MemoryRepository {

    override fun observeInBounds(bounds: GeoBounds, mode: MapMode, filter: MemoryFilter): Flow<List<Memory>> =
        when (mode) {
            // Own PRIVATE records are excluded by the query itself, so they can
            // never reach the world map.
            MapMode.WORLD -> dao.observePublicInBounds(
                bounds.south, bounds.north, bounds.west, bounds.east,
                filter.fromYear, filter.toYear, filter.normalisedQuery(), filter.authorId,
                filter.includeDemo,
            )
            MapMode.MINE -> dao.observeOwnInBounds(
                preferences.authorId,
                bounds.south, bounds.north, bounds.west, bounds.east,
                filter.fromYear, filter.toYear, filter.normalisedQuery(),
            )
        }.map { list -> list.map(MemoryEntity::toDomain) }

    override fun observeCountInBounds(bounds: GeoBounds, mode: MapMode, filter: MemoryFilter): Flow<Int> =
        when (mode) {
            MapMode.WORLD -> dao.countPublicInBounds(
                bounds.south, bounds.north, bounds.west, bounds.east,
                filter.fromYear, filter.toYear, filter.normalisedQuery(), filter.authorId,
                filter.includeDemo,
            )
            MapMode.MINE -> dao.countOwnInBounds(
                preferences.authorId,
                bounds.south, bounds.north, bounds.west, bounds.east,
                filter.fromYear, filter.toYear, filter.normalisedQuery(),
            )
        }

    /** Every point filed under one themed map. */
    fun observeByMap(mapId: String): Flow<List<Memory>> =
        dao.observeByMap(mapId).map { list -> list.map(MemoryEntity::toDomain) }

    override fun observeOwn(filter: MemoryFilter): Flow<List<Memory>> =
        dao.observeOwn(preferences.authorId, filter.fromYear, filter.toYear, filter.normalisedQuery())
            .map { list -> list.map(MemoryEntity::toDomain) }

    override fun observeOwnCount(): Flow<Int> = dao.countOwn(preferences.authorId)

    override fun observeAuthors(includeDemo: Boolean): Flow<List<AuthorRef>> =
        dao.observeAuthors(includeDemo).map { rows -> rows.map { AuthorRef(it.authorId, it.authorName) } }

    override fun observeDemoCount(): Flow<Int> = dao.countDemo()

    override suspend fun deleteAllDemo() {
        // Seed rows never carry photos, so there are no files to clean up.
        dao.deleteAllDemo()
    }

    override suspend fun getById(id: String): Memory? = dao.getById(id)?.toDomain()

    override suspend fun create(draft: MemoryDraft): String {
        val id = UUID.randomUUID().toString()
        val text = draft.text
        dao.insert(
            MemoryEntity(
                id = id,
                authorId = preferences.authorId,
                authorName = preferences.authorName,
                lat = draft.lat,
                lng = draft.lng,
                geohash = Geohash.encode(draft.lat, draft.lng),
                text = text,
                textLower = text.lowercase(),
                photoPaths = resolvePhotos(draft.photos),
                audioPath = resolveAudio(draft.audio),
                audioTitle = draft.audio?.title,
                mapId = draft.mapId,
                inPersonalMap = draft.inPersonalMap,
                happenedYear = draft.happenedYear,
                happenedMonth = draft.happenedMonth,
                happenedDay = draft.happenedDay,
                createdAt = System.currentTimeMillis(),
                visibility = draft.visibility.name,
                isSeed = false,
            )
        )
        return id
    }

    override suspend fun update(id: String, draft: MemoryDraft) {
        val existing = dao.getById(id) ?: return
        val text = draft.text
        val photoPaths = resolvePhotos(draft.photos)
        val audioPath = resolveAudio(draft.audio)
        dao.update(
            existing.copy(
                lat = draft.lat,
                lng = draft.lng,
                geohash = Geohash.encode(draft.lat, draft.lng),
                text = text,
                textLower = text.lowercase(),
                photoPaths = photoPaths,
                audioPath = audioPath,
                audioTitle = draft.audio?.title,
                mapId = draft.mapId,
                inPersonalMap = draft.inPersonalMap,
                happenedYear = draft.happenedYear,
                happenedMonth = draft.happenedMonth,
                happenedDay = draft.happenedDay,
                visibility = draft.visibility.name,
                // id and createdAt survive an edit untouched.
            )
        )
        // Only after the row is safely updated, so a failed write never orphans
        // the user's only copy of a photo.
        existing.photoPaths.filterNot { it in photoPaths }.forEach { mediaStorage.delete(it) }
        if (existing.audioPath != null && existing.audioPath != audioPath) {
            mediaStorage.delete(existing.audioPath)
        }
    }

    override suspend fun delete(id: String) {
        val existing = dao.getById(id) ?: return
        dao.deleteById(id)
        existing.photoPaths.forEach { mediaStorage.delete(it) }
        mediaStorage.delete(existing.audioPath)
    }

    /** Keeps already-written records in sync with a renamed local profile. */
    suspend fun renameLocalAuthor(name: String) {
        preferences.authorName = name
        dao.renameAuthor(preferences.authorId, name)
    }

    /**
     * Fills textLower for rows written before the column existed, or by the
     * migration's ASCII-only lower(). Runs once per install.
     */
    suspend fun ensureSearchIndex() {
        if (preferences.searchIndexReady) return
        dao.allTexts().forEach { row -> dao.setTextLower(row.id, row.text.lowercase()) }
        preferences.searchIndexReady = true
    }

    /** Copies anything newly picked into filesDir; already-stored paths pass through. */
    private suspend fun resolvePhotos(photos: List<PhotoRef>): List<String> =
        photos.take(MAX_PHOTOS).mapNotNull { photo ->
            when (photo) {
                is PhotoRef.Stored -> photo.path
                is PhotoRef.Picked -> mediaStorage.copyPhoto(Uri.parse(photo.uri))
            }
        }

    /** Copies a freshly picked track in; an already-stored one passes through. */
    private suspend fun resolveAudio(audio: AudioRef?): String? = when (audio) {
        null -> null
        is AudioRef.Stored -> audio.path
        is AudioRef.Picked -> mediaStorage.copyAudio(Uri.parse(audio.uri))
    }

    private fun MemoryFilter.normalisedQuery(): String = query.trim().lowercase()
}
