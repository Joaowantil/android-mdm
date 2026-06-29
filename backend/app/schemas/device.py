import json
from datetime import datetime, timezone

from pydantic import BaseModel, field_serializer, field_validator, model_validator

# A device is considered offline if its last heartbeat is older than this. The
# agent heartbeats every ~15s, so this tolerates a few missed beats.
ONLINE_THRESHOLD_SECONDS = 60


class DeviceCreate(BaseModel):
    name: str | None = None
    model: str | None = None
    manufacturer: str | None = None
    os_version: str | None = None
    serial_number: str | None = None
    imei: str | None = None


class KioskWebLink(BaseModel):
    label: str
    url: str


class DeviceUpdate(BaseModel):
    name: str | None = None
    kiosk_enabled: bool | None = None
    kiosk_apps: list[str] | None = None
    kiosk_web_links: list[KioskWebLink] | None = None
    kiosk_pin: str | None = None


class DeviceLockRequest(BaseModel):
    pin: str | None = None


class DeviceWipeRequest(BaseModel):
    confirm: str | None = None


def asset_id_from_pk(pk: int) -> str:
    """Human-friendly device identifier derived from the primary key."""
    return f"MDM-{pk:04d}"


class DeviceResponse(BaseModel):
    id: int
    device_id: str
    asset_id: str | None = None
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
    kiosk_apps: list[str] | None = None
    kiosk_web_links: list[KioskWebLink] | None = None
    battery_level: int | None
    storage_free: int | None
    storage_total: int | None
    enrolled_at: datetime | None
    created_at: datetime | None

    @field_validator("kiosk_apps", "kiosk_web_links", mode="before")
    @classmethod
    def _parse_json(cls, v):
        if isinstance(v, str):
            return json.loads(v) if v else None
        return v

    @field_serializer("last_seen", "enrolled_at", "created_at")
    def _serialize_utc(self, value: datetime | None):
        # SQLite returns naive datetimes; tag them as UTC so the browser
        # converts to the viewer's local timezone instead of treating UTC as
        # local (which made timestamps appear hours ahead).
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    @model_validator(mode="after")
    def _fill_asset_id(self):
        if self.asset_id is None and self.id is not None:
            self.asset_id = asset_id_from_pk(self.id)
        return self

    @model_validator(mode="after")
    def _compute_online(self):
        # Derive online status from the last heartbeat instead of trusting the
        # stored flag, which is never reset when a device goes dark.
        if self.last_seen is None:
            self.is_online = False
            return self
        last = self.last_seen
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        delta = (datetime.now(timezone.utc) - last).total_seconds()
        self.is_online = delta <= ONLINE_THRESHOLD_SECONDS
        return self

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
    asset_id: str | None = None
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
