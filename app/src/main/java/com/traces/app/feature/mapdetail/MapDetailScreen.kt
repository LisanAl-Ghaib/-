package com.traces.app.feature.mapdetail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.traces.app.R
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.ui.LocalAppContainer
import com.traces.app.core.ui.UiState
import com.traces.app.core.ui.component.EmptyState
import com.traces.app.core.ui.format.rememberHappenedLabel
import com.traces.app.feature.memory.MemoryDetailSheet

/** One themed map: what it is, who keeps it, and everything filed under it. */
@Composable
fun MapDetailScreen(mapId: String, onBack: () -> Unit) {
    val container = LocalAppContainer.current
    val viewModel: MapDetailViewModel = viewModel(
        key = "map-$mapId",
        factory = MapDetailViewModel.factory(container, mapId),
    )
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var detailMemory by remember { mutableStateOf<Memory?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier.padding(start = 4.dp, top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = stringResource(R.string.action_back),
                )
            }
        }

        when (val state = uiState) {
            UiState.Loading -> Column(Modifier.fillMaxSize()) {}

            UiState.Empty -> EmptyState(
                title = stringResource(R.string.mapdetail_missing_title),
                body = stringResource(R.string.mapdetail_missing_body),
                modifier = Modifier.fillMaxSize(),
            )

            is UiState.Content -> {
                val map = state.data.map
                LazyColumn(contentPadding = PaddingValues(bottom = 28.dp)) {
                    item(key = "header") {
                        Column(
                            modifier = Modifier.padding(horizontal = 20.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(text = map.emoji, fontSize = 44.sp)
                            Text(
                                text = map.title,
                                style = MaterialTheme.typography.displaySmall,
                            )
                            if (map.description.isNotBlank()) {
                                Text(
                                    text = map.description,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                text = stringResource(
                                    R.string.map_points_and_author,
                                    map.pointCount,
                                    pluralStringResource(R.plurals.points_count, map.pointCount),
                                    map.ownerName,
                                ),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (map.isOwn) {
                                    OutlinedButton(onClick = {}, enabled = false) {
                                        Text(stringResource(R.string.mapdetail_yours))
                                    }
                                } else if (map.isMember) {
                                    OutlinedButton(onClick = { viewModel.toggleMembership(map) }) {
                                        Text(stringResource(R.string.mapdetail_leave))
                                    }
                                } else {
                                    Button(onClick = { viewModel.toggleMembership(map) }) {
                                        Text(stringResource(R.string.mapdetail_join))
                                    }
                                }
                                IconButton(onClick = { viewModel.togglePinned(map) }) {
                                    Icon(
                                        imageVector = if (map.isPinned) Icons.Filled.PushPin
                                        else Icons.Outlined.PushPin,
                                        contentDescription = stringResource(R.string.collection_pin_toggle),
                                        tint = if (map.isPinned) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }

                    if (state.data.points.isEmpty()) {
                        item(key = "empty") {
                            EmptyState(
                                title = stringResource(R.string.mapdetail_no_points_title),
                                body = stringResource(R.string.mapdetail_no_points_body),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    } else {
                        items(state.data.points, key = { it.id }) { memory ->
                            PointRow(memory = memory, onClick = { detailMemory = memory })
                        }
                    }
                }
            }
        }
    }

    detailMemory?.let { memory ->
        MemoryDetailSheet(
            memory = memory,
            userLocation = null,
            onEdit = { detailMemory = null },
            onDelete = { detailMemory = null },
            onDismiss = { detailMemory = null },
        )
    }
}

@Composable
private fun PointRow(memory: Memory, onClick: () -> Unit) {
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
            overflow = TextOverflow.Ellipsis,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = memory.authorName,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = happened,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
