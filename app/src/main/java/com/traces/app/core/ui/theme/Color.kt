package com.traces.app.core.ui.theme

import androidx.compose.ui.graphics.Color

// --- Paper and ink -------------------------------------------------------
// The chrome is deliberately quiet: warm paper, dark ink, one accent. The map
// and the temporal ramp below are the only places colour is allowed to speak.

val Paper = Color(0xFFF6F1E8)
val PaperRaised = Color(0xFFFFFDF8)
val Ink = Color(0xFF1F1B16)
val InkMuted = Color(0xFF6B6157)
val Rule = Color(0xFFE2D9CA)

val Night = Color(0xFF14110D)
val NightRaised = Color(0xFF1E1A15)
val NightInk = Color(0xFFEFE7DA)
val NightInkMuted = Color(0xFF9A9083)
val NightRule = Color(0xFF302A22)

val Clay = Color(0xFF9C4A2F)
val ClayBright = Color(0xFFD98A6B)
val ClaySoft = Color(0xFFF2DED4)
val ClayDeep = Color(0xFF6E3020)

// --- The temporal ramp ---------------------------------------------------
// A pin's colour is its age. Oldest memories sit at the faded end, the most
// recent at the saturated one, so the age of a neighbourhood reads off the map
// without a single label.

val AgedLight = Color(0xFFD8BFA8)
val MiddleLight = Color(0xFFC0764F)
val RecentLight = Color(0xFF8E3A22)

// Dark theme cannot simply reuse those: the faded end would disappear into the
// map. The ramp is re-anchored so both ends stay legible on a dark ground.
val AgedDark = Color(0xFF9A7C5E)
val MiddleDark = Color(0xFFC98457)
val RecentDark = Color(0xFFF0A07E)
