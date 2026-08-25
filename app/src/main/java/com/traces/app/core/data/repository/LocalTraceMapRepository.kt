package com.traces.app.core.data.repository

import com.traces.app.core.data.db.MemoryDao
import com.traces.app.core.data.db.TraceMapDao
import com.traces.app.core.data.db.TraceMapEntity
import com.traces.app.core.data.db.toDomain
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.domain.model.TraceMap
import com.traces.app.core.domain.model.TraceMapDraft
import com.traces.app.core.domain.repository.TraceMapRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

class LocalTraceMapRepository(
    private val mapDao: TraceMapDao,
    private val memoryDao: MemoryDao,
    private val preferences: UserPreferences,
) : TraceMapRepository {

    override fun observeDiscoverable(query: String, includeDemo: Boolean): Flow<List<TraceMap>> =
        mapDao.observeDiscoverable(preferences.authorId, query.trim().lowercase(), includeDemo)
            .map { rows -> rows.map { it.toDomain() } }

    override fun observeCollection(): Flow<List<TraceMap>> =
        mapDao.observeCollection(preferences.authorId).map { rows -> rows.map { it.toDomain() } }

    override fun observeById(id: String): Flow<TraceMap?> =
        mapDao.observeById(id).map { row -> row?.toDomain() }

    override suspend fun getById(id: String): TraceMap? = mapDao.getById(id)?.toDomain()

    override suspend fun create(draft: TraceMapDraft): String {
        val id = UUID.randomUUID().toString()
        mapDao.insert(
            TraceMapEntity(
                id = id,
                title = draft.title,
                titleLower = draft.title.lowercase(),
                description = draft.description,
                emoji = draft.emoji,
                ownerId = preferences.authorId,
                ownerName = preferences.authorName,
                visibility = draft.visibility.name,
                isPinned = false,
                // Creating a map is the strongest possible form of joining it.
                isMember = true,
                createdAt = System.currentTimeMillis(),
                isSeed = false,
            )
        )
        return id
    }

    override suspend fun update(id: String, draft: TraceMapDraft) {
        val existing = mapDao.getById(id)?.map ?: return
        mapDao.update(
            existing.copy(
                title = draft.title,
                titleLower = draft.title.lowercase(),
                description = draft.description,
                emoji = draft.emoji,
                visibility = draft.visibility.name,
            )
        )
    }

    override suspend fun setPinned(id: String, pinned: Boolean) = mapDao.setPinned(id, pinned)

    override suspend fun setMember(id: String, member: Boolean) = mapDao.setMember(id, member)

    override suspend fun delete(id: String) {
        // Points outlive the map they were filed under; losing a collection
        // should not silently destroy what people wrote.
        memoryDao.detachFromMap(id)
        mapDao.deleteById(id)
    }

    override fun observeDemoCount(): Flow<Int> = mapDao.countDemo()

    override suspend fun deleteAllDemo() {
        mapDao.deleteAllDemo()
    }
}
