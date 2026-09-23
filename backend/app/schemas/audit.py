from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None = None
    actor_email: str | None = None
    actor_role: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    details: str | None = None
    ip_address: str | None = None
