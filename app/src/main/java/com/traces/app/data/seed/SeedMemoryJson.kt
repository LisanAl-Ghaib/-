package com.traces.app.data.seed

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
)
