package com.traces.app.core.ui.component

import android.media.MediaPlayer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.traces.app.R
import kotlinx.coroutines.delay
import java.io.File
import java.util.Locale

private const val TICK_MS = 200L

/**
 * Plays a memory's attached track.
 *
 * MediaPlayer is created and released with the composable, so leaving the sheet
 * stops playback and frees the codec rather than leaving audio running behind a
 * closed screen.
 */
@Composable
fun AudioPlayer(
    file: File,
    title: String?,
    modifier: Modifier = Modifier,
) {
    var player by remember(file) { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember(file) { mutableStateOf(false) }
    var positionMs by remember(file) { mutableIntStateOf(0) }
    var durationMs by remember(file) { mutableIntStateOf(0) }
    var failed by remember(file) { mutableStateOf(false) }

    DisposableEffect(file) {
        val instance = MediaPlayer()
        runCatching {
            instance.setDataSource(file.absolutePath)
            instance.setOnPreparedListener { prepared -> durationMs = prepared.duration }
            instance.setOnCompletionListener {
                playing = false
                positionMs = 0
                runCatching { instance.seekTo(0) }
            }
            instance.setOnErrorListener { _, _, _ ->
                failed = true
                playing = false
                true
            }
            instance.prepareAsync()
            player = instance
        }.onFailure {
            failed = true
            runCatching { instance.release() }
        }

        onDispose {
            runCatching { instance.release() }
            player = null
        }
    }

    LaunchedEffect(playing) {
        while (playing) {
            positionMs = player?.currentPosition ?: positionMs
            delay(TICK_MS)
        }
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(start = 10.dp, end = 14.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FilledTonalIconButton(
                onClick = {
                    val instance = player ?: return@FilledTonalIconButton
                    if (playing) {
                        runCatching { instance.pause() }
                        playing = false
                    } else {
                        runCatching { instance.start() }
                        playing = true
                    }
                },
                enabled = !failed,
            ) {
                Icon(
                    imageVector = if (playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow,
                    contentDescription = stringResource(
                        if (playing) R.string.audio_pause else R.string.audio_play
                    ),
                    modifier = Modifier.size(20.dp),
                )
            }

            Column(Modifier.fillMaxWidth()) {
                Text(
                    text = title ?: stringResource(R.string.audio_untitled),
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (failed) {
                    Text(
                        text = stringResource(R.string.audio_failed),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Slider(
                        value = positionMs.toFloat(),
                        onValueChange = { value ->
                            positionMs = value.toInt()
                            runCatching { player?.seekTo(value.toInt()) }
                        },
                        valueRange = 0f..durationMs.coerceAtLeast(1).toFloat(),
                    )
                    Text(
                        text = "${formatTime(positionMs)} / ${formatTime(durationMs)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private fun formatTime(millis: Int): String {
    val totalSeconds = (millis / 1000).coerceAtLeast(0)
    return String.format(Locale.US, "%d:%02d", totalSeconds / 60, totalSeconds % 60)
}
