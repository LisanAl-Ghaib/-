package com.traces.app.feature.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.maps.GoogleMapOptions
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.rememberCameraPositionState
import com.traces.app.R
import com.traces.app.core.domain.model.FeedSection
import com.traces.app.core.ui.LocalAppContainer
import com.traces.app.core.ui.UiState
import com.traces.app.core.ui.component.EmptyState
import com.traces.app.core.ui.component.MapCardRow
import com.traces.app.core.ui.component.MapCardTile

private val PARIS = LatLng(48.8566, 2.3522)

/**
 * Where the app opens: a search box, the world map as one big door, and an
 * endless shelf of maps other people made.
 */
@Composable
fun HomeScreen(
    onOpenWorldMap: () -> Unit,
    onOpenMap: (String) -> Unit,
) {
    val container = LocalAppContainer.current
    val viewModel: HomeViewModel = viewModel(factory = HomeViewModel.factory(container))
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()

    val content = (uiState as? UiState.Content)?.data

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
        contentPadding = PaddingValues(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            OutlinedTextField(
                value = query,
                onValueChange = viewModel::onQueryChange,
                placeholder = { Text(stringResource(R.string.home_search_placeholder)) },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                shape = MaterialTheme.shapes.extraLarge,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(top = 12.dp),
            )
        }

        if (query.isBlank()) {
            item { WorldMapDoor(onClick = onOpenWorldMap) }
        }

        when {
            uiState is UiState.Empty && query.isNotBlank() -> item {
                EmptyState(
                    title = stringResource(R.string.home_nothing_found_title),
                    body = stringResource(R.string.home_nothing_found_body),
                    icon = Icons.Outlined.Search,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            uiState is UiState.Empty -> item {
                EmptyState(
                    title = stringResource(R.string.home_no_maps_title),
                    body = stringResource(R.string.home_no_maps_body),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            content != null && content.searching -> items(content.results, key = { it.id }) { map ->
                MapCardRow(map = map, onClick = { onOpenMap(map.id) })
            }

            content != null -> content.rows.forEach { row ->
                item(key = "section-${row.section}") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            text = stringResource(sectionTitle(row.section)),
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                        // Cards sit flush to the left edge with the next one
                        // peeking, so the row reads as continuing off-screen.
                        LazyRow(
                            contentPadding = PaddingValues(start = 20.dp, end = 40.dp),
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            items(row.maps, key = { it.id }) { map ->
                                MapCardTile(map = map, onClick = { onOpenMap(map.id) })
                            }
                        }
                    }
                }
            }
        }
    }
}

/** The world map, shown as a still image you step through rather than a widget. */
@Composable
private fun WorldMapDoor(onClick: () -> Unit) {
    val context = LocalContext.current
    val darkTheme = isSystemInDarkTheme()
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(PARIS, 10.5f)
    }
    val mapStyle = remember(darkTheme) {
        MapStyleOptions.loadRawResourceStyle(
            context,
            if (darkTheme) R.raw.map_style_dark else R.raw.map_style_light,
        )
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp)
            .clickable(onClick = onClick)
    ) {
        // Lite mode renders a static bitmap: right for a card, and it keeps a
        // second live map off the home screen.
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            googleMapOptionsFactory = { GoogleMapOptions().liteMode(true) },
            properties = MapProperties(mapStyleOptions = mapStyle),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                mapToolbarEnabled = false,
                compassEnabled = false,
                myLocationButtonEnabled = false,
                scrollGesturesEnabled = false,
                zoomGesturesEnabled = false,
                rotationGesturesEnabled = false,
                tiltGesturesEnabled = false,
            ),
        )

        // A tap target over the map, because a lite-mode map still swallows
        // touches inside its own bounds.
        Box(
            Modifier
                .fillMaxSize()
                .clickable(onClick = onClick)
        )

        Surface(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp)
                .clip(MaterialTheme.shapes.extraLarge),
            color = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.94f),
            shadowElevation = 3.dp,
        ) {
            Row(
                modifier = Modifier.padding(start = 16.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.home_world_map),
                    style = MaterialTheme.typography.titleMedium,
                )
                Icon(
                    Icons.Outlined.ChevronRight,
                    contentDescription = null,
                    modifier = Modifier
                        .padding(start = 4.dp)
                        .size(20.dp),
                )
            }
        }
    }
}

private fun sectionTitle(section: FeedSection): Int = when (section) {
    FeedSection.FOR_YOU -> R.string.home_section_yours
    FeedSection.POPULAR -> R.string.home_section_popular
    FeedSection.RECENT -> R.string.home_section_recent
}
