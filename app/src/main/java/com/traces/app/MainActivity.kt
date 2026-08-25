package com.traces.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.traces.app.core.domain.model.ThemeMode
import com.traces.app.core.ui.LocalAppContainer
import com.traces.app.core.ui.theme.TracesTheme
import com.traces.app.feature.navigation.TracesApp

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as TracesApplication).container
        setContent {
            val themeMode by container.userPreferences.observeThemeMode()
                .collectAsStateWithLifecycle(initialValue = container.userPreferences.themeMode)

            val darkTheme = when (themeMode) {
                ThemeMode.SYSTEM -> isSystemInDarkTheme()
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
            }

            TracesTheme(darkTheme = darkTheme) {
                CompositionLocalProvider(LocalAppContainer provides container) {
                    TracesApp()
                }
            }
        }
    }
}
