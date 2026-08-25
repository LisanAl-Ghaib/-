package com.traces.app.feature.memory

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddAPhoto
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.traces.app.R
import com.traces.app.core.domain.model.MAX_PHOTOS
import com.traces.app.core.domain.model.MAX_TEXT_LENGTH
import com.traces.app.core.domain.model.PhotoRef
import com.traces.app.core.domain.model.Visibility
import com.traces.app.core.ui.LocalAppContainer
import com.traces.app.core.ui.format.formatCoordinate
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

private const val EDITOR_MAP_ZOOM = 16f
private const val EDITOR_VM_KEY = "memory_editor"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateMemorySheet(
    mode: EditorMode,
    onDismiss: () -> Unit,
) {
    val container = LocalAppContainer.current
    val viewModel: CreateMemoryViewModel = viewModel(
        key = EDITOR_VM_KEY,
        factory = CreateMemoryViewModel.factory(container),
    )
    LaunchedEffect(mode.token) { viewModel.start(mode) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    fun close() {
        scope.launch {
            runCatching { sheetState.hide() }
            onDismiss()
        }
    }

    LaunchedEffect(state.finished) {
        if (state.finished) close()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = stringResource(
                    if (state.isEdit) R.string.editor_title_edit else R.string.editor_title_create
                ),
                style = MaterialTheme.typography.titleLarge,
            )

            if (!state.loading) {
                EditorMap(
                    lat = state.lat,
                    lng = state.lng,
                    onPositionChange = viewModel::onPositionChange,
                )

                Text(
                    text = stringResource(
                        R.string.editor_coordinates,
                        formatCoordinate(state.lat),
                        formatCoordinate(state.lng),
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            OutlinedTextField(
                value = state.text,
                onValueChange = viewModel::onTextChange,
                placeholder = { Text(stringResource(R.string.editor_text_placeholder)) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(140.dp),
                supportingText = {
                    Text(
                        text = stringResource(R.string.editor_counter, state.text.length, MAX_TEXT_LENGTH),
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth(),
                    )
                },
            )

            DateChips(state = state, viewModel = viewModel)

            PhotoStrip(state = state, viewModel = viewModel)

            AudioRow(state = state, viewModel = viewModel)

            VisibilityChips(
                visibility = state.visibility,
                onChange = viewModel::onVisibilityChange,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = { close() }, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.editor_cancel))
                }
                Button(
                    onClick = viewModel::save,
                    enabled = state.canSave,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(stringResource(R.string.editor_save))
                }
            }
        }
    }
}

@Composable
private fun EditorMap(
    lat: Double,
    lng: Double,
    onPositionChange: (Double, Double) -> Unit,
) {
    val context = LocalContext.current
    val darkTheme = isSystemInDarkTheme()
    // Composed only after the record has loaded, so the first value is the real
    // one. Re-keying on the live coordinates would yank the camera on every drag.
    val anchor = remember { LatLng(lat, lng) }
    val markerState = remember(anchor) { MarkerState(position = anchor) }
    val cameraPositionState = rememberCameraPositionState(key = anchor.toString()) {
        position = CameraPosition.fromLatLngZoom(anchor, EDITOR_MAP_ZOOM)
    }

    LaunchedEffect(markerState) {
        snapshotFlow { markerState.position }
            .collect { position -> onPositionChange(position.latitude, position.longitude) }
    }

    Column {
        GoogleMap(
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp)
                .clip(MaterialTheme.shapes.medium),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(
                mapStyleOptions = remember(darkTheme) {
                    MapStyleOptions.loadRawResourceStyle(
                        context,
                        if (darkTheme) R.raw.map_style_dark else R.raw.map_style_light,
                    )
                },
            ),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                mapToolbarEnabled = false,
                compassEnabled = false,
                myLocationButtonEnabled = false,
                rotationGesturesEnabled = false,
                tiltGesturesEnabled = false,
            ),
        ) {
            Marker(state = markerState, draggable = true)
        }
        Text(
            text = stringResource(R.string.editor_drag_marker),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateChips(state: EditorState, viewModel: CreateMemoryViewModel) {
    var yearDialogVisible by remember { mutableStateOf(false) }
    var datePickerVisible by remember { mutableStateOf(false) }

    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(
            selected = state.dateMode == DateMode.NOW,
            onClick = { viewModel.onDateModeChange(DateMode.NOW) },
            label = { Text(stringResource(R.string.editor_date_now)) },
        )
        FilterChip(
            selected = state.dateMode == DateMode.YEAR,
            onClick = { yearDialogVisible = true },
            label = { Text(stringResource(R.string.editor_date_year)) },
        )
        FilterChip(
            selected = state.dateMode == DateMode.EXACT,
            onClick = { datePickerVisible = true },
            label = { Text(stringResource(R.string.editor_date_exact)) },
        )
    }

    if (yearDialogVisible) {
        YearPickerDialog(
            selectedYear = state.year,
            onYearPicked = {
                viewModel.onYearPicked(it)
                yearDialogVisible = false
            },
            onDismiss = { yearDialogVisible = false },
        )
    }

    if (datePickerVisible) {
        ExactDatePickerDialog(
            initialDate = LocalDate.of(state.year, state.month ?: 1, state.day ?: 1),
            onDatePicked = {
                viewModel.onExactDatePicked(it)
                datePickerVisible = false
            },
            onDismiss = { datePickerVisible = false },
        )
    }
}

