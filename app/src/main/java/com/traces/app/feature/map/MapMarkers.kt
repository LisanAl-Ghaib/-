package com.traces.app.feature.map

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.maps.android.clustering.Cluster
import com.traces.app.core.ui.theme.Clay
import com.traces.app.core.ui.theme.PaperElevated

/**
 * Marker artwork.
 *
 * Both are rendered into bitmaps by maps-compose. Every pin looks the same, so
 * the library's shared-bitmap reuse works in our favour rather than against it.
 */
@Composable
fun MemoryPin() {
    Box(
        Modifier
            .size(18.dp)
            .clip(CircleShape)
            .background(Clay)
            .border(3.dp, PaperElevated, CircleShape)
    )
}

@Composable
fun MemoryCluster(cluster: Cluster<MemoryClusterItem>) {
    val size = when (cluster.size) {
        in 0..9 -> 36.dp
        in 10..49 -> 44.dp
        else -> 52.dp
    }
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(Clay)
            .border(3.dp, PaperElevated, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = cluster.size.toString(),
            color = PaperElevated,
            fontSize = 13.sp,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}
