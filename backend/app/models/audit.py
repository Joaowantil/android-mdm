from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func

from app.core.database import Base


class AuditLog(Base):
    """
    Records who did what to which resource, and when. Without this, there is no
    way to answer basic accountability questions for an MDM with destructive
    capability (wipe, lock, reboot, user/policy management) - "who wiped this
    device?", "who deleted that user?", "when did this policy change?". Rows are
    never updated or deleted by the app itself; this table is meant to be
    append-only.
    """

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    actor_email = Column(String, nullable=True, index=True)  # null for unauthenticated/device actions
    actor_role = Column(String, nullable=True)
    action = Column(String, nullable=False, index=True)  # e.g. "device.wipe", "user.delete"
    target_type = Column(String, nullable=True, index=True)  # "device", "user", "policy", "group"
    target_id = Column(String, nullable=True)  # stored as string: ids and device_id (str) both fit
    details = Column(Text, nullable=True)  # short human-readable summary, not full payload dumps
    ip_address = Column(String, nullable=True)
