package com.traces.app.feature.splash

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.traces.app.BuildConfig
import com.traces.app.R
import com.traces.app.core.ui.theme.Clay
import com.traces.app.core.ui.theme.Paper
import kotlinx.coroutines.delay

/** Long enough to register as a brand moment, short enough not to be a wait. */
private const val SPLASH_MS = 1100L

/**
 * The launch screen: the app's mark on its own colour, with the name.
 *
 * It is a real composable rather than a windowBackground so the mark can
 * settle into place instead of appearing frozen.
 */
@Composable
fun SplashScreen(onFinished: () -> Unit) {
    var settled by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (settled) 1f else 0.82f,
        animationSpec = tween(durationMillis = 620),
        label = "logo-scale",
    )

    LaunchedEffect(Unit) {
        settled = true
        delay(SPLASH_MS)
        onFinished()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Clay),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_logo_mono),
                contentDescription = null,
                tint = Paper,
                modifier = Modifier
                    .size(96.dp)
                    .scale(scale),
            )
            Text(
                text = stringResource(R.string.app_name),
                color = Paper,
                fontFamily = FontFamily.Serif,
                fontSize = 34.sp,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.displaySmall,
            )
        }

        Text(
            text = BuildConfig.VERSION_NAME,
            color = Paper.copy(alpha = 0.55f),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 36.dp),
        )
    }
}
