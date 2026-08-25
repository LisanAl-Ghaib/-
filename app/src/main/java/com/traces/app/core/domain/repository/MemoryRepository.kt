package com.traces.app.core.domain.repository

import com.traces.app.core.domain.model.AuthorRef
import com.traces.app.core.domain.model.GeoBounds
import com.traces.app.core.domain.model.MapMode
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.domain.model.MemoryDraft
import com.traces.app.core.domain.model.MemoryFilter
import kotlinx.coroutines.flow.Flow

/**
 * The single seam between the app and its storage.
 *
 * Everything above this interface is storage-agnostic; swapping the local Room
 * implementation for a Firestore one means writing a second class here and
 * changing one line in AppContainer.
 */
interface MemoryRepository {

    /** Records inside the visible rectangle, narrowed by [mode] and [filter]. */
    fun observeInBounds(bounds: GeoBounds, mode: MapMode, filter: MemoryFilter): Flow<List<Memory>>

    /** COUNT(*) for the same rectangle and filter — used by the zoomed-out banner. */
    fun observeCountInBounds(bounds: GeoBounds, mode: MapMode, filter: MemoryFilter): Flow<Int>

    /** Everything the local user wrote, newest experience first. */
    fun observeOwn(filter: MemoryFilter = MemoryFilter.None): Flow<List<Memory>>

    /** Total number of the local user's records, ignoring viewport and filter. */
    fun observeOwnCount(): Flow<Int>

    /** Distinct authors of public records, for the author filter. */
    fun observeAuthors(): Flow<List<AuthorRef>>

    suspend fun getById(id: String): Memory?

    /** Returns the id of the created record. */
    suspend fun create(draft: MemoryDraft): String

    suspend fun update(id: String, draft: MemoryDraft)

    suspend fun delete(id: String)
}
