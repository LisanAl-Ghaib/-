package com.traces.app.data.local

import android.content.Context
import android.content.SharedPreferences
import com.traces.app.R
import com.traces.app.domain.model.LOCAL_AUTHOR_ID
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.onStart

/**
 * There is no auth in the prototype, but records still need an author name and
 * the map still needs to remember that the one-off hint was shown.
 */
class UserPreferences(context: Context) {

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("traces_user", Context.MODE_PRIVATE)
    private val defaultAuthorName: String get() = appContext.getString(R.string.profile_default_name)

    val authorId: String get() = LOCAL_AUTHOR_ID

    var authorName: String
        get() = prefs.getString(KEY_AUTHOR_NAME, null) ?: defaultAuthorName
        set(value) = prefs.edit().putString(KEY_AUTHOR_NAME, value).apply()

    var hintShown: Boolean
        get() = prefs.getBoolean(KEY_HINT_SHOWN, false)
        set(value) = prefs.edit().putBoolean(KEY_HINT_SHOWN, value).apply()

    var seedLoaded: Boolean
        get() = prefs.getBoolean(KEY_SEED_LOADED, false)
        set(value) = prefs.edit().putBoolean(KEY_SEED_LOADED, value).apply()

    fun observeAuthorName(): Flow<String> = observeKey(KEY_AUTHOR_NAME) { authorName }

    private fun <T> observeKey(key: String, read: () -> T): Flow<T> = callbackFlow {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, changed ->
            if (changed == key) trySend(read())
        }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }.onStart { emit(read()) }

    private companion object {
        const val KEY_AUTHOR_NAME = "author_name"
        const val KEY_HINT_SHOWN = "hint_shown"
        const val KEY_SEED_LOADED = "seed_loaded"
    }
}
