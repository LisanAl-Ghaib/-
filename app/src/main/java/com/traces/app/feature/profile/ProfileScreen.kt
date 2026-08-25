package com.traces.app.feature.profile

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.traces.app.R
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.ui.UiState
import com.traces.app.core.ui.component.EmptyState
import com.traces.app.core.ui.LocalAppContainer
import com.traces.app.core.ui.format.rememberHappenedLabel
import com.traces.app.feature.memory.CreateMemorySheet
import com.traces.app.feature.memory.EditorMode
import com.traces.app.feature.memory.MemoryDetailSheet

private const val SINGLE_PIN_ZOOM = 14f
/** Hue of the clay accent, so profile pins read as the same colour as the world map's. */
private const val CLAY_MARKER_HUE = 12f
private const val BOUNDS_PADDING_PX = 120
private val PARIS = LatLng(48.8566, 2.3522)

@Composable
fun ProfileScreen() {
    val container = LocalAppContainer.current
    val viewModel: ProfileViewModel = viewModel(factory = ProfileViewModel.factory(container))
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val authorName by viewModel.authorName.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val totalCount by viewModel.totalCount.collectAsStateWithLifecycle()

    var selectedTab by remember { mutableIntStateOf(0) }
    var renameVisible by remember { mutableStateOf(false) }
    var detailMemory by remember { mutableStateOf<Memory?>(null) }
    var editorMode by remember { mutableStateOf<EditorMode?>(null) }

    val content = when (val state = uiState) {
        is UiState.Content -> state.data
        else -> null
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        ProfileHeader(
            name = authorName,
            memoryCount = totalCount,
            earliestYear = content?.earliestYear,
            onEditName = { renameVisible = true },
        )

        TabRow(selectedTabIndex = selectedTab) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = { Text(stringResource(R.string.profile_tab_map)) },
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = { Text(stringResource(R.string.profile_tab_timeline)) },
            )
        }

        // weight(1f), not fillMaxSize(): inside a Column the latter would claim
        // the whole height and push itself under the header and tabs.
        val bodyModifier = Modifier
            .fillMaxWidth()
            .weight(1f)

        if (totalCount > 0) {
            OutlinedTextField(
                value = query,
                onValueChange = viewModel::onQueryChange,
                placeholder = { Text(stringResource(R.string.profile_search_placeholder)) },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
            )
        }

        when (val state = uiState) {
            UiState.Loading -> Box(bodyModifier)
            UiState.Empty -> ProfileEmptyState(
                searching = query.isNotBlank(),
                modifier = bodyModifier,
            )
            is UiState.Content -> when (selectedTab) {
                0 -> ProfileMap(
                    memories = state.data.memories,
                    onMarkerClick = { detailMemory = it },
                    modifier = bodyModifier,
                )
                else -> ProfileTimeline(
                    memories = state.data.memories,
                    onMemoryClick = { detailMemory = it },
                    modifier = bodyModifier,
                )
            }
        }
    }

    if (renameVisible) {
        RenameDialog(
            initialName = authorName,
            onConfirm = {
                viewModel.rename(it)
                renameVisible = false
            },
            onDismiss = { renameVisible = false },
        )
    }

    detailMemory?.let { memory ->
        MemoryDetailSheet(
            memory = memory,
            userLocation = null,
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

    editorMode?.let { editor ->
        CreateMemorySheet(mode = editor, onDismiss = { editorMode = null })
    }
}

@Composable
private fun ProfileHeader(
    name: String,
    memoryCount: Int,
    earliestYear: Int?,
    onEditName: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable(onClick = onEditName),
        ) {
            Text(text = name, style = MaterialTheme.typography.titleLarge)
            Icon(
                imageVector = Icons.Outlined.Edit,
                contentDescription = stringResource(R.string.profile_edit_name),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .size(18.dp),
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(32.dp)) {
            ProfileStat(
                value = memoryCount.toString(),
                label = stringResource(R.string.profile_stat_memories),
            )
            ProfileStat(
                value = earliestYear?.toString() ?: stringResource(R.string.profile_stat_none),
                label = stringResource(R.string.profile_stat_earliest),
            )
        }
    }
}

