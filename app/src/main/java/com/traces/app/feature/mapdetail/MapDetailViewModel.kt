package com.traces.app.feature.mapdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.core.data.repository.LocalMemoryRepository
import com.traces.app.core.di.AppContainer
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.domain.model.TraceMap
import com.traces.app.core.domain.repository.TraceMapRepository
import com.traces.app.core.ui.UiState
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class MapDetailContent(
    val map: TraceMap,
    val points: List<Memory>,
)

class MapDetailViewModel(
    private val mapRepository: TraceMapRepository,
    memoryRepository: LocalMemoryRepository,
    private val mapId: String,
) : ViewModel() {

    val uiState: StateFlow<UiState<MapDetailContent>> = combine(
        mapRepository.observeById(mapId),
        memoryRepository.observeByMap(mapId),
    ) { map, points ->
        if (map == null) UiState.Empty else UiState.Content(MapDetailContent(map, points))
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    fun toggleMembership(map: TraceMap) {
        viewModelScope.launch { mapRepository.setMember(map.id, !map.isMember) }
    }

    fun togglePinned(map: TraceMap) {
        viewModelScope.launch { mapRepository.setPinned(map.id, !map.isPinned) }
    }

    companion object {
        fun factory(container: AppContainer, mapId: String) = viewModelFactory {
            initializer {
                MapDetailViewModel(container.mapRepository, container.localRepository, mapId)
            }
        }
    }
}
