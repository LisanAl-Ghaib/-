package com.traces.app.domain.model

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
    val photoPath: String?,
    val happenedYear: Int,
    val happenedMonth: Int?,
    val happenedDay: Int?,
    val createdAt: Long,
    val visibility: Visibility,
    val isSeed: Boolean,
) {
    val isEditable: Boolean get() = !isSeed && authorId == LOCAL_AUTHOR_ID
}

/**
 * What the editor hands to the repository. Photos are passed as an intent
 * rather than a path, so file lifecycle stays in one place.
 */
sealed interface PhotoInput {
    /** Edit mode: leave whatever photo the record already has. */
    data object Unchanged : PhotoInput

    /** Drop the existing photo (and its file). */
    data object Removed : PhotoInput

    /** A content:// uri picked by the user; the repository copies it into filesDir. */
    data class New(val sourceUri: String) : PhotoInput
}

data class MemoryDraft(
    val lat: Double,
    val lng: Double,
    val text: String,
    val photo: PhotoInput,
    val happenedYear: Int,
    val happenedMonth: Int?,
    val happenedDay: Int?,
    val visibility: Visibility,
)

const val LOCAL_AUTHOR_ID = "local_user"
const val MAX_TEXT_LENGTH = 600
