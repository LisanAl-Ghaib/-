package com.traces.app.ui.memory

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.traces.app.R
import com.traces.app.domain.model.GeoPoint
import com.traces.app.domain.model.Memory
import com.traces.app.domain.model.Visibility
import com.traces.app.ui.common.LocalAppContainer
import com.traces.app.ui.common.rememberDistanceLabel
import com.traces.app.ui.common.rememberHappenedLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemoryDetailSheet(
    memory: Memory,
    /** Null when the location permission is missing — then no distance line at all. */
    userLocation: GeoPoint?,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val container = LocalAppContainer.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var confirmDeleteVisible by remember { mutableStateOf(false) }

    val happenedLabel = rememberHappenedLabel(memory)
    val distanceLabel = rememberDistanceLabel(memory, userLocation)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = memory.authorName,
                    style = MaterialTheme.typography.titleMedium,
                )
                if (memory.visibility == Visibility.PRIVATE) {
                    AssistChip(
                        onClick = {},
                        enabled = false,
                        leadingIcon = {
                            Icon(Icons.Outlined.Lock, contentDescription = null, modifier = Modifier.height(16.dp))
                        },
                        label = { Text(stringResource(R.string.detail_private_badge)) },
                    )
                }
            }

            memory.photoPath?.let { path ->
                AsyncImage(
                    model = container.photoFile(path),
                    contentDescription = stringResource(R.string.cd_photo),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .clip(MaterialTheme.shapes.medium),
                )
            }

            Text(
                text = memory.text,
                style = MaterialTheme.typography.bodyLarge,
            )

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = happenedLabel,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                distanceLabel?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Seed records and other people's records have no controls at all.
            if (memory.isEditable) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onEdit, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Outlined.Edit, contentDescription = null, modifier = Modifier.height(18.dp))
                        Text(
                            text = stringResource(R.string.detail_edit),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    OutlinedButton(
                        onClick = { confirmDeleteVisible = true },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.DeleteOutline, contentDescription = null, modifier = Modifier.height(18.dp))
                        Text(
                            text = stringResource(R.string.detail_delete),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
        }
    }

    if (confirmDeleteVisible) {
        AlertDialog(
            onDismissRequest = { confirmDeleteVisible = false },
            title = { Text(stringResource(R.string.detail_delete_title)) },
            text = { Text(stringResource(R.string.detail_delete_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDeleteVisible = false
                        onDelete()
                    },
                ) { Text(stringResource(R.string.detail_delete_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDeleteVisible = false }) {
                    Text(stringResource(R.string.detail_delete_cancel))
                }
            },
        )
    }
}
