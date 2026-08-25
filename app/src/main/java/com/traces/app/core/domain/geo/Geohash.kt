package com.traces.app.core.domain.geo

/**
 * Base32 geohash encoder.
 *
 * The column exists so the local schema already matches the future Firestore
 * document shape. Prototype queries run on [lat]/[lng] ranges instead — see
 * MemoryDao.
 */
object Geohash {

    private const val BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
    const val DEFAULT_PRECISION = 9

    fun encode(lat: Double, lng: Double, precision: Int = DEFAULT_PRECISION): String {
        require(precision in 1..12) { "precision must be in 1..12" }

        var latMin = -90.0
        var latMax = 90.0
        var lngMin = -180.0
        var lngMax = 180.0

        val hash = StringBuilder(precision)
        var isLongitudeTurn = true
        var bitsInChar = 0
        var charIndex = 0

        while (hash.length < precision) {
            if (isLongitudeTurn) {
                val mid = (lngMin + lngMax) / 2
                if (lng >= mid) {
                    charIndex = charIndex * 2 + 1
                    lngMin = mid
                } else {
                    charIndex *= 2
                    lngMax = mid
                }
            } else {
                val mid = (latMin + latMax) / 2
                if (lat >= mid) {
                    charIndex = charIndex * 2 + 1
                    latMin = mid
                } else {
                    charIndex *= 2
                    latMax = mid
                }
            }
            isLongitudeTurn = !isLongitudeTurn

            if (bitsInChar < 4) {
                bitsInChar++
            } else {
                hash.append(BASE32[charIndex])
                bitsInChar = 0
                charIndex = 0
            }
        }
        return hash.toString()
    }
}
