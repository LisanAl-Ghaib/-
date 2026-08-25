package com.traces.app.feature.collection

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.core.di.AppContainer
import com.traces.app.core.domain.model.TraceMap
import com.traces.app.core.domain.model.TraceMapDraft
import com.traces.app.core.domain.model.Visibility
import com.traces.app.core.domain.repository.TraceMapRepository
import com.traces.app.core.ui.UiState
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class CollectionContent(
    val pinned: List<TraceMap>,
    val rest: List<TraceMap>,
)

class CollectionViewModel(
    private val repository: TraceMapRepository,
) : ViewModel() {

    val uiState: StateFlow<UiState<CollectionContent>> = repository.observeCollection()
        .map { maps ->
            if (maps.isEmpty()) UiState.Empty
            else UiState.Content(
                CollectionContent(
                    pinned = maps.filter { it.isPinned },
                    rest = maps.filterNot { it.isPinned },
                )
            )
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    fun togglePinned(map: TraceMap) {
        viewModelScope.launch { repository.setPinned(map.id, !map.isPinned) }
    }

    fun create(title: String, description: String, emoji: String, visibility: Visibility) {
        val trimmed = title.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            repository.create(
                TraceMapDraft(
                    title = trimmed,
                    description = description.trim(),
                    emoji = emoji,
                    visibility = visibility,
                )
            )
        }
    }

    fun leaveOrDelete(map: TraceMap) {
        viewModelScope.launch {
            // Leaving someone else's map is not the same as deleting your own.
            if (map.isOwn) repository.delete(map.id) else repository.setMember(map.id, false)
        }
    }

    companion object {
        fun factory(container: AppContainer) = viewModelFactory {
            initializer { CollectionViewModel(container.mapRepository) }
        }
    }
}
