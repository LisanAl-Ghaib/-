package com.traces.app.domain.repository

import com.traces.app.domain.model.GeoBounds
import com.traces.app.domain.model.MapMode
import com.traces.app.domain.model.Memory
import com.traces.app.domain.model.MemoryDraft
import kotlinx.coroutines.flow.Flow

/**
 * The single seam between the app and its storage.
 *
 * Everything above this interface is storage-agnostic; swapping the local Room
 * implementation for a Firestore one means writing a second class here and
 * changing one line in AppContainer.
 */
interface MemoryRepository {

    /** Records inside the visible rectangle, filtered by [mode]. */
    fun observeInBounds(bounds: GeoBounds, mode: MapMode): Flow<List<Memory>>

    /** COUNT(*) for the same rectangle — used by the zoomed-out banner. */
    fun observeCountInBounds(bounds: GeoBounds, mode: MapMode): Flow<Int>

    /** Everything the local user wrote, newest experience first. */
    fun observeOwn(): Flow<List<Memory>>

    /** Total number of the local user's records, regardless of viewport. */
    fun observeOwnCount(): Flow<Int>

    suspend fun getById(id: String): Memory?

    /** Returns the id of the created record. */
    suspend fun create(draft: MemoryDraft): String

    suspend fun update(id: String, draft: MemoryDraft)

    suspend fun delete(id: String)
}
