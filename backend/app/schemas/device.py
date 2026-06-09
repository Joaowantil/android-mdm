from datetime import datetime

from pydantic import BaseModel


class DeviceCreate(BaseModel):
    name: str | None = None
    model: str | None = None
    manufacturer: str | None = None
    os_version: str | None = None
    serial_number: str | None = None
    imei: str | None = None


class DeviceUpdate(BaseModel):
    name: str | None = None
    kiosk_enabled: bool | None = None
    kiosk_apps: list[str] | None = None


class DeviceResponse(BaseModel):
    id: int
    device_id: str
    name: str | None
    model: str | None
    manufacturer: str | None
    os_version: str | None
    serial_number: str | None
    status: str
    is_online: bool
    last_seen: datetime | None
    latitude: float | None
    longitude: float | None
    kiosk_enabled: bool
    battery_level: int | None
    storage_free: int | None
    storage_total: int | None
    enrolled_at: datetime | None
    created_at: datetime | None

    class Config:
        from_attributes = True


class DeviceEnrollRequest(BaseModel):
    enrollment_token: str
    device_id: str
    model: str | None = None
    manufacturer: str | None = None
    os_version: str | None = None
    serial_number: str | None = None
    imei: str | None = None
    fcm_token: str | None = None


class DeviceEnrollResponse(BaseModel):
    success: bool
    device_id: str
    message: str


class DeviceHeartbeat(BaseModel):
    device_id: str
    battery_level: int | None = None
    storage_free: int | None = None
    storage_total: int | None = None
    is_online: bool = True
    installed_apps: list[str] | None = None
    fcm_token: str | None = None


class DeviceLocationUpdate(BaseModel):
    device_id: str
    latitude: float
    longitude: float
