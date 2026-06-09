from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    policy_type = Column(String, nullable=False)  # app_allowlist, app_blocklist, kiosk, restrictions

    # App policies
    app_list = Column(Text, nullable=True)  # JSON array of package names

    # Kiosk settings
    kiosk_enabled = Column(Boolean, default=False)
    kiosk_apps = Column(Text, nullable=True)  # JSON of allowed apps in kiosk

    # Restrictions
    camera_disabled = Column(Boolean, default=False)
    screenshot_disabled = Column(Boolean, default=False)
    usb_disabled = Column(Boolean, default=False)
    wifi_config_disabled = Column(Boolean, default=False)
    bluetooth_disabled = Column(Boolean, default=False)
    install_apps_disabled = Column(Boolean, default=False)
    uninstall_apps_disabled = Column(Boolean, default=False)
    factory_reset_disabled = Column(Boolean, default=False)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PolicyAssignment(Base):
    __tablename__ = "policy_assignments"

    id = Column(Integer, primary_key=True, index=True)
    policy_id = Column(Integer, ForeignKey("policies.id"), nullable=False)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
