package com.traces.app.core.di

import android.content.Context
import com.traces.app.core.data.db.TracesDatabase
import com.traces.app.core.data.photo.PhotoStorage
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.data.repository.LocalMemoryRepository
import com.traces.app.core.data.seed.SeedLoader
import com.traces.app.core.domain.repository.MemoryRepository
import com.traces.app.core.location.LocationProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Hand-rolled dependency graph. Swapping storage means changing the one line
 * that builds [memoryRepository].
 */
class AppContainer(context: Context) {

    private val appContext = context.applicationContext
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val database by lazy { TracesDatabase.getInstance(appContext) }
    private val photoStorage by lazy { PhotoStorage(appContext) }

    val userPreferences by lazy { UserPreferences(appContext) }

    val localRepository: LocalMemoryRepository by lazy {
        LocalMemoryRepository(database.memoryDao(), photoStorage, userPreferences)
    }

    val memoryRepository: MemoryRepository get() = localRepository

    val locationProvider by lazy { LocationProvider(appContext) }

    fun photoFile(relativePath: String) = photoStorage.resolve(relativePath)

    /** Seeds the world map and fills the search column. Both run once per install. */
    fun warmUp() {
        applicationScope.launch {
            SeedLoader(appContext, database.memoryDao(), userPreferences).loadIfNeeded()
            localRepository.ensureSearchIndex()
        }
    }
}
