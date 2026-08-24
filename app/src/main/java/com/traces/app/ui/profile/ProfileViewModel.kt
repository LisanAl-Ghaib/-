package com.traces.app.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.data.local.UserPreferences
import com.traces.app.data.repository.LocalMemoryRepository
import com.traces.app.di.AppContainer
import com.traces.app.domain.model.Memory
import com.traces.app.ui.UiState
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
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

    val authorName: StateFlow<String> = preferences.observeAuthorName()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), preferences.authorName)

    val uiState: StateFlow<UiState<ProfileContent>> = repository.observeOwn()
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
