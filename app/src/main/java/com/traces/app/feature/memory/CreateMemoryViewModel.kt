package com.traces.app.feature.memory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.core.di.AppContainer
import com.traces.app.core.domain.model.MAX_PHOTOS
import com.traces.app.core.domain.model.MAX_TEXT_LENGTH
import com.traces.app.core.domain.model.MIN_MEMORY_YEAR
import com.traces.app.core.domain.model.MemoryDraft
import com.traces.app.core.domain.model.PhotoRef
import com.traces.app.core.domain.model.Visibility
import com.traces.app.core.domain.repository.MemoryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

/**
 * One editor, two modes. Edit keeps the record's id and createdAt; everything
 * else, coordinates included, is editable.
 */
sealed interface EditorMode {
    /** Distinguishes two consecutive editor sessions so each starts clean. */
    val token: String

    data class Create(
        val lat: Double,
        val lng: Double,
        override val token: String = UUID.randomUUID().toString(),
    ) : EditorMode

    data class Edit(
        val memoryId: String,
        override val token: String = UUID.randomUUID().toString(),
    ) : EditorMode
}

enum class DateMode { NOW, YEAR, EXACT }

data class EditorState(
    val loading: Boolean = true,
    val isEdit: Boolean = false,
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val text: String = "",
    /** Stored paths and freshly picked uris side by side, in display order. */
    val photos: List<PhotoRef> = emptyList(),
    val dateMode: DateMode = DateMode.NOW,
    val year: Int = LocalDate.now().year,
    val month: Int? = LocalDate.now().monthValue,
    val day: Int? = LocalDate.now().dayOfMonth,
    val visibility: Visibility = Visibility.PUBLIC,
    val saving: Boolean = false,
    val finished: Boolean = false,
) {
    val canSave: Boolean get() = text.trim().isNotEmpty() && !saving && !loading
    val canAddPhoto: Boolean get() = photos.size < MAX_PHOTOS
    val freePhotoSlots: Int get() = (MAX_PHOTOS - photos.size).coerceAtLeast(0)
}

class CreateMemoryViewModel(
    private val repository: MemoryRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(EditorState())
    val state: StateFlow<EditorState> = _state.asStateFlow()

    private var mode: EditorMode? = null

    /**
     * Begins an editor session. Called once per sheet open, keyed on the mode's
     * token, so one ViewModel serves every session instead of piling up an
     * instance per opened sheet.
     */
    fun start(mode: EditorMode) {
        if (this.mode?.token == mode.token) return
        this.mode = mode
        _state.value = EditorState()

        when (mode) {
            is EditorMode.Create -> _state.update {
                it.copy(loading = false, isEdit = false, lat = mode.lat, lng = mode.lng)
            }

            is EditorMode.Edit -> viewModelScope.launch {
                val memory = repository.getById(mode.memoryId)
                if (memory == null) {
                    _state.update { it.copy(loading = false, finished = true) }
                    return@launch
                }
                _state.update {
                    it.copy(
                        loading = false,
                        isEdit = true,
                        lat = memory.lat,
                        lng = memory.lng,
                        text = memory.text,
                        photos = memory.photoPaths.map(PhotoRef::Stored),
                        dateMode = if (memory.happenedMonth == null) DateMode.YEAR else DateMode.EXACT,
                        year = memory.happenedYear,
                        month = memory.happenedMonth,
                        day = memory.happenedDay,
                        visibility = memory.visibility,
                    )
                }
            }
        }
    }

    fun onTextChange(value: String) {
        _state.update { it.copy(text = value.take(MAX_TEXT_LENGTH)) }
    }

    fun onPositionChange(lat: Double, lng: Double) {
        _state.update { it.copy(lat = lat, lng = lng) }
    }

    fun onDateModeChange(dateMode: DateMode) {
        _state.update { current ->
            when (dateMode) {
                DateMode.NOW -> {
                    val today = LocalDate.now()
                    current.copy(
                        dateMode = dateMode,
                        year = today.year,
                        month = today.monthValue,
                        day = today.dayOfMonth,
                    )
                }
                // Only the year survives; month and day go back to null.
                DateMode.YEAR -> current.copy(dateMode = dateMode, month = null, day = null)
                DateMode.EXACT -> current.copy(dateMode = dateMode)
            }
        }
    }

    fun onYearPicked(year: Int) {
        _state.update { it.copy(dateMode = DateMode.YEAR, year = year, month = null, day = null) }
    }

    fun onExactDatePicked(date: LocalDate) {
        _state.update {
            it.copy(
                dateMode = DateMode.EXACT,
                year = date.year,
                month = date.monthValue,
                day = date.dayOfMonth,
            )
        }
    }

    fun onPhotosPicked(uris: List<String>) {
        _state.update { current ->
            val room = current.freePhotoSlots
            if (room == 0) current
            else current.copy(photos = current.photos + uris.take(room).map(PhotoRef::Picked))
        }
    }

    fun onPhotoRemoved(index: Int) {
        _state.update { current ->
            if (index !in current.photos.indices) current
            else current.copy(photos = current.photos.filterIndexed { i, _ -> i != index })
        }
    }

    fun onVisibilityChange(visibility: Visibility) {
        _state.update { it.copy(visibility = visibility) }
    }

    fun save() {
        val current = _state.value
        val currentMode = mode ?: return
        if (!current.canSave) return
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val draft = MemoryDraft(
                lat = current.lat,
                lng = current.lng,
                text = current.text.trim(),
                photos = current.photos,
                happenedYear = current.year,
                happenedMonth = current.month,
                happenedDay = current.day,
                visibility = current.visibility,
            )
            when (currentMode) {
                is EditorMode.Create -> repository.create(draft)
                is EditorMode.Edit -> repository.update(currentMode.memoryId, draft)
            }
            _state.update { it.copy(saving = false, finished = true) }
        }
    }

    companion object {
        const val MIN_YEAR = MIN_MEMORY_YEAR

        fun factory(container: AppContainer) = viewModelFactory {
            initializer { CreateMemoryViewModel(container.memoryRepository) }
        }
    }
}
