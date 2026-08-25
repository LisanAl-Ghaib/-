package com.traces.app.core.domain.repository

import com.traces.app.core.domain.model.TraceMap
import com.traces.app.core.domain.model.TraceMapDraft
import kotlinx.coroutines.flow.Flow

/**
 * Maps are the second storage seam, alongside memories. A Firestore version
 * replaces this class and nothing above it changes.
 */
interface TraceMapRepository {

    /** Public maps plus the user's own, for the home feed and search. */
    fun observeDiscoverable(query: String, includeDemo: Boolean): Flow<List<TraceMap>>

    /** The collection tab: owned or joined, pinned first. */
    fun observeCollection(): Flow<List<TraceMap>>

    fun observeById(id: String): Flow<TraceMap?>

    suspend fun getById(id: String): TraceMap?

    suspend fun create(draft: TraceMapDraft): String

    suspend fun update(id: String, draft: TraceMapDraft)

    suspend fun setPinned(id: String, pinned: Boolean)

    suspend fun setMember(id: String, member: Boolean)

    /** Deletes the map; its points survive, detached from it. */
    suspend fun delete(id: String)

    fun observeDemoCount(): Flow<Int>

    suspend fun deleteAllDemo()
}
