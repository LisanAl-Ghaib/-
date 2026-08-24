package com.traces.app

import android.app.Application
import com.traces.app.di.AppContainer

class TracesApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.seedOnce()
    }
}
