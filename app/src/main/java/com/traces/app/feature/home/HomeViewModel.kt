package com.traces.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.di.AppContainer
import com.traces.app.core.domain.model.FeedRow
import com.traces.app.core.domain.model.FeedSection
import com.traces.app.core.domain.model.TraceMap
import com.traces.app.core.domain.repository.TraceMapRepository
import com.traces.app.core.ui.UiState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

private const val ROW_LIMIT = 12

data class HomeContent(
    /** Populated when the search box is empty. */
    val rows: List<FeedRow>,
    /** Populated instead when the user is searching. */
    val results: List<TraceMap>,
    val searching: Boolean,
)

class HomeViewModel(
    private val mapRepository: TraceMapRepository,
    preferences: UserPreferences,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val showDemo: Flow<Boolean> = preferences.observeShowDemoData()

    @OptIn(ExperimentalCoroutinesApi::class)
    val uiState: StateFlow<UiState<HomeContent>> =
        combine(_query, showDemo) { query, demo -> query to demo }
            .flatMapLatest { (query, demo) ->
                mapRepository.observeDiscoverable(query, demo).map { maps -> toContent(query, maps) }
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    /**
     * With no backend there is nothing to personalise against, so the sections
     * are honest orderings of what exists rather than a pretend recommender:
     * what the user already joined, what has the most points, what is newest.
     */
    private fun toContent(query: String, maps: List<TraceMap>): UiState<HomeContent> {
        if (query.isNotBlank()) {
            return if (maps.isEmpty()) UiState.Empty
            else UiState.Content(HomeContent(rows = emptyList(), results = maps, searching = true))
        }
        if (maps.isEmpty()) return UiState.Empty

        val joined = maps.filter { it.isMember || it.isOwn }
        // observeDiscoverable already orders by point count.
        val popular = maps.filter { it.pointCount > 0 }
        val recent = maps.sortedByDescending { it.createdAt }

        val rows = buildList {
            if (joined.isNotEmpty()) add(FeedRow(FeedSection.FOR_YOU, joined.take(ROW_LIMIT)))
            if (popular.isNotEmpty()) add(FeedRow(FeedSection.POPULAR, popular.take(ROW_LIMIT)))
            add(FeedRow(FeedSection.RECENT, recent.take(ROW_LIMIT)))
        }
        return UiState.Content(HomeContent(rows = rows, results = emptyList(), searching = false))
    }

    fun onQueryChange(value: String) {
        _query.value = value
    }

    companion object {
        fun factory(container: AppContainer) = viewModelFactory {
            initializer { HomeViewModel(container.mapRepository, container.userPreferences) }
        }
    }
}
