package com.traces.app.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val LightColors = lightColorScheme(
    primary = Clay,
    onPrimary = PaperRaised,
    primaryContainer = ClaySoft,
    onPrimaryContainer = ClayDeep,
    secondary = InkMuted,
    onSecondary = PaperRaised,
    secondaryContainer = Rule,
    onSecondaryContainer = Ink,
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = Rule,
    onSurfaceVariant = InkMuted,
    surfaceContainer = PaperRaised,
    surfaceContainerHigh = PaperRaised,
    surfaceContainerLow = Paper,
    outline = Rule,
    outlineVariant = Rule,
)

private val DarkColors = darkColorScheme(
    primary = ClayBright,
    onPrimary = Night,
    primaryContainer = ClayDeep,
    onPrimaryContainer = NightInk,
    secondary = NightInkMuted,
    onSecondary = Night,
    secondaryContainer = NightRule,
    onSecondaryContainer = NightInk,
    background = Night,
    onBackground = NightInk,
    surface = Night,
    onSurface = NightInk,
    surfaceVariant = NightRule,
    onSurfaceVariant = NightInkMuted,
    surfaceContainer = NightRaised,
    surfaceContainerHigh = NightRaised,
    surfaceContainerLow = Night,
    outline = NightRule,
    outlineVariant = NightRule,
)

/**
 * Corners are softer than Material's defaults across the board — closer to a
 * pressed card than a dialog, which suits sheets that hold handwriting.
 */
private val TracesShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

/**
 * Dynamic colour is deliberately off: the temporal ramp only means anything if
 * it looks the same on every device.
 */
@Composable
fun TracesTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = TracesTypography,
        shapes = TracesShapes,
        content = content,
    )
}
