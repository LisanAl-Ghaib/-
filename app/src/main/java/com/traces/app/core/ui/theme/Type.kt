package com.traces.app.core.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Two voices. Serif carries anything the user wrote or a place is named —
 * it reads as an archive rather than an interface. The sans is reserved for
 * chrome: buttons, chips, counters.
 */
private val Archive = FontFamily.Serif
private val Chrome = FontFamily.Default

val TracesTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = Archive,
        fontWeight = FontWeight.Normal,
        fontSize = 30.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.4).sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = Archive,
        fontWeight = FontWeight.Normal,
        fontSize = 23.sp,
        lineHeight = 30.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = Archive,
        fontWeight = FontWeight.Medium,
        fontSize = 21.sp,
        lineHeight = 28.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = Archive,
        fontWeight = FontWeight.Medium,
        fontSize = 17.sp,
        lineHeight = 24.sp,
    ),
    // The memory text itself — generous leading, because these are paragraphs
    // people actually read rather than labels they scan.
    bodyLarge = TextStyle(
        fontFamily = Archive,
        fontWeight = FontWeight.Normal,
        fontSize = 17.sp,
        lineHeight = 27.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = Chrome,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = Chrome,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.2.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = Chrome,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.3.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = Chrome,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.6.sp,
    ),
)
