package com.traces.app.core.ui.format

import android.location.Location
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.traces.app.R
import com.traces.app.core.domain.model.GeoPoint
import com.traces.app.core.domain.model.Memory
import java.util.Locale
import kotlin.math.roundToInt

/** «Здесь, в 1978» / «Здесь, в мае 1978» / «Здесь, 12 мая 1978». */
@Composable
fun rememberHappenedLabel(memory: Memory): String {
    val context = LocalContext.current
    val month = memory.happenedMonth
    val day = memory.happenedDay
    return when {
        month == null -> stringResource(R.string.detail_here_year, memory.happenedYear)
        day == null -> {
            val names = context.resources.getStringArray(R.array.months_prepositional)
            stringResource(R.string.detail_here_month, names[month.coerceIn(1, 12) - 1], memory.happenedYear)
        }
        else -> {
            val names = context.resources.getStringArray(R.array.months_genitive)
            stringResource(R.string.detail_here_date, day, names[month.coerceIn(1, 12) - 1], memory.happenedYear)
        }
    }
}

/** «в 240 м отсюда» / «в 1,4 км отсюда». Null when there is no user position. */
@Composable
fun rememberDistanceLabel(memory: Memory, from: GeoPoint?): String? {
    if (from == null) return null
    val results = FloatArray(1)
    Location.distanceBetween(from.lat, from.lng, memory.lat, memory.lng, results)
    val meters = results[0]
    return if (meters < 1000f) {
        stringResource(R.string.detail_distance_meters, meters.roundToInt())
    } else {
        stringResource(R.string.detail_distance_km, String.format(Locale("ru"), "%.1f", meters / 1000f))
    }
}

fun formatCoordinate(value: Double): String = String.format(Locale.US, "%.5f", value)