@Composable
private fun ProfileStat(value: String, label: String) {
    Column {
        Text(text = value, style = MaterialTheme.typography.titleLarge)
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * LatLngBounds has two traps: an empty builder throws, and newLatLngBounds
 * throws IllegalStateException until the map has been laid out. So zero pins
 * never reach this composable, one pin gets a fixed zoom, and the bounds fit
 * waits for onMapLoaded.
 */
@Composable
private fun ProfileMap(
    memories: List<Memory>,
    onMarkerClick: (Memory) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val darkTheme = isSystemInDarkTheme()
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(PARIS, 11f)
    }
    var mapLoaded by remember { mutableStateOf(false) }

    LaunchedEffect(mapLoaded, memories) {
        if (!mapLoaded || memories.isEmpty()) return@LaunchedEffect
        if (memories.size == 1) {
            val only = memories.first()
            cameraPositionState.animate(
                CameraUpdateFactory.newLatLngZoom(LatLng(only.lat, only.lng), SINGLE_PIN_ZOOM),
                500,
            )
        } else {
            val bounds = LatLngBounds.builder()
                .apply { memories.forEach { include(LatLng(it.lat, it.lng)) } }
                .build()
            cameraPositionState.animate(
                CameraUpdateFactory.newLatLngBounds(bounds, BOUNDS_PADDING_PX),
                500,
            )
        }
    }

    val mapStyle = remember(darkTheme) {
        MapStyleOptions.loadRawResourceStyle(
            context,
            if (darkTheme) R.raw.map_style_dark else R.raw.map_style_light,
        )
    }

    GoogleMap(
        modifier = modifier,
        cameraPositionState = cameraPositionState,
        properties = MapProperties(mapStyleOptions = mapStyle),
        uiSettings = MapUiSettings(
            zoomControlsEnabled = false,
            mapToolbarEnabled = false,
            compassEnabled = false,
            myLocationButtonEnabled = false,
        ),
        onMapLoaded = { mapLoaded = true },
    ) {
        memories.forEach { memory ->
            Marker(
                state = remember(memory.id, memory.lat, memory.lng) {
                    MarkerState(position = LatLng(memory.lat, memory.lng))
                },
                icon = remember { BitmapDescriptorFactory.defaultMarker(CLAY_MARKER_HUE) },
                onClick = {
                    onMarkerClick(memory)
                    true
                },
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ProfileTimeline(
    memories: List<Memory>,
    onMemoryClick: (Memory) -> Unit,
    modifier: Modifier = Modifier,
) {
    // observeOwn() already sorts by happenedYear DESC, so grouping keeps that order.
    val grouped = remember(memories) { memories.groupBy { it.happenedYear } }

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        grouped.forEach { (year, yearMemories) ->
            stickyHeader(key = "year-$year") {
                Text(
                    text = year.toString(),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.background)
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                )
            }
            items(yearMemories, key = { it.id }) { memory ->
                TimelineRow(memory = memory, onClick = { onMemoryClick(memory) })
            }
        }
    }
}

@Composable
private fun TimelineRow(memory: Memory, onClick: () -> Unit) {
    val happened = rememberHappenedLabel(memory)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = memory.text,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 3,
        )
        Text(
            text = happened,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ProfileEmptyState(searching: Boolean, modifier: Modifier = Modifier) {
    EmptyState(
        title = stringResource(
            if (searching) R.string.profile_nothing_found_title else R.string.profile_empty_title
        ),
        body = stringResource(
            if (searching) R.string.profile_nothing_found_body else R.string.profile_empty_body
        ),
        icon = if (searching) Icons.Outlined.Search else Icons.Outlined.PushPin,
        modifier = modifier,
    )
}

@Composable
private fun RenameDialog(
    initialName: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf(initialName) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.profile_name_dialog_title)) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { value = it.take(40) },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(value) },
                enabled = value.trim().isNotEmpty(),
            ) { Text(stringResource(R.string.profile_name_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.editor_cancel)) }
        },
    )
}
