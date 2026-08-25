package com.traces.app.core.ui

import androidx.compose.runtime.staticCompositionLocalOf
import com.traces.app.core.di.AppContainer

val LocalAppContainer = staticCompositionLocalOf<AppContainer> {
    error("AppContainer is not provided")
}
