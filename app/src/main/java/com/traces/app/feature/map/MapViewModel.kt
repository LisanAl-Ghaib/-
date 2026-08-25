package com.traces.app.feature.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.di.AppContainer
import com.traces.app.core.domain.model.AuthorRef
import com.traces.app.core.domain.model.GeoBounds
import com.traces.app.core.domain.model.GeoPoint
import com.traces.app.core.domain.model.MapMode
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.domain.model.MemoryFilter
import com.traces.app.core.domain.repository.MemoryRepository
import com.traces.app.core.location.LocationProvider
import com.traces.app.core.ui.UiState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class MapContent(
    /** Records inside the viewport — the pins. */
    val memories: List<Memory>,
    /** COUNT(*) for the same viewport — the zoomed-out banner. */
    val visibleCount: Int,
)

/** Why the map has nothing to show, which decides what the empty state says. */
enum class EmptyReason { NO_OWN_MEMORIES, FILTERED_OUT }

class MapViewModel(
    private val repository: MemoryRepository,
    private val preferences: UserPreferences,
    private val locationProvider: LocationProvider,
) : ViewModel() {

    private val _mode = MutableStateFlow(MapMode.WORLD)
    val mode: StateFlow<MapMode> = _mode.asStateFlow()

    /** What the filter sheet controls. The demo toggle is folded in separately. */
    private val _filter = MutableStateFlow(MemoryFilter.None)
    val filter: StateFlow<MemoryFilter> = _filter.asStateFlow()

    private val showDemo: Flow<Boolean> = preferences.observeShowDemoData()

    private val effectiveFilter: Flow<MemoryFilter> =
        combine(_filter, showDemo) { filter, demo -> filter.copy(includeDemo = demo) }

    /** Null until the map reports its first laid-out viewport. */
    private val _bounds = MutableStateFlow<GeoBounds?>(null)

    private val _userLocation = MutableStateFlow<GeoPoint?>(null)
    val userLocation: StateFlow<GeoPoint?> = _userLocation.asStateFlow()

    private val _hasLocationPermission = MutableStateFlow(locationProvider.hasPermission())
    val hasLocationPermission: StateFlow<Boolean> = _hasLocationPermission.asStateFlow()

    /** True once the user has actually turned the permission down. */
    private val _locationDenied = MutableStateFlow(false)
    val locationDenied: StateFlow<Boolean> = _locationDenied.asStateFlow()

    private val _hintVisible = MutableStateFlow(!preferences.hintShown)
    val hintVisible: StateFlow<Boolean> = _hintVisible.asStateFlow()

    /** The empty-state card is advice, not a modal — it can be waved away. */
    private val _emptyCardDismissed = MutableStateFlow(false)
    val emptyCardDismissed: StateFlow<Boolean> = _emptyCardDismissed.asStateFlow()

    private val _emptyReason = MutableStateFlow(EmptyReason.NO_OWN_MEMORIES)
    val emptyReason: StateFlow<EmptyReason> = _emptyReason.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    val authors: StateFlow<List<AuthorRef>> = showDemo
        .flatMapLatest { demo -> repository.observeAuthors(demo) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    @OptIn(ExperimentalCoroutinesApi::class)
    val uiState: StateFlow<UiState<MapContent>> =
        combine(_mode, _bounds, effectiveFilter) { mode, bounds, filter -> Triple(mode, bounds, filter) }
            .flatMapLatest { (mode, bounds, filter) ->
                if (bounds == null) flowOf<UiState<MapContent>>(UiState.Loading)
                else contentFlow(mode, bounds, filter)
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    private fun contentFlow(
        mode: MapMode,
        bounds: GeoBounds,
        filter: MemoryFilter,
    ): Flow<UiState<MapContent>> = combine(
        repository.observeInBounds(bounds, mode, filter),
        repository.observeCountInBounds(bounds, mode, filter),
        repository.observeOwnCount(),
    ) { memories, visibleCount, ownTotal ->
        // "You have written nothing yet" and "the filter hides everything" are
        // different problems and deserve different words, so the reason is
        // recorded alongside the state.
        val ownEmpty = mode == MapMode.MINE && ownTotal == 0
        val filteredOut = filter.isActive && visibleCount == 0
        when {
            ownEmpty -> {
                _emptyReason.value = EmptyReason.NO_OWN_MEMORIES
                UiState.Empty
            }
            filteredOut -> {
                _emptyReason.value = EmptyReason.FILTERED_OUT
                UiState.Empty
            }
            else -> UiState.Content(MapContent(memories, visibleCount))
        }
    }

    fun onModeChange(mode: MapMode) {
        _mode.value = mode
        _emptyCardDismissed.value = false
        // The author filter only exists on the world map; carrying it into the
        // personal map would silently hide the user's own pins.
        if (mode == MapMode.MINE) _filter.value = _filter.value.copy(authorId = null)
    }

    fun onFilterChange(filter: MemoryFilter) {
        _filter.value = filter
        _emptyCardDismissed.value = false
    }

    fun clearFilter() {
        _filter.value = MemoryFilter.None
        _emptyCardDismissed.value = false
    }

    fun dismissEmptyCard() {
        _emptyCardDismissed.value = true
    }

    /** Called from a debounced collector — see MapScreen. */
    fun onBoundsChange(bounds: GeoBounds) {
        _bounds.value = bounds
    }

    fun onLocationPermissionResult(granted: Boolean) {
        _hasLocationPermission.value = granted
        _locationDenied.value = !granted
        if (granted) refreshUserLocation()
    }

    fun refreshUserLocation() {
        viewModelScope.launch {
            _userLocation.value = locationProvider.currentLocation()
        }
    }

    fun dismissHint() {
        preferences.hintShown = true
        _hintVisible.value = false
    }

    fun dismissLocationNotice() {
        _locationDenied.value = false
    }

    fun delete(id: String) {
        viewModelScope.launch { repository.delete(id) }
    }

    companion object {
        fun factory(container: AppContainer) = viewModelFactory {
            initializer {
                MapViewModel(
                    repository = container.memoryRepository,
                    preferences = container.userPreferences,
                    locationProvider = container.locationProvider,
                )
            }
        }
    }
}