@Composable
private fun YearPickerDialog(
    selectedYear: Int,
    onYearPicked: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val years = remember { (LocalDate.now().year downTo CreateMemoryViewModel.MIN_YEAR).toList() }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.editor_year_picker_title)) },
        text = {
            LazyColumn(modifier = Modifier.height(280.dp)) {
                items(years) { year ->
                    TextButton(
                        onClick = { onYearPicked(year) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = year.toString(),
                            color = if (year == selectedYear) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.editor_cancel)) }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExactDatePickerDialog(
    initialDate: LocalDate,
    onDatePicked: (LocalDate) -> Unit,
    onDismiss: () -> Unit,
) {
    val today = remember { LocalDate.now() }
    val todayUtcMillis = remember { today.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }
    val datePickerState = rememberDatePickerState(
        initialSelectedDateMillis = initialDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        selectableDates = remember {
            object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= todayUtcMillis
                override fun isSelectableYear(year: Int) = year <= today.year
            }
        },
    )

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    val millis = datePickerState.selectedDateMillis
                    if (millis != null) {
                        onDatePicked(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate())
                    } else {
                        onDismiss()
                    }
                },
            ) { Text(stringResource(R.string.editor_done)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.editor_cancel)) }
        },
    ) {
        DatePicker(state = datePickerState)
    }
}

@Composable
private fun PhotoStrip(state: EditorState, viewModel: CreateMemoryViewModel) {
    val container = LocalAppContainer.current
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(MAX_PHOTOS)
    ) { uris ->
        if (uris.isNotEmpty()) viewModel.onPhotosPicked(uris.map(Uri::toString))
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(R.string.editor_photos_title),
                style = MaterialTheme.typography.labelLarge,
            )
            Text(
                text = stringResource(R.string.editor_counter, state.photos.size, MAX_PHOTOS),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(state.photos) { index, photo ->
                Box {
                    AsyncImage(
                        // A stored photo resolves to a file, a freshly picked
                        // one is still just its content:// uri.
                        model = when (photo) {
                            is PhotoRef.Stored -> container.mediaFile(photo.path)
                            is PhotoRef.Picked -> photo.uri
                        },
                        contentDescription = stringResource(R.string.cd_photo),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(88.dp)
                            .clip(MaterialTheme.shapes.medium),
                    )
                    FilledTonalIconButton(
                        onClick = { viewModel.onPhotoRemoved(index) },
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(28.dp),
                    ) {
                        Icon(
                            Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.editor_photo_remove),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }

            if (state.canAddPhoto) {
                item {
                    Surface(
                        onClick = {
                            launcher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        },
                        modifier = Modifier.size(88.dp),
                        shape = MaterialTheme.shapes.medium,
                        color = MaterialTheme.colorScheme.surfaceVariant,
                    ) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Outlined.AddAPhoto,
                                contentDescription = stringResource(R.string.editor_photo_add),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * One track per memory. Picked through OpenDocument rather than the photo
 * picker, which does not offer audio at all.
 */
@Composable
private fun AudioRow(state: EditorState, viewModel: CreateMemoryViewModel) {
    val container = LocalAppContainer.current
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                viewModel.onAudioPicked(uri.toString(), container.mediaDisplayName(uri))
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.editor_audio_title),
            style = MaterialTheme.typography.labelLarge,
        )

        val attached = state.audio
        if (attached == null) {
            OutlinedButton(onClick = { launcher.launch(arrayOf("audio/*")) }) {
                Icon(Icons.Outlined.MusicNote, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(
                    text = stringResource(R.string.editor_audio_add),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        } else {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Row(
                    modifier = Modifier.padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Outlined.MusicNote,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = attached.title ?: stringResource(R.string.audio_untitled),
                        style = MaterialTheme.typography.labelLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 10.dp),
                    )
                    IconButton(onClick = viewModel::onAudioRemoved) {
                        Icon(
                            Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.editor_audio_remove),
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun VisibilityChips(visibility: Visibility, onChange: (Visibility) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(
            selected = visibility == Visibility.PRIVATE,
            onClick = { onChange(Visibility.PRIVATE) },
            label = { Text(stringResource(R.string.editor_visibility_private)) },
        )
        FilterChip(
            selected = visibility == Visibility.PUBLIC,
            onClick = { onChange(Visibility.PUBLIC) },
            label = { Text(stringResource(R.string.editor_visibility_public)) },
        )
    }
}
