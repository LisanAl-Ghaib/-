package com.traces.app.di

import android.content.Context
import com.traces.app.data.local.TracesDatabase
import com.traces.app.data.local.UserPreferences
import com.traces.app.data.photo.PhotoStorage
import com.traces.app.data.repository.LocalMemoryRepository
import com.traces.app.data.seed.SeedLoader
import com.traces.app.domain.repository.MemoryRepository
import com.traces.app.location.LocationProvider
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

    /** Runs exactly once per install; guarded by a preferences flag. */
    fun seedOnce() {
        applicationScope.launch {
            SeedLoader(appContext, database.memoryDao(), userPreferences).loadIfNeeded()
        }
    }
}
