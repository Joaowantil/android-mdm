from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class DeviceCommand(Base):
    __tablename__ = "device_commands"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    command_type = Column(String, nullable=False)  # lock, wipe, locate, install_app, uninstall_app, set_kiosk, apply_policy
    payload = Column(Text, nullable=True)  # JSON payload
    status = Column(String, default="pending")  # pending, sent, delivered, executed, failed
    result = Column(Text, nullable=True)  # JSON result from device
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    executed_at = Column(DateTime(timezone=True), nullable=True)
