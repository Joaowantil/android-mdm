from datetime import datetime

from pydantic import BaseModel


class GroupCreate(BaseModel):
    name: str


class GroupUpdate(BaseModel):
    name: str


class GroupResponse(BaseModel):
    id: int
    name: str
    device_count: int = 0
    created_at: datetime | None = None

    class Config:
        from_attributes = True
