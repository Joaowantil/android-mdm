package com.mdm.agent.services

import retrofit2.Response
import retrofit2.http.*

data class EnrollRequest(
    val enrollment_token: String,
    val device_id: String,
    val model: String?,
    val manufacturer: String?,
    val os_version: String?,
    val serial_number: String?,
    val imei: String?,
    val fcm_token: String?
)

data class EnrollResponse(
    val success: Boolean,
    val device_id: String,
    val message: String
)

data class HeartbeatRequest(
    val device_id: String,
    val battery_level: Int?,
    val storage_free: Int?,
    val storage_total: Int?,
    val is_online: Boolean = true,
    val installed_apps: List<String>?,
    val fcm_token: String?
)

data class HeartbeatResponse(
    val status: String,
    val commands: List<PendingCommand>
)

data class PendingCommand(
    val id: Int,
    val command_type: String,
    val payload: Map<String, Any>?
)

data class LocationUpdate(
    val device_id: String,
    val latitude: Double,
    val longitude: Double
)

interface MDMApi {
    @POST("/api/devices/enroll")
    suspend fun enroll(@Body request: EnrollRequest): Response<EnrollResponse>

    @POST("/api/devices/heartbeat")
    suspend fun heartbeat(@Body request: HeartbeatRequest): Response<HeartbeatResponse>

    @POST("/api/devices/location")
    suspend fun updateLocation(@Body location: LocationUpdate): Response<Map<String, String>>
}
