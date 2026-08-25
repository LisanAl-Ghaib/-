package com.traces.app.core.data.repository

import com.traces.app.core.data.db.MemoryDao
import com.traces.app.core.data.db.MemoryEntity
import com.traces.app.core.data.db.TraceMapDao
import com.traces.app.core.data.db.toDomain
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.domain.model.LOCAL_AUTHOR_ID
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.domain.model.Profile
import com.traces.app.core.domain.model.ProfileCode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * People, assembled from what is already in the database.
 *
 * There is no user table and no server: a profile is whoever has written
 * something, plus the local user. The code is derived from the id, so it needs
 * no storage and never drifts.
 */
class LocalProfileRepository(
    private val memoryDao: MemoryDao,
    private val mapDao: TraceMapDao,
    private val preferences: UserPreferences,
) {

    fun observeProfiles(includeDemo: Boolean): Flow<List<Profile>> = combine(
        memoryDao.observeProfiles(includeDemo),
        mapDao.observeMapCounts(includeDemo),
        preferences.observeAuthorName(),
    ) { people, mapCounts, localName ->
        val mapsByOwner = mapCounts.associate { it.ownerId to it.mapCount }
        val known = people.map { row ->
            val local = row.authorId == LOCAL_AUTHOR_ID
            Profile(
                id = row.authorId,
                name = if (local) localName else row.authorName,
                code = ProfileCode.forId(row.authorId),
                memoryCount = row.memoryCount,
                mapCount = mapsByOwner[row.authorId] ?: 0,
                earliestYear = row.earliestYear,
                isLocal = local,
            )
        }
        // The local user exists even before writing anything.
        if (known.any { it.isLocal }) known else known + localProfile(localName, mapsByOwner)
    }

    fun observeProfile(authorId: String, includeDemo: Boolean): Flow<Profile?> =
        observeProfiles(includeDemo).map { list -> list.firstOrNull { it.id == authorId } }

    /** Public points by one person; the local user also sees their private ones. */
    fun observeVisiblePoints(authorId: String): Flow<List<Memory>> =
        memoryDao.observeVisibleByAuthor(authorId, preferences.authorId)
            .map { list -> list.map(MemoryEntity::toDomain) }

    fun localCode(): String = ProfileCode.forId(preferences.authorId)

    /** Resolves a typed or scanned code to whoever it belongs to. */
    suspend fun findByCode(raw: String, includeDemo: Boolean): Profile? {
        val wanted = ProfileCode.normalise(raw)
        if (wanted.isEmpty()) return null
        return observeProfiles(includeDemo).first()
            .firstOrNull { ProfileCode.normalise(it.code) == wanted }
    }

    private fun localProfile(name: String, mapsByOwner: Map<String, Int>) = Profile(
        id = LOCAL_AUTHOR_ID,
        name = name,
        code = ProfileCode.forId(LOCAL_AUTHOR_ID),
        memoryCount = 0,
        mapCount = mapsByOwner[LOCAL_AUTHOR_ID] ?: 0,
        earliestYear = null,
        isLocal = true,
    )
}
