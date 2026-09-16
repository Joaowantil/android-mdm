from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    model = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    os_version = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    imei = Column(String, nullable=True)

    # Status
    status = Column(String, default="pending")  # pending, enrolled, active, locked, wiped
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    wifi_ssid = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)

    # Grouping (e.g. operation the device belongs to)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)

    # Location
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_address = Column(String, nullable=True)
    location_updated_at = Column(DateTime(timezone=True), nullable=True)

    # Enrollment
    enrollment_token = Column(String, unique=True, nullable=True)
    enrolled_at = Column(DateTime(timezone=True), nullable=True)
    # Per-device credential issued at enrollment, required on every heartbeat/ack/location
    # call afterwards. Kept separate from device_id, which is client-chosen and travels in
    # every request unencrypted - device_id identifies the device, device_secret proves it.
    # Nullable for devices enrolled before this field existed (see devices.py for the
    # backward-compatible handling during migration).
    device_secret = Column(String, nullable=True)

    # Kiosk mode
    kiosk_enabled = Column(Boolean, default=False)
    kiosk_apps = Column(Text, nullable=True)  # JSON array of package names
    kiosk_web_links = Column(Text, nullable=True)  # JSON array of {label, url}
    kiosk_pin = Column(String, nullable=True)  # PIN the operator types to leave the kiosk

    # FCM
    fcm_token = Column(String, nullable=True)

    # Metadata
    battery_level = Column(Integer, nullable=True)
    storage_free = Column(Integer, nullable=True)  # MB
    storage_total = Column(Integer, nullable=True)  # MB
    installed_apps = Column(Text, nullable=True)  # JSON array

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
