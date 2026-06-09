from datetime import datetime

from pydantic import BaseModel


class CommandCreate(BaseModel):
    command_type: str  # lock, wipe, locate, install_app, uninstall_app, set_kiosk, apply_policy
    payload: dict | None = None


class CommandResponse(BaseModel):
    id: int
    device_id: int
    command_type: str
    payload: str | None
    status: str
    result: str | None
    created_at: datetime | None
    executed_at: datetime | None

    class Config:
        from_attributes = True
