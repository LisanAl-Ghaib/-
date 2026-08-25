package com.traces.app.feature.profile

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.PersonSearch
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.QrCode2
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.traces.app.core.domain.model.Profile
import com.traces.app.core.ui.LocalAppContainer
import com.traces.app.core.ui.component.EmptyState
import com.traces.app.core.ui.component.QrCode
import com.traces.app.core.ui.format.rememberHappenedLabel
import com.traces.app.feature.memory.CreateMemorySheet
import com.traces.app.feature.memory.EditorMode
import com.traces.app.feature.memory.MemoryDetailSheet

private const val SINGLE_PIN_ZOOM = 14f
private const val BOUNDS_PADDING_PX = 120
/** Hue of the clay accent, so profile pins read as the same colour as the world map's. */
private const val CLAY_MARKER_HUE = 12f
private val PARIS = LatLng(48.8566, 2.3522)

/**
 * One screen, two readings: your own profile with settings and search, or
 * somebody else's with only what they made public.
 */
@Composable
fun ProfileScreen(
    authorId: String? = null,
    onOpenSettings: () -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    onBack: (() -> Unit)? = null,
) {
    val container = LocalAppContainer.current
    val viewModel: ProfileViewModel = viewModel(
        key = "profile-${authorId ?: "me"}",
        factory = ProfileViewModel.factory(container, authorId),
    )
    val profile by viewModel.profile.collectAsStateWithLifecycle()
    val points by viewModel.points.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()

    var qrVisible by remember { mutableStateOf(false) }
    var lookupVisible by remember { mutableStateOf(false) }
    var detailMemory by remember { mutableStateOf<Memory?>(null) }
    var editorMode by remember { mutableStateOf<EditorMode?>(null) }
    var renameVisible by remember { mutableStateOf(false) }

    val searching = viewModel.isLocal && query.isNotBlank()
    val mapPoints = remember(points) { points.filter { it.inPersonalMap } }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Outlined.ArrowBack,
                        contentDescription = stringResource(R.string.action_back),
                    )
                }
            }
            Box(Modifier.weight(1f))
            if (viewModel.isLocal) {
                IconButton(onClick = { lookupVisible = true }) {
                    Icon(
                        Icons.Outlined.PersonSearch,
                        contentDescription = stringResource(R.string.profile_find_by_code),
                    )
                }
                IconButton(onClick = { qrVisible = true }) {
                    Icon(
                        Icons.Outlined.QrCode2,
                        contentDescription = stringResource(R.string.profile_my_code),
                    )
                }
                IconButton(onClick = onOpenSettings) {
                    Icon(
                        Icons.Outlined.Settings,
                        contentDescription = stringResource(R.string.settings_title),
                    )
                }
            }
        }

        ProfileHeader(
            profile = profile,
            memoryCount = points.size,
            onEditName = if (viewModel.isLocal) ({ renameVisible = true }) else null,
        )

        if (viewModel.isLocal) {
            OutlinedTextField(
                value = query,
                onValueChange = viewModel::onQueryChange,
                placeholder = { Text(stringResource(R.string.profile_search_placeholder)) },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                shape = MaterialTheme.shapes.extraLarge,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
            )
        }

        val body = Modifier
            .fillMaxWidth()
            .weight(1f)

        when {
            searching && points.isEmpty() -> EmptyState(
                title = stringResource(R.string.profile_nothing_found_title),
                body = stringResource(R.string.profile_nothing_found_body),
                icon = Icons.Outlined.Search,
                modifier = body,
            )

            searching -> PointList(points, body) { detailMemory = it }

            !viewModel.isLocal && points.isEmpty() -> EmptyState(
                title = stringResource(R.string.profile_other_empty_title),
                body = stringResource(R.string.profile_other_empty_body),
                modifier = body,
            )

            !viewModel.isLocal -> PointList(points, body) { detailMemory = it }

            mapPoints.isEmpty() -> EmptyState(
                title = stringResource(R.string.profile_empty_title),
                body = stringResource(R.string.profile_empty_body),
                icon = Icons.Outlined.PushPin,
                modifier = body,
            )

            else -> PersonalMap(
                memories = mapPoints,
                onMarkerClick = { detailMemory = it },
                modifier = body,
            )
        }
    }

    if (renameVisible) {
        RenameDialog(
            initialName = profile?.name.orEmpty(),
            onConfirm = { newName ->
                viewModel.rename(newName)
                renameVisible = false
            },
            onDismiss = { renameVisible = false },
        )
    }

    if (qrVisible) {
        MyCodeDialog(code = viewModel.myCode, onDismiss = { qrVisible = false })
    }

    if (lookupVisible) {
        FindByCodeDialog(
            viewModel = viewModel,
            onOpenProfile = { id ->
                lookupVisible = false
                viewModel.clearLookup()
                onOpenProfile(id)
            },
            onDismiss = {
                lookupVisible = false
                viewModel.clearLookup()
            },
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
    profile: Profile?,
    memoryCount: Int,
    onEditName: (() -> Unit)?,
) {
    val name = profile?.name.orEmpty()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Surface(
                modifier = Modifier.size(72.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = name.take(1).uppercase(),
                        style = MaterialTheme.typography.displaySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.headlineSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = if (onEditName != null) {
                        Modifier.clickable(onClick = onEditName)
                    } else {
                        Modifier
                    },
                )
                Text(
                    text = profile?.code.orEmpty(),
                    style = MaterialTheme.typography.labelMedium,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
            Stat(memoryCount.toString(), stringResource(R.string.profile_stat_memories))
            Stat(
                (profile?.mapCount ?: 0).toString(),
                stringResource(R.string.profile_stat_maps),
            )
            Stat(
                profile?.earliestYear?.toString() ?: stringResource(R.string.profile_stat_none),
                stringResource(R.string.profile_stat_earliest),
            )
        }
    }

}

@Composable
private fun Stat(value: String, label: String) {
    Column {
        Text(text = value, style = MaterialTheme.typography.titleLarge)
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun PointList(points: List<Memory>, modifier: Modifier, onClick: (Memory) -> Unit) {
    LazyColumn(modifier = modifier, contentPadding = PaddingValues(bottom = 24.dp)) {
        items(points, key = { it.id }) { memory ->
            val happened = rememberHappenedLabel(memory)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onClick(memory) }
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = memory.text,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = happened,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * LatLngBounds has two traps: an empty builder throws, and newLatLngBounds
 * throws until the map has been laid out. Zero pins never reach here, one pin
 * gets a fixed zoom, and the bounds fit waits for onMapLoaded.
 */
@Composable
private fun PersonalMap(
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

@Composable
private fun MyCodeDialog(code: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.profile_my_code)) },
        text = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                QrCode(
                    content = "traces://p/$code",
                    modifier = Modifier.size(200.dp),
                    foreground = MaterialTheme.colorScheme.onSurface,
                    background = MaterialTheme.colorScheme.surfaceContainer,
                )
                Text(
                    text = code,
                    style = MaterialTheme.typography.titleLarge,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 22.sp,
                )
                Text(
                    text = stringResource(R.string.profile_code_hint),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val share = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, code)
                    }
                    context.startActivity(Intent.createChooser(share, null))
                },
            ) { Text(stringResource(R.string.profile_share_code)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.map_hint_dismiss)) }
        },
    )
}

@Composable
private fun FindByCodeDialog(
    viewModel: ProfileViewModel,
    onOpenProfile: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var entered by remember { mutableStateOf("") }
    val found by viewModel.foundProfile.collectAsStateWithLifecycle()
    val miss by viewModel.lookupMiss.collectAsStateWithLifecycle()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.profile_find_by_code)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = entered,
                    onValueChange = { entered = it.take(12) },
                    label = { Text(stringResource(R.string.profile_code_field)) },
                    singleLine = true,
                )
                found?.let { profile ->
                    OutlinedButton(
                        onClick = { onOpenProfile(profile.id) },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(profile.name) }
                }
                if (miss) {
                    Text(
                        text = stringResource(R.string.profile_code_not_found),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Text(
                    text = stringResource(R.string.profile_code_local_note),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { viewModel.lookUp(entered) },
                enabled = entered.isNotBlank(),
            ) { Text(stringResource(R.string.profile_find_action)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.editor_cancel)) }
        },
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
