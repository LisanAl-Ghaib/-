package com.traces.app.ui.map

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.clustering.ClusterItem
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.MapsComposeExperimentalApi
import com.google.maps.android.compose.clustering.Clustering
import com.google.maps.android.compose.rememberCameraPositionState
import com.traces.app.R
import com.traces.app.domain.model.GeoBounds
import com.traces.app.domain.model.MapMode
import com.traces.app.domain.model.Memory
import com.traces.app.location.LocationProvider
import com.traces.app.ui.UiState
import com.traces.app.ui.common.LocalAppContainer
import com.traces.app.ui.memory.CreateMemorySheet
import com.traces.app.ui.memory.EditorMode
import com.traces.app.ui.memory.MemoryDetailSheet
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

private const val MIN_MARKER_ZOOM = 11f
private const val BOUNDS_DEBOUNCE_MS = 200L
private const val CLUSTER_ZOOM_STEP = 2f
private val PARIS = LatLng(48.8566, 2.3522)

/** maps-android clusters anything implementing this. */
private data class MemoryClusterItem(val memory: Memory) : ClusterItem {
    override fun getPosition(): LatLng = LatLng(memory.lat, memory.lng)
    override fun getTitle(): String? = null
    override fun getSnippet(): String? = null
}

@OptIn(MapsComposeExperimentalApi::class, FlowPreview::class)
@Composable
fun MapScreen() {
    val container = LocalAppContainer.current
    val viewModel: MapViewModel = viewModel(factory = MapViewModel.factory(container))

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val mode by viewModel.mode.collectAsStateWithLifecycle()
    val userLocation by viewModel.userLocation.collectAsStateWithLifecycle()
    val hasLocationPermission by viewModel.hasLocationPermission.collectAsStateWithLifecycle()
    val hintVisible by viewModel.hintVisible.collectAsStateWithLifecycle()
    val locationDenied by viewModel.locationDenied.collectAsStateWithLifecycle()

    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val darkTheme = isSystemInDarkTheme()

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(PARIS, 13f)
    }
    var mapLoaded by remember { mutableStateOf(false) }
    var centeredOnUser by rememberSaveable { mutableStateOf(false) }

    var editorMode by remember { mutableStateOf<EditorMode?>(null) }
    var detailMemory by remember { mutableStateOf<Memory?>(null) }

    // --- Location permission ------------------------------------------------
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        viewModel.onLocationPermissionResult(grants.values.any { it })
    }
    LaunchedEffect(Unit) {
        if (hasLocationPermission) viewModel.refreshUserLocation()
        else permissionLauncher.launch(LocationProvider.PERMISSIONS)
    }
    LaunchedEffect(userLocation, mapLoaded) {
        val location = userLocation
        if (mapLoaded && location != null && !centeredOnUser) {
            centeredOnUser = true
            cameraPositionState.animate(
                CameraUpdateFactory.newLatLngZoom(LatLng(location.lat, location.lng), 14f),
                600,
            )
        }
    }

    // --- Viewport queries ---------------------------------------------------
    // Both the pin list and the counter hang off the visible rectangle, so they
    // are debounced together and skipped entirely while a gesture is running.
    LaunchedEffect(mapLoaded) {
        if (!mapLoaded) return@LaunchedEffect
        snapshotFlow { cameraPositionState.isMoving to cameraPositionState.position }
            .filter { (isMoving, _) -> !isMoving }
            .debounce(BOUNDS_DEBOUNCE_MS)
            .collect {
                val region = cameraPositionState.projection?.visibleRegion ?: return@collect
                val bounds = region.latLngBounds
                viewModel.onBoundsChange(
                    GeoBounds(
                        south = bounds.southwest.latitude,
                        west = bounds.southwest.longitude,
                        north = bounds.northeast.latitude,
                        east = bounds.northeast.longitude,
                    )
                )
            }
    }

    val markersVisible by remember {
        derivedStateOf { cameraPositionState.position.zoom >= MIN_MARKER_ZOOM }
    }

    val content = when (val state = uiState) {
        is UiState.Content -> state.data
        else -> null
    }
    val memories = content?.memories.orEmpty()
    val clusterItems = remember(memories) { memories.map(::MemoryClusterItem) }

    val mapStyle = remember(darkTheme) {
        MapStyleOptions.loadRawResourceStyle(
            context,
            if (darkTheme) R.raw.map_style_dark else R.raw.map_style_light,
        )
    }

    Box(Modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(
                isMyLocationEnabled = hasLocationPermission,
                mapStyleOptions = mapStyle,
            ),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                myLocationButtonEnabled = false,
                mapToolbarEnabled = false,
                compassEnabled = false,
            ),
            onMapLoaded = { mapLoaded = true },
            onMapLongClick = { latLng ->
                viewModel.dismissHint()
                editorMode = EditorMode.Create(latLng.latitude, latLng.longitude)
            },
        ) {
            // Below MIN_MARKER_ZOOM the Clustering block is not composed at all —
            // hiding markers inside it would still build every marker.
            if (markersVisible) {
                Clustering(
                    items = clusterItems,
                    onClusterClick = { cluster ->
                        scope.launch {
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLngZoom(
                                    cluster.position,
                                    cameraPositionState.position.zoom + CLUSTER_ZOOM_STEP,
                                ),
                                300,
                            )
                        }
                        true
                    },
                    onClusterItemClick = { item ->
                        detailMemory = item.memory
                        true
                    },
                )
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            MapModeSwitch(mode = mode, onModeChange = viewModel::onModeChange)

            AnimatedVisibility(
                visible = !markersVisible && content != null,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                ZoomedOutBanner(
                    count = content?.visibleCount ?: 0,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }

            AnimatedVisibility(visible = hintVisible, enter = fadeIn(), exit = fadeOut()) {
                MapNotice(
                    text = stringResource(R.string.map_hint_long_press),
                    onDismiss = viewModel::dismissHint,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }

            // Denying location keeps the map fully usable, so this is a note,
            // not a blocker.
            AnimatedVisibility(visible = locationDenied, enter = fadeIn(), exit = fadeOut()) {
                MapNotice(
                    text = stringResource(R.string.permission_location_rationale),
                    onDismiss = viewModel::dismissLocationNotice,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }

        if (uiState is UiState.Empty) {
            MapEmptyState(
                mode = mode,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 40.dp),
            )
        }

        ExtendedFloatingActionButton(
            onClick = {
                viewModel.dismissHint()
                val target = userLocation
                    ?.takeIf { hasLocationPermission }
                    ?.let { it.lat to it.lng }
                    ?: cameraPositionState.position.target.let { it.latitude to it.longitude }
                editorMode = EditorMode.Create(target.first, target.second)
            },
            icon = { Icon(Icons.Outlined.Add, contentDescription = stringResource(R.string.cd_add_memory)) },
            text = {
                Text(
                    stringResource(
                        if (hasLocationPermission && userLocation != null) R.string.map_fab_here
                        else R.string.map_fab_center
                    )
                )
            },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(20.dp),
        )
    }

    editorMode?.let { editor ->
        CreateMemorySheet(
            mode = editor,
            onDismiss = { editorMode = null },
        )
    }

    detailMemory?.let { memory ->
        MemoryDetailSheet(
            memory = memory,
            userLocation = userLocation.takeIf { hasLocationPermission },
            onEdit = {
                detailMemory = null
                editorMode = EditorMode.Edit(memory.id)
            },
            onDelete = {
                detailMemory = null
                viewModel.delete(memory.id)
            },
            onDismiss = { detailMemory = null },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MapModeSwitch(mode: MapMode, onModeChange: (MapMode) -> Unit) {
    Surface(
        shape = MaterialTheme.shapes.extraLarge,
        color = MaterialTheme.colorScheme.surfaceContainer,
        tonalElevation = 2.dp,
        shadowElevation = 3.dp,
    ) {
        SingleChoiceSegmentedButtonRow(Modifier.padding(4.dp)) {
            MapMode.entries.forEachIndexed { index, entry ->
                SegmentedButton(
                    selected = mode == entry,
                    onClick = { onModeChange(entry) },
                    shape = SegmentedButtonDefaults.itemShape(index, MapMode.entries.size),
                    icon = {},
                    label = {
                        Text(
                            stringResource(
                                if (entry == MapMode.WORLD) R.string.map_mode_world else R.string.map_mode_mine
                            )
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun ZoomedOutBanner(count: Int, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainer,
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(
                    R.string.map_zoomed_out_count,
                    count,
                    pluralStringResource(R.plurals.memories_count, count),
                ),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(R.string.map_zoomed_out_hint),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MapNotice(text: String, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.primaryContainer,
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 4.dp),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) {
                Text(stringResource(R.string.map_hint_dismiss))
            }
        }
    }
}

@Composable
private fun MapEmptyState(mode: MapMode, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainer,
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(
                    if (mode == MapMode.MINE) R.string.map_empty_mine_title else R.string.map_empty_world_title
                ),
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(
                    if (mode == MapMode.MINE) R.string.map_empty_mine_body else R.string.map_empty_world_body
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}
