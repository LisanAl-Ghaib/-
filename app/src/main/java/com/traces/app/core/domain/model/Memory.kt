package com.traces.app.core.domain.model

import java.time.LocalDate

enum class Visibility { PRIVATE, PUBLIC }

enum class MapMode { WORLD, MINE }

data class GeoPoint(val lat: Double, val lng: Double)

data class GeoBounds(
    val south: Double,
    val west: Double,
    val north: Double,
    val east: Double,
)

data class Memory(
    val id: String,
    val authorId: String,
    val authorName: String,
    val lat: Double,
    val lng: Double,
    val text: String,
    /** Paths relative to filesDir, in display order. Empty when there is no photo. */
    val photoPaths: List<String>,
    /** Path relative to filesDir of an attached track, and the name it had. */
    val audioPath: String?,
    val audioTitle: String?,
    /** The themed map this point was added to, if any. */
    val mapId: String?,
    /** Whether it also shows on the author's personal map. */
    val inPersonalMap: Boolean,
    val happenedYear: Int,
    val happenedMonth: Int?,
    val happenedDay: Int?,
    val createdAt: Long,
    val visibility: Visibility,
    val isSeed: Boolean,
) {
    val isEditable: Boolean get() = !isSeed && authorId == LOCAL_AUTHOR_ID
    val coverPhoto: String? get() = photoPaths.firstOrNull()
    val hasAudio: Boolean get() = audioPath != null
}

/**
 * One entry in the editor's photo strip. The editor works with both kinds side
 * by side; the repository turns the whole list into stored paths on save.
 */
sealed interface PhotoRef {
    /** Already copied into filesDir. */
    data class Stored(val path: String) : PhotoRef

    /** A content:// uri the user just picked, not yet copied anywhere. */
    data class Picked(val uri: String) : PhotoRef
}

/** A track attached to a memory. Same two states as a photo. */
sealed interface AudioRef {
    val title: String?

    data class Stored(val path: String, override val title: String?) : AudioRef

    data class Picked(val uri: String, override val title: String?) : AudioRef
}

data class MemoryDraft(
    val lat: Double,
    val lng: Double,
    val text: String,
    /** The complete desired photo list — additions, removals and order all at once. */
    val photos: List<PhotoRef>,
    /** null means the memory has no track — or that its track was removed. */
    val audio: AudioRef?,
    val mapId: String?,
    val inPersonalMap: Boolean,
    val happenedYear: Int,
    val happenedMonth: Int?,
    val happenedDay: Int?,
    val visibility: Visibility,
)

/**
 * What the map and the timeline are currently narrowed to.
 *
 * [query] is matched case-insensitively against a pre-lowercased column, so it
 * works for Cyrillic — SQLite's own LIKE folds ASCII only.
 */
data class MemoryFilter(
    val query: String = "",
    val fromYear: Int = MIN_MEMORY_YEAR,
    val toYear: Int = currentYear(),
    val authorId: String? = null,
    /**
     * Seeded example memories. Not part of [activeCount]: it is a preference
     * from the profile, not something the filter sheet sets.
     */
    val includeDemo: Boolean = true,
) {
    val isActive: Boolean
        get() = query.isNotBlank() ||
            fromYear > MIN_MEMORY_YEAR ||
            toYear < currentYear() ||
            authorId != null

    val activeCount: Int
        get() = listOf(
            query.isNotBlank(),
            fromYear > MIN_MEMORY_YEAR || toYear < currentYear(),
            authorId != null,
        ).count { it }

    companion object {
        val None = MemoryFilter()
    }
}

data class AuthorRef(val id: String, val name: String)

fun currentYear(): Int = LocalDate.now().year

const val LOCAL_AUTHOR_ID = "local_user"
const val MAX_TEXT_LENGTH = 600
const val MAX_PHOTOS = 5
const val MIN_MEMORY_YEAR = 1930
