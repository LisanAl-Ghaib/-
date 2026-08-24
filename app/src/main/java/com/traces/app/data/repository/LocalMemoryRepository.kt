package com.traces.app.data.repository

import android.net.Uri
import com.traces.app.data.local.MemoryDao
import com.traces.app.data.local.MemoryEntity
import com.traces.app.data.local.UserPreferences
import com.traces.app.data.local.toDomain
import com.traces.app.data.photo.PhotoStorage
import com.traces.app.domain.geo.Geohash
import com.traces.app.domain.model.GeoBounds
import com.traces.app.domain.model.MapMode
import com.traces.app.domain.model.Memory
import com.traces.app.domain.model.MemoryDraft
import com.traces.app.domain.model.PhotoInput
import com.traces.app.domain.repository.MemoryRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

/**
 * Room-backed implementation. Also owns the lifecycle of photo files, so a
 * record and its bytes can never drift apart.
 */
class LocalMemoryRepository(
    private val dao: MemoryDao,
    private val photoStorage: PhotoStorage,
    private val preferences: UserPreferences,
) : MemoryRepository {

    override fun observeInBounds(bounds: GeoBounds, mode: MapMode): Flow<List<Memory>> = when (mode) {
        // Own PRIVATE records are excluded by the query itself, so they can
        // never reach the world map.
        MapMode.WORLD -> dao.observePublicInBounds(bounds.south, bounds.north, bounds.west, bounds.east)
        MapMode.MINE -> dao.observeAuthorInBounds(preferences.authorId, bounds.south, bounds.north, bounds.west, bounds.east)
    }.map { list -> list.map(MemoryEntity::toDomain) }

    override fun observeCountInBounds(bounds: GeoBounds, mode: MapMode): Flow<Int> = when (mode) {
        MapMode.WORLD -> dao.countPublicInBounds(bounds.south, bounds.north, bounds.west, bounds.east)
        MapMode.MINE -> dao.countAuthorInBounds(preferences.authorId, bounds.south, bounds.north, bounds.west, bounds.east)
    }

    override fun observeOwn(): Flow<List<Memory>> =
        dao.observeByAuthor(preferences.authorId).map { list -> list.map(MemoryEntity::toDomain) }

    override fun observeOwnCount(): Flow<Int> = dao.countByAuthor(preferences.authorId)

    override suspend fun getById(id: String): Memory? = dao.getById(id)?.toDomain()

    override suspend fun create(draft: MemoryDraft): String {
        val id = UUID.randomUUID().toString()
        val photoPath = when (val photo = draft.photo) {
            is PhotoInput.New -> photoStorage.copyToInternal(Uri.parse(photo.sourceUri))
            PhotoInput.Removed, PhotoInput.Unchanged -> null
        }
        dao.insert(
            MemoryEntity(
                id = id,
                authorId = preferences.authorId,
                authorName = preferences.authorName,
                lat = draft.lat,
                lng = draft.lng,
                geohash = Geohash.encode(draft.lat, draft.lng),
                text = draft.text,
                photoPath = photoPath,
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
        val photoPath = when (val photo = draft.photo) {
            PhotoInput.Unchanged -> existing.photoPath
            PhotoInput.Removed -> null
            is PhotoInput.New -> photoStorage.copyToInternal(Uri.parse(photo.sourceUri))
        }
        dao.update(
            existing.copy(
                lat = draft.lat,
                lng = draft.lng,
                geohash = Geohash.encode(draft.lat, draft.lng),
                text = draft.text,
                photoPath = photoPath,
                happenedYear = draft.happenedYear,
                happenedMonth = draft.happenedMonth,
                happenedDay = draft.happenedDay,
                visibility = draft.visibility.name,
                // id and createdAt survive an edit untouched.
            )
        )
        // Only after the row is safely updated, so a failed write never orphans
        // the user's only copy of the photo.
        if (existing.photoPath != null && existing.photoPath != photoPath) {
            photoStorage.delete(existing.photoPath)
        }
    }

    override suspend fun delete(id: String) {
        val existing = dao.getById(id) ?: return
        dao.deleteById(id)
        photoStorage.delete(existing.photoPath)
    }

    /** Keeps already-written records in sync with a renamed local profile. */
    suspend fun renameLocalAuthor(name: String) {
        preferences.authorName = name
        dao.renameAuthor(preferences.authorId, name)
    }
}
