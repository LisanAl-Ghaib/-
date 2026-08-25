package com.traces.app.core.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.traces.app.core.domain.model.GeoPoint
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class LocationProvider(context: Context) {

    private val appContext = context.applicationContext
    private val client = LocationServices.getFusedLocationProviderClient(appContext)

    fun hasPermission(): Boolean = PERMISSIONS.any { permission ->
        ContextCompat.checkSelfPermission(appContext, permission) == PackageManager.PERMISSION_GRANTED
    }

    /** Returns null when permission is missing or no fix is available. */
    @SuppressLint("MissingPermission")
    suspend fun currentLocation(): GeoPoint? {
        if (!hasPermission()) return null
        val cancellation = CancellationTokenSource()
        return suspendCancellableCoroutine { continuation ->
            client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cancellation.token)
                .addOnSuccessListener { location ->
                    continuation.resume(location?.let { GeoPoint(it.latitude, it.longitude) })
                }
                .addOnFailureListener { continuation.resume(null) }
            continuation.invokeOnCancellation { cancellation.cancel() }
        }
    }

    companion object {
        val PERMISSIONS = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
    }
}
