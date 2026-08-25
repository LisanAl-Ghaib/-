package com.traces.app.core.ui.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.traces.app.R
import com.traces.app.core.domain.model.TraceMap
import com.traces.app.core.domain.model.Visibility
import com.traces.app.core.ui.theme.TimeColor

private val CARD_WIDTH = 168.dp

/** A map in the feed: a horizontal carousel tile. */
@Composable
fun MapCardTile(
    map: TraceMap,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .width(CARD_WIDTH)
            .clickable(onClick = onClick),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MapCover(map = map, modifier = Modifier.size(CARD_WIDTH))
        Text(
            text = map.title,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = pointsLabel(map),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

/** The same map as a full-width row, for the collection and search results. */
@Composable
fun MapCardRow(
    map: TraceMap,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        MapCover(map = map, modifier = Modifier.size(56.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = map.title,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (map.isPinned) {
                    Icon(
                        Icons.Filled.PushPin,
                        contentDescription = stringResource(R.string.collection_pinned),
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .padding(start = 6.dp)
                            .size(14.dp),
                    )
                }
                if (map.visibility == Visibility.PRIVATE) {
                    Icon(
                        Icons.Outlined.Lock,
                        contentDescription = stringResource(R.string.detail_private_badge),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .padding(start = 6.dp)
                            .size(14.dp),
                    )
                }
            }
            Text(
                text = pointsLabel(map),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        trailing?.invoke()
    }
}

/**
 * Covers are generated, not uploaded: the emoji on a wash taken from the app's
 * temporal ramp, seeded by the map's id so a given map always looks the same.
 */
@Composable
private fun MapCover(map: TraceMap, modifier: Modifier = Modifier) {
    val darkTheme = androidx.compose.foundation.isSystemInDarkTheme()
    val year = 1930 + (map.id.hashCode().mod(96))
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        color = TimeColor.forYear(year, darkTheme).copy(alpha = if (darkTheme) 0.35f else 0.30f),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text = map.emoji, fontSize = 34.sp)
        }
    }
}

@Composable
private fun pointsLabel(map: TraceMap): String = stringResource(
    R.string.map_points_and_author,
    map.pointCount,
    pluralStringResource(R.plurals.points_count, map.pointCount),
    map.ownerName,
)

/** Placeholder tile used while the feed is loading. */
@Composable
fun MapCardSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.width(CARD_WIDTH),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Surface(
            modifier = Modifier.size(CARD_WIDTH),
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {}
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp),
            shape = RoundedCornerShape(6.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {}
    }
}
