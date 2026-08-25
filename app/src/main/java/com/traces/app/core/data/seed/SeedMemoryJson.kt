package com.traces.app.core.data.seed

import kotlinx.serialization.Serializable

@Serializable
data class SeedMemoryJson(
    val authorName: String,
    val lat: Double,
    val lng: Double,
    val text: String,
    val happenedYear: Int,
    val happenedMonth: Int? = null,
    val happenedDay: Int? = null,
    /** Id of the themed map this point belongs to, if any. */
    val map: String? = null,
)

@Serializable
data class SeedMapJson(
    val id: String,
    val title: String,
    val description: String,
    val emoji: String,
    val ownerName: String,
)
