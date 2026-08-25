package com.traces.app.core.domain.model

/**
 * A person as the app knows them.
 *
 * There is no auth and no server, so "people" are the local user plus the
 * authors already present in the database. [code] is derived from the id, which
 * makes it stable without anyone having to store it.
 */
data class Profile(
    val id: String,
    val name: String,
    val code: String,
    val memoryCount: Int,
    val mapCount: Int,
    val earliestYear: Int?,
    val isLocal: Boolean,
)

/**
 * A short, human-transcribable id. The alphabet drops characters people
 * routinely confuse — 0/O, 1/I/L, 5/S, 8/B — so a code read aloud survives.
 */
object ProfileCode {

    private const val ALPHABET = "ACDEFGHJKMNPQRTUVWXYZ2346790"
    private const val LENGTH = 8

    fun forId(id: String): String {
        var hash = fnv1a(id)
        val builder = StringBuilder(LENGTH)
        repeat(LENGTH) {
            builder.append(ALPHABET[(hash % ALPHABET.length).toInt()])
            hash /= ALPHABET.length
        }
        return builder.chunked(4).joinToString("-")
    }

    /** Accepts the code with or without its separator, in any case. */
    fun normalise(raw: String): String = raw.uppercase().filter { it in ALPHABET }

    private fun fnv1a(value: String): Long {
        var hash = -0x340d631b7bdddcdbL
        for (char in value) {
            hash = hash xor char.code.toLong()
            hash *= 0x100000001b3L
        }
        return hash and Long.MAX_VALUE
    }
}

enum class ThemeMode { SYSTEM, LIGHT, DARK }
