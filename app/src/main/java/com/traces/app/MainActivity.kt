package com.traces.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import com.traces.app.feature.navigation.TracesApp
import com.traces.app.core.ui.LocalAppContainer
import com.traces.app.core.ui.theme.TracesTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as TracesApplication).container
        setContent {
            TracesTheme {
                CompositionLocalProvider(LocalAppContainer provides container) {
                    TracesApp()
                }
            }
        }
    }
}
