package com.traces.app.ui.memory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.traces.app.di.AppContainer
import com.traces.app.domain.model.MAX_TEXT_LENGTH
import com.traces.app.domain.model.MemoryDraft
import com.traces.app.domain.model.PhotoInput
import com.traces.app.domain.model.Visibility
import com.traces.app.domain.repository.MemoryRepository
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
    /** Distinguishes two consecutive editor sessions so each gets a fresh ViewModel. */
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
    /** Photo already stored with the record, relative to filesDir. */
    val storedPhotoPath: String? = null,
    /** content:// uri the user just picked, not yet copied anywhere. */
    val pickedPhotoUri: String? = null,
    val dateMode: DateMode = DateMode.NOW,
    val year: Int = LocalDate.now().year,
    val month: Int? = LocalDate.now().monthValue,
    val day: Int? = LocalDate.now().dayOfMonth,
    val visibility: Visibility = Visibility.PUBLIC,
    val saving: Boolean = false,
    val finished: Boolean = false,
) {
    val canSave: Boolean get() = text.trim().isNotEmpty() && !saving && !loading
    val hasPhoto: Boolean get() = pickedPhotoUri != null || storedPhotoPath != null
}

class CreateMemoryViewModel(
    private val repository: MemoryRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(EditorState())
    val state: StateFlow<EditorState> = _state.asStateFlow()

    private var mode: EditorMode? = null

    /** Photo path the record had when the editor opened; drives Removed vs Unchanged. */
    private var originalPhotoPath: String? = null

    /**
     * Begins an editor session. Called once per sheet open, keyed on the mode's
     * token, so one ViewModel serves every session instead of piling up an
     * instance per opened sheet.
     */
    fun start(mode: EditorMode) {
        if (this.mode?.token == mode.token) return
        this.mode = mode
        originalPhotoPath = null
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
                originalPhotoPath = memory.photoPath
                _state.update {
                    it.copy(
                        loading = false,
                        isEdit = true,
                        lat = memory.lat,
                        lng = memory.lng,
                        text = memory.text,
                        storedPhotoPath = memory.photoPath,
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

    fun onPhotoPicked(uri: String) {
        _state.update { it.copy(pickedPhotoUri = uri) }
    }

    fun onPhotoRemoved() {
        _state.update { it.copy(pickedPhotoUri = null, storedPhotoPath = null) }
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
                photo = resolvePhotoInput(current),
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

    private fun resolvePhotoInput(state: EditorState): PhotoInput = when {
        state.pickedPhotoUri != null -> PhotoInput.New(state.pickedPhotoUri)
        originalPhotoPath != null && state.storedPhotoPath == null -> PhotoInput.Removed
        else -> PhotoInput.Unchanged
    }

    companion object {
        const val MIN_YEAR = 1930

        fun factory(container: AppContainer) = viewModelFactory {
            initializer { CreateMemoryViewModel(container.memoryRepository) }
        }
    }
}
