package com.traces.app.feature.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import com.traces.app.BuildConfig
import com.traces.app.R
import com.traces.app.core.domain.model.ThemeMode
import com.traces.app.core.ui.LocalAppContainer

@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val container = LocalAppContainer.current
    val viewModel: SettingsViewModel = viewModel(factory = SettingsViewModel.factory(container))
    val state by viewModel.state.collectAsStateWithLifecycle()

    var renameVisible by remember { mutableStateOf(false) }
    var confirmDemoDelete by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState()),
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
            Text(
                text = stringResource(R.string.settings_title),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        SettingRow(
            title = stringResource(R.string.settings_name),
            subtitle = state.authorName,
            onClick = { renameVisible = true },
        )

        HorizontalDivider(Modifier.padding(horizontal = 20.dp))

        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = stringResource(R.string.settings_theme),
                style = MaterialTheme.typography.titleMedium,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ThemeMode.entries.forEach { mode ->
                    FilterChip(
                        selected = state.themeMode == mode,
                        onClick = { viewModel.setThemeMode(mode) },
                        label = { Text(stringResource(themeLabel(mode))) },
                    )
                }
            }
        }

        HorizontalDivider(Modifier.padding(horizontal = 20.dp))

        if (state.hasDemoData) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 20.dp, end = 14.dp, top = 14.dp, bottom = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.demo_title),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = stringResource(
                            R.string.settings_demo_counts,
                            state.demoMemoryCount,
                            state.demoMapCount,
                        ),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = state.showDemoData, onCheckedChange = viewModel::setShowDemoData)
            }
            TextButton(
                onClick = { confirmDemoDelete = true },
                modifier = Modifier.padding(start = 12.dp, bottom = 8.dp),
            ) {
                Text(stringResource(R.string.demo_delete_action))
            }
            HorizontalDivider(Modifier.padding(horizontal = 20.dp))
        }

        SettingRow(
            title = stringResource(R.string.settings_version),
            subtitle = BuildConfig.VERSION_NAME,
            onClick = null,
        )
    }

    if (renameVisible) {
        var value by remember { mutableStateOf(state.authorName) }
        AlertDialog(
            onDismissRequest = { renameVisible = false },
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
                    onClick = {
                        viewModel.rename(value)
                        renameVisible = false
                    },
                    enabled = value.trim().isNotEmpty(),
                ) { Text(stringResource(R.string.profile_name_save)) }
            },
            dismissButton = {
                TextButton(onClick = { renameVisible = false }) {
                    Text(stringResource(R.string.editor_cancel))
                }
            },
        )
    }

    if (confirmDemoDelete) {
        AlertDialog(
            onDismissRequest = { confirmDemoDelete = false },
            title = { Text(stringResource(R.string.demo_delete_title)) },
            text = { Text(stringResource(R.string.demo_delete_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDemoDelete = false
                        viewModel.deleteDemoData()
                    },
                ) { Text(stringResource(R.string.detail_delete_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDemoDelete = false }) {
                    Text(stringResource(R.string.editor_cancel))
                }
            },
        )
    }
}

@Composable
private fun SettingRow(title: String, subtitle: String, onClick: (() -> Unit)?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(text = title, style = MaterialTheme.typography.titleMedium)
        Text(
            text = subtitle,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun themeLabel(mode: ThemeMode): Int = when (mode) {
    ThemeMode.SYSTEM -> R.string.settings_theme_system
    ThemeMode.LIGHT -> R.string.settings_theme_light
    ThemeMode.DARK -> R.string.settings_theme_dark
}
