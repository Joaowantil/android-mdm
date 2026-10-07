from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_email: str | None = None
    created_at: datetime | None = None
    last_seen_at: datetime | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    is_current: bool = False
