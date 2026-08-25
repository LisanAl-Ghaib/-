package com.traces.app.core.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.traces.app.core.domain.model.MIN_MEMORY_YEAR
import com.traces.app.core.domain.model.currentYear
import com.traces.app.core.ui.theme.TimeColor

/**
 * Explains the temporal ramp in the only way it needs explaining: by showing
 * it, with the two years at its ends.
 */
@Composable
fun TimeLegend(
    modifier: Modifier = Modifier,
    barWidth: Dp? = null,
) {
    val ramp = TimeColor.ramp(isSystemInDarkTheme())
    val newest = currentYear()

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        val bar = Modifier
            .then(if (barWidth != null) Modifier.width(barWidth) else Modifier.fillMaxWidth())
            .height(6.dp)
            .clip(MaterialTheme.shapes.extraSmall)
            .background(Brush.horizontalGradient(ramp))
        Row(modifier = bar) {}

        Row(
            modifier = if (barWidth != null) Modifier.width(barWidth) else Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = MIN_MEMORY_YEAR.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = newest.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
