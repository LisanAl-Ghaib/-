package com.traces.app.core.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.traces.app.core.domain.model.Memory
import com.traces.app.core.domain.model.Visibility

@Entity(
    tableName = "memories",
    indices = [
        Index("lat"),
        Index("lng"),
        Index("authorId"),
        Index("happenedYear"),
    ],
)
data class MemoryEntity(
    @PrimaryKey val id: String,
    val authorId: String,
    val authorName: String,
    val lat: Double,
    val lng: Double,
    /** 9 characters, base32. Written on every save so the schema matches Firestore. */
    val geohash: String,
    val text: String,
    /**
     * text pre-lowercased for search. SQLite's LIKE and LOWER() fold ASCII only,
     * so Cyrillic has to be lowercased in Kotlin and compared lowercase to
     * lowercase — which keeps the search inside SQL instead of in memory.
     */
    val textLower: String,
    /** Paths relative to filesDir, JSON-encoded. Never content:// uris. */
    val photoPaths: List<String>,
    /** Relative path of an attached track, plus the name it was picked under. */
    val audioPath: String?,
    val audioTitle: String?,
    val happenedYear: Int,
    /** null means only the year is known. */
    val happenedMonth: Int?,
    val happenedDay: Int?,
    val createdAt: Long,
    val visibility: String,
    val isSeed: Boolean,
)

fun MemoryEntity.toDomain(): Memory = Memory(
    id = id,
    authorId = authorId,
    authorName = authorName,
    lat = lat,
    lng = lng,
    text = text,
    photoPaths = photoPaths,
    audioPath = audioPath,
    audioTitle = audioTitle,
    happenedYear = happenedYear,
    happenedMonth = happenedMonth,
    happenedDay = happenedDay,
    createdAt = createdAt,
    visibility = runCatching { Visibility.valueOf(visibility) }.getOrDefault(Visibility.PRIVATE),
    isSeed = isSeed,
)
