from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text
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

    # Location
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_updated_at = Column(DateTime(timezone=True), nullable=True)

    # Enrollment
    enrollment_token = Column(String, unique=True, nullable=True)
    enrolled_at = Column(DateTime(timezone=True), nullable=True)

    # Kiosk mode
    kiosk_enabled = Column(Boolean, default=False)
    kiosk_apps = Column(Text, nullable=True)  # JSON array of package names
    kiosk_web_links = Column(Text, nullable=True)  # JSON array of {label, url}

    # FCM
    fcm_token = Column(String, nullable=True)

    # Metadata
    battery_level = Column(Integer, nullable=True)
    storage_free = Column(Integer, nullable=True)  # MB
    storage_total = Column(Integer, nullable=True)  # MB
    installed_apps = Column(Text, nullable=True)  # JSON array

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
