package com.traces.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.traces.app.domain.model.Memory
import com.traces.app.domain.model.Visibility

@Entity(
    tableName = "memories",
    indices = [
        Index("lat"),
        Index("lng"),
        Index("authorId"),
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
    /** Path relative to filesDir, e.g. "photos/<uuid>.jpg". Never a content:// uri. */
    val photoPath: String?,
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
    photoPath = photoPath,
    happenedYear = happenedYear,
    happenedMonth = happenedMonth,
    happenedDay = happenedDay,
    createdAt = createdAt,
    visibility = runCatching { Visibility.valueOf(visibility) }.getOrDefault(Visibility.PRIVATE),
    isSeed = isSeed,
)
