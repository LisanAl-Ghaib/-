package com.traces.app.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.data.repository.LocalMemoryRepository
import com.traces.app.core.di.AppContainer
import com.traces.app.core.domain.model.ThemeMode
import com.traces.app.core.domain.repository.MemoryRepository
import com.traces.app.core.domain.repository.TraceMapRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SettingsState(
    val authorName: String,
    val themeMode: ThemeMode,
    val showDemoData: Boolean,
    val demoMemoryCount: Int,
    val demoMapCount: Int,
) {
    val hasDemoData: Boolean get() = demoMemoryCount > 0 || demoMapCount > 0
}

class SettingsViewModel(
    private val preferences: UserPreferences,
    private val localRepository: LocalMemoryRepository,
    memoryRepository: MemoryRepository,
    private val mapRepository: TraceMapRepository,
) : ViewModel() {

    val state: StateFlow<SettingsState> = combine(
        preferences.observeAuthorName(),
        preferences.observeThemeMode(),
        preferences.observeShowDemoData(),
        memoryRepository.observeDemoCount(),
        mapRepository.observeDemoCount(),
    ) { name, theme, showDemo, demoMemories, demoMaps ->
        SettingsState(name, theme, showDemo, demoMemories, demoMaps)
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        SettingsState(preferences.authorName, preferences.themeMode, preferences.showDemoData, 0, 0),
    )

    fun setThemeMode(mode: ThemeMode) {
        preferences.themeMode = mode
    }

    fun setShowDemoData(show: Boolean) {
        preferences.showDemoData = show
    }

    fun rename(name: String) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch { localRepository.renameLocalAuthor(trimmed) }
    }

    fun deleteDemoData() {
        viewModelScope.launch {
            localRepository.deleteAllDemo()
            mapRepository.deleteAllDemo()
        }
    }

    companion object {
        fun factory(container: AppContainer) = viewModelFactory {
            initializer {
                SettingsViewModel(
                    preferences = container.userPreferences,
                    localRepository = container.localRepository,
                    memoryRepository = container.memoryRepository,
                    mapRepository = container.mapRepository,
                )
            }
        }
    }
}
