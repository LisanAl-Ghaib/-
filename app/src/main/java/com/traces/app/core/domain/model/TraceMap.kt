package com.traces.app.core.domain.model

/**
 * A themed collection of points — "Кофе Парижа", "Тихие дворы".
 *
 * A memory can sit on the world map, in the author's personal map and in one
 * themed map at once; those are three independent facts, not a hierarchy.
 */
data class TraceMap(
    val id: String,
    val title: String,
    val description: String,
    /** Cover glyph. Cheaper than an image and impossible to get wrong. */
    val emoji: String,
    val ownerId: String,
    val ownerName: String,
    val visibility: Visibility,
    /** Pinned to the top of the collection, Spotify-style. */
    val isPinned: Boolean,
    /** The local user takes part in this map. */
    val isMember: Boolean,
    val pointCount: Int,
    val createdAt: Long,
    val isSeed: Boolean,
) {
    val isOwn: Boolean get() = ownerId == LOCAL_AUTHOR_ID
    val isEditable: Boolean get() = isOwn && !isSeed
}

/** How the home feed groups the maps it shows. */
enum class FeedSection { FOR_YOU, POPULAR, RECENT }

data class FeedRow(
    val section: FeedSection,
    val maps: List<TraceMap>,
)

data class TraceMapDraft(
    val title: String,
    val description: String,
    val emoji: String,
    val visibility: Visibility,
)

val MAP_EMOJI_CHOICES = listOf(
    "☕", "🌿", "🕰", "📚", "🌉", "🎧", "🍷", "🐈", "🌧", "🚲", "🎬", "🥐",
)
