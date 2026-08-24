package com.traces.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = Clay,
    onPrimary = PaperElevated,
    primaryContainer = ClayContainer,
    onPrimaryContainer = Ink,
    secondary = InkMuted,
    onSecondary = PaperElevated,
    secondaryContainer = LineLight,
    onSecondaryContainer = Ink,
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = LineLight,
    onSurfaceVariant = InkMuted,
    surfaceContainer = PaperElevated,
    surfaceContainerHigh = PaperElevated,
    surfaceContainerLow = Paper,
    outline = LineLight,
    outlineVariant = LineLight,
)

private val DarkColors = darkColorScheme(
    primary = ClayLight,
    onPrimary = NightSurface,
    primaryContainer = Clay,
    onPrimaryContainer = NightInk,
    secondary = NightInkMuted,
    onSecondary = NightSurface,
    secondaryContainer = LineDark,
    onSecondaryContainer = NightInk,
    background = NightSurface,
    onBackground = NightInk,
    surface = NightSurface,
    onSurface = NightInk,
    surfaceVariant = LineDark,
    onSurfaceVariant = NightInkMuted,
    surfaceContainer = NightElevated,
    surfaceContainerHigh = NightElevated,
    surfaceContainerLow = NightSurface,
    outline = LineDark,
    outlineVariant = LineDark,
)

/**
 * Dynamic color is deliberately off: the map is the loud element, and the
 * chrome around it should stay the same quiet paper on every device.
 */
@Composable
fun TracesTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = TracesTypography,
        content = content,
    )
}
