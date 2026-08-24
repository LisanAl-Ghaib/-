package com.traces.app.ui.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.data.local.UserPreferences
import com.traces.app.di.AppContainer
import com.traces.app.domain.model.GeoBounds
import com.traces.app.domain.model.GeoPoint
import com.traces.app.domain.model.MapMode
import com.traces.app.domain.model.Memory
import com.traces.app.domain.repository.MemoryRepository
import com.traces.app.location.LocationProvider
import com.traces.app.ui.UiState
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

class MapViewModel(
    private val repository: MemoryRepository,
    private val preferences: UserPreferences,
    private val locationProvider: LocationProvider,
) : ViewModel() {

    private val _mode = MutableStateFlow(MapMode.WORLD)
    val mode: StateFlow<MapMode> = _mode.asStateFlow()

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

    @OptIn(ExperimentalCoroutinesApi::class)
    val uiState: StateFlow<UiState<MapContent>> =
        combine(_mode, _bounds) { mode, bounds -> mode to bounds }
            .flatMapLatest { (mode, bounds) ->
                if (bounds == null) flowOf<UiState<MapContent>>(UiState.Loading)
                else contentFlow(mode, bounds)
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    private fun contentFlow(mode: MapMode, bounds: GeoBounds): Flow<UiState<MapContent>> = combine(
        repository.observeInBounds(bounds, mode),
        repository.observeCountInBounds(bounds, mode),
        repository.observeOwnCount(),
    ) { memories, visibleCount, ownTotal ->
        // Empty means "you have written nothing yet", not "nothing in this
        // rectangle" — otherwise the call to action would flash every time the
        // user panned away from their own pins.
        if (mode == MapMode.MINE && ownTotal == 0) UiState.Empty
        else UiState.Content(MapContent(memories, visibleCount))
    }

    fun onModeChange(mode: MapMode) {
        _mode.value = mode
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

    fun dismissLocationNotice() {
        _locationDenied.value = false
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
