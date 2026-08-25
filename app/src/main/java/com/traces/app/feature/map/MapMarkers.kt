package com.traces.app.feature.map

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.maps.android.clustering.Cluster
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.ui.theme.Night
import com.traces.app.core.ui.theme.PaperRaised
import com.traces.app.core.ui.theme.TimeColor

private val PIN_WIDTH = 22.dp
private val PIN_HEIGHT = 30.dp

/**
 * A single memory's pin.
 *
 * The body colour is the memory's year on the temporal ramp, so a glance at the
 * map says whether a neighbourhood is remembered from the thirties or from last
 * summer. A memory carrying photographs is hollowed out in the middle.
 */
@Composable
fun MemoryPin(memory: Memory) {
    val darkTheme = isSystemInDarkTheme()
    val body = TimeColor.forYear(memory.happenedYear, darkTheme)
    val ring = if (darkTheme) Night else PaperRaised
    val hasPhoto = memory.photoPaths.isNotEmpty()

    Box(
        Modifier
            .size(width = PIN_WIDTH, height = PIN_HEIGHT)
            .drawBehind { drawPin(body = body, ring = ring, hollow = hasPhoto) }
    )
}

/**
 * A cluster, tinted by the average year of what it holds — so a cluster over an
 * old quarter stays visibly older than one over a new development.
 */
@Composable
fun MemoryCluster(cluster: Cluster<MemoryClusterItem>) {
    val darkTheme = isSystemInDarkTheme()
    val averageYear = cluster.items
        .map { it.memory.happenedYear }
        .average()
        .toInt()
    val body = TimeColor.forYear(averageYear, darkTheme)
    val ring = if (darkTheme) Night else PaperRaised

    val diameter = when (cluster.size) {
        in 0..9 -> 38.dp
        in 10..49 -> 46.dp
        else -> 54.dp
    }

    Box(
        modifier = Modifier
            .size(diameter)
            .drawBehind {
                val radius = size.minDimension / 2f
                val centre = Offset(size.width / 2f, size.height / 2f)
                drawCircle(ring, radius, centre)
                drawCircle(body, radius - 3.dp.toPx(), centre)
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = cluster.size.toString(),
            color = ring,
            fontSize = 13.sp,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

/** Teardrop: a ringed disc with a tail, drawn rather than assembled from boxes. */
private fun DrawScope.drawPin(body: Color, ring: Color, hollow: Boolean) {
    val radius = size.width / 2f
    val centre = Offset(radius, radius)
    val ringWidth = 2.5.dp.toPx()

    fun tail(halfWidth: Float, tip: Float) = Path().apply {
        moveTo(radius - halfWidth, radius + radius * 0.60f)
        lineTo(radius, tip)
        lineTo(radius + halfWidth, radius + radius * 0.60f)
        close()
    }

    // Outline first, body inset over it, so the tail carries the same ring as
    // the disc without stroking a path that meets the circle at an angle.
    drawPath(tail(radius * 0.62f, size.height), ring)
    drawPath(tail(radius * 0.62f - ringWidth, size.height - ringWidth * 1.6f), body)

    drawCircle(ring, radius, centre)
    drawCircle(body, radius - ringWidth, centre)
    if (hollow) {
        drawCircle(ring, radius * 0.30f, centre)
    }
}
