package com.traces.app.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.core.data.prefs.UserPreferences
import com.traces.app.core.data.repository.LocalMemoryRepository
import com.traces.app.core.data.repository.LocalProfileRepository
import com.traces.app.core.di.AppContainer
import com.traces.app.core.domain.model.LOCAL_AUTHOR_ID
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.domain.model.MemoryFilter
import com.traces.app.core.domain.model.Profile
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ProfileViewModel(
    private val memoryRepository: LocalMemoryRepository,
    private val profileRepository: LocalProfileRepository,
    private val preferences: UserPreferences,
    /** null means the local user's own profile. */
    private val authorId: String?,
) : ViewModel() {

    val isLocal: Boolean = authorId == null || authorId == LOCAL_AUTHOR_ID

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    /** A person found by code, shown as a result the user can open. */
    private val _foundProfile = MutableStateFlow<Profile?>(null)
    val foundProfile: StateFlow<Profile?> = _foundProfile.asStateFlow()

    private val _lookupMiss = MutableStateFlow(false)
    val lookupMiss: StateFlow<Boolean> = _lookupMiss.asStateFlow()

    private val showDemo: Flow<Boolean> = preferences.observeShowDemoData()

    @OptIn(ExperimentalCoroutinesApi::class)
    val profile: StateFlow<Profile?> = showDemo
        .flatMapLatest { demo -> profileRepository.observeProfile(authorId ?: LOCAL_AUTHOR_ID, demo) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /**
     * Own profile searches across everything the user wrote; someone else's
     * shows only what they made public.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    val points: StateFlow<List<Memory>> =
        if (isLocal) {
            _query.flatMapLatest { query -> memoryRepository.observeOwn(MemoryFilter(query = query)) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
        } else {
            profileRepository.observeVisiblePoints(authorId!!)
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
        }

    val myCode: String get() = profileRepository.localCode()

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun lookUp(rawCode: String) {
        viewModelScope.launch {
            val demo = preferences.showDemoData
            val found = profileRepository.findByCode(rawCode, demo)
            _foundProfile.value = found
            _lookupMiss.value = found == null
        }
    }

    fun clearLookup() {
        _foundProfile.value = null
        _lookupMiss.value = false
    }

    fun delete(id: String) {
        viewModelScope.launch { memoryRepository.delete(id) }
    }

    fun rename(name: String) {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch { memoryRepository.renameLocalAuthor(trimmed) }
    }

    companion object {
        fun factory(container: AppContainer, authorId: String?) = viewModelFactory {
            initializer {
                ProfileViewModel(
                    memoryRepository = container.localRepository,
                    profileRepository = container.profileRepository,
                    preferences = container.userPreferences,
                    authorId = authorId,
                )
            }
        }
    }
}
