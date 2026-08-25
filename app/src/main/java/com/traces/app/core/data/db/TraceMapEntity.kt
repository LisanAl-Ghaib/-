package com.traces.app.core.data.db

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.traces.app.core.domain.model.TraceMap
import com.traces.app.core.domain.model.Visibility

@Entity(
    tableName = "maps",
    indices = [Index("ownerId"), Index("visibility")],
)
data class TraceMapEntity(
    @PrimaryKey val id: String,
    val title: String,
    /** Lowercased for search — SQLite folds ASCII only, so Kotlin does it. */
    val titleLower: String,
    val description: String,
    val emoji: String,
    val ownerId: String,
    val ownerName: String,
    val visibility: String,
    val isPinned: Boolean,
    val isMember: Boolean,
    val createdAt: Long,
    val isSeed: Boolean,
)

/** The entity plus the point count, which is a join rather than a column. */
data class TraceMapWithCount(
    @Embedded val map: TraceMapEntity,
    val pointCount: Int,
)

fun TraceMapWithCount.toDomain(): TraceMap = TraceMap(
    id = map.id,
    title = map.title,
    description = map.description,
    emoji = map.emoji,
    ownerId = map.ownerId,
    ownerName = map.ownerName,
    visibility = runCatching { Visibility.valueOf(map.visibility) }.getOrDefault(Visibility.PUBLIC),
    isPinned = map.isPinned,
    isMember = map.isMember,
    pointCount = pointCount,
    createdAt = map.createdAt,
    isSeed = map.isSeed,
)
