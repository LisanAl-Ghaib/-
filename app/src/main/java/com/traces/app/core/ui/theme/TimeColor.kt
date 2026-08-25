package com.traces.app.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import com.traces.app.core.domain.model.MIN_MEMORY_YEAR
import com.traces.app.core.domain.model.currentYear

/**
 * Maps a year onto the app's temporal ramp.
 *
 * This is the one place the product's subject — time — becomes colour, so both
 * the markers and the legend read from here and cannot drift apart.
 */
object TimeColor {

    fun forYear(year: Int, darkTheme: Boolean): Color {
        val stops = if (darkTheme) {
            Triple(AgedDark, MiddleDark, RecentDark)
        } else {
            Triple(AgedLight, MiddleLight, RecentLight)
        }
        return atFraction(fractionOf(year), stops)
    }

    /** The whole ramp, for legends and gradient tracks. */
    fun ramp(darkTheme: Boolean): List<Color> = if (darkTheme) {
        listOf(AgedDark, MiddleDark, RecentDark)
    } else {
        listOf(AgedLight, MiddleLight, RecentLight)
    }

    private fun fractionOf(year: Int): Float {
        val newest = currentYear()
        val span = (newest - MIN_MEMORY_YEAR).coerceAtLeast(1)
        return ((year - MIN_MEMORY_YEAR).toFloat() / span).coerceIn(0f, 1f)
    }

    private fun atFraction(fraction: Float, stops: Triple<Color, Color, Color>): Color {
        val (aged, middle, recent) = stops
        return if (fraction < 0.5f) {
            lerp(aged, middle, fraction * 2f)
        } else {
            lerp(middle, recent, (fraction - 0.5f) * 2f)
        }
    }
}

@Composable
@ReadOnlyComposable
fun yearColor(year: Int): Color = TimeColor.forYear(year, isSystemInDarkTheme())
