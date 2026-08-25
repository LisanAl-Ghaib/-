package com.traces.app.feature.collection

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.traces.app.R
import com.traces.app.core.domain.model.MAP_EMOJI_CHOICES
import com.traces.app.core.domain.model.TraceMap
import com.traces.app.core.domain.model.Visibility
import com.traces.app.core.ui.LocalAppContainer
import com.traces.app.core.ui.UiState
import com.traces.app.core.ui.component.EmptyState
import com.traces.app.core.ui.component.MapCardRow

/** The library: maps you own or joined, pinned ones first. */
@Composable
fun CollectionScreen(onOpenMap: (String) -> Unit) {
    val container = LocalAppContainer.current
    val viewModel: CollectionViewModel = viewModel(factory = CollectionViewModel.factory(container))
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var createVisible by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 8.dp, top = 16.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.nav_collection),
                style = MaterialTheme.typography.displaySmall,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { createVisible = true }) {
                Icon(Icons.Outlined.Add, contentDescription = stringResource(R.string.collection_create))
            }
        }

        when (val state = uiState) {
            UiState.Loading -> Column(Modifier.fillMaxSize()) {}

            UiState.Empty -> EmptyState(
                title = stringResource(R.string.collection_empty_title),
                body = stringResource(R.string.collection_empty_body),
                icon = Icons.Outlined.Layers,
                modifier = Modifier.fillMaxSize(),
            )

            is UiState.Content -> LazyColumn(
                contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp),
            ) {
                if (state.data.pinned.isNotEmpty()) {
                    item(key = "pinned-header") {
                        SectionHeader(stringResource(R.string.collection_pinned))
                    }
                    items(state.data.pinned, key = { it.id }) { map ->
                        CollectionRow(map, viewModel, onOpenMap)
                    }
                }
                if (state.data.rest.isNotEmpty()) {
                    item(key = "rest-header") {
                        SectionHeader(stringResource(R.string.collection_all))
                    }
                    items(state.data.rest, key = { it.id }) { map ->
                        CollectionRow(map, viewModel, onOpenMap)
                    }
                }
            }
        }
    }

    if (createVisible) {
        CreateMapDialog(
            onCreate = { title, description, emoji, visibility ->
                viewModel.create(title, description, emoji, visibility)
                createVisible = false
            },
            onDismiss = { createVisible = false },
        )
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 20.dp, top = 12.dp, bottom = 4.dp),
    )
}

@Composable
private fun CollectionRow(
    map: TraceMap,
    viewModel: CollectionViewModel,
    onOpenMap: (String) -> Unit,
) {
    MapCardRow(
        map = map,
        onClick = { onOpenMap(map.id) },
        trailing = {
            IconButton(onClick = { viewModel.togglePinned(map) }) {
                Icon(
                    imageVector = if (map.isPinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                    contentDescription = stringResource(R.string.collection_pin_toggle),
                    tint = if (map.isPinned) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CreateMapDialog(
    onCreate: (String, String, String, Visibility) -> Unit,
    onDismiss: () -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var emoji by remember { mutableStateOf(MAP_EMOJI_CHOICES.first()) }
    var visibility by remember { mutableStateOf(Visibility.PUBLIC) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.collection_create)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it.take(60) },
                    label = { Text(stringResource(R.string.collection_map_title)) },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(140) },
                    label = { Text(stringResource(R.string.collection_map_description)) },
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MAP_EMOJI_CHOICES.forEach { choice ->
                        FilterChip(
                            selected = emoji == choice,
                            onClick = { emoji = choice },
                            label = { Text(choice) },
                            modifier = Modifier.size(48.dp),
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = visibility == Visibility.PRIVATE,
                        onClick = { visibility = Visibility.PRIVATE },
                        label = { Text(stringResource(R.string.editor_visibility_private)) },
                    )
                    FilterChip(
                        selected = visibility == Visibility.PUBLIC,
                        onClick = { visibility = Visibility.PUBLIC },
                        label = { Text(stringResource(R.string.editor_visibility_public)) },
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onCreate(title, description, emoji, visibility) },
                enabled = title.trim().isNotEmpty(),
            ) { Text(stringResource(R.string.editor_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.editor_cancel)) }
        },
    )
}
