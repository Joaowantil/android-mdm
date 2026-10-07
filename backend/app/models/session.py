from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class Session(Base):
    """
    One row per issued login token. Lets an admin see who is currently logged in
    and force-revoke a specific session (e.g. a stolen laptop, someone who left
    the company) without waiting for the JWT to expire on its own - a plain JWT
    has no way to be "un-issued" once handed out, so this table is what makes
    revocation possible at all.
    """

    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    jti = Column(String, unique=True, nullable=False, index=True)  # matches the JWT's "jti" claim
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now())
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    revoked = Column(Boolean, default=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
