package com.traces.app.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.data.repository.LocalMemoryRepository
import com.traces.app.core.di.AppContainer
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.domain.model.MemoryFilter
import com.traces.app.core.ui.UiState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ProfileContent(
    /** Newest experience first — the timeline order. */
    val memories: List<Memory>,
    val earliestYear: Int,
)

class ProfileViewModel(
    private val repository: LocalMemoryRepository,
    preferences: UserPreferences,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    val authorName: StateFlow<String> = preferences.observeAuthorName()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), preferences.authorName)

    /** Total records the user owns, ignoring the search box. */
    val totalCount: StateFlow<Int> = repository.observeOwnCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    @OptIn(ExperimentalCoroutinesApi::class)
    val uiState: StateFlow<UiState<ProfileContent>> = _query
        .flatMapLatest { query -> repository.observeOwn(MemoryFilter(query = query)) }
        .map(::toUiState)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    private fun toUiState(memories: List<Memory>): UiState<ProfileContent> =
        if (memories.isEmpty()) {
            UiState.Empty
        } else {
            UiState.Content(
                ProfileContent(
                    memories = memories,
                    earliestYear = memories.minOf { it.happenedYear },
                )
            )
        }

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun delete(id: String) {
        viewModelScope.launch { repository.delete(id) }
    }

    fun rename(name: String) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch { repository.renameLocalAuthor(trimmed) }
    }

    companion object {
        fun factory(container: AppContainer) = viewModelFactory {
            initializer { ProfileViewModel(container.localRepository, container.userPreferences) }
        }
    }
}
