package com.traces.app.feature.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.traces.app.R
import com.traces.app.core.domain.model.AuthorRef
import com.traces.app.core.domain.model.MIN_MEMORY_YEAR
import com.traces.app.core.domain.model.MapMode
import com.traces.app.core.domain.model.MemoryFilter
import com.traces.app.core.domain.model.currentYear
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MapFilterSheet(
    filter: MemoryFilter,
    authors: List<AuthorRef>,
    mode: MapMode,
    onFilterChange: (MemoryFilter) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val maxYear = currentYear()

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
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.filter_title),
                    style = MaterialTheme.typography.titleLarge,
                )
                if (filter.isActive) {
                    TextButton(onClick = onReset) {
                        Text(stringResource(R.string.filter_reset))
                    }
                }
            }

            OutlinedTextField(
                value = filter.query,
                onValueChange = { onFilterChange(filter.copy(query = it)) },
                label = { Text(stringResource(R.string.filter_query_label)) },
                placeholder = { Text(stringResource(R.string.filter_query_placeholder)) },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.filter_years, filter.fromYear, filter.toYear),
                    style = MaterialTheme.typography.labelLarge,
                )
                RangeSlider(
                    value = filter.fromYear.toFloat()..filter.toYear.toFloat(),
                    onValueChange = { range ->
                        onFilterChange(
                            filter.copy(
                                fromYear = range.start.roundToInt().coerceAtLeast(MIN_MEMORY_YEAR),
                                toYear = range.endInclusive.roundToInt().coerceAtMost(maxYear),
                            )
                        )
                    },
                    valueRange = MIN_MEMORY_YEAR.toFloat()..maxYear.toFloat(),
                    steps = maxYear - MIN_MEMORY_YEAR - 1,
                )
            }

            // The author filter belongs to the world map only; on the personal
            // map every record already has the same author.
            if (mode == MapMode.WORLD && authors.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = stringResource(R.string.filter_author),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = filter.authorId == null,
                            onClick = { onFilterChange(filter.copy(authorId = null)) },
                            label = { Text(stringResource(R.string.filter_author_any)) },
                        )
                        authors.forEach { author ->
                            FilterChip(
                                selected = filter.authorId == author.id,
                                onClick = { onFilterChange(filter.copy(authorId = author.id)) },
                                label = { Text(author.name) },
                            )
                        }
                    }
                }
            }
        }
    }
}
