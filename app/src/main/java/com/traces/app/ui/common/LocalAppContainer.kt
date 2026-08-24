package com.traces.app.ui.common

import androidx.compose.runtime.staticCompositionLocalOf
import com.traces.app.di.AppContainer

val LocalAppContainer = staticCompositionLocalOf<AppContainer> {
    error("AppContainer is not provided")
}
