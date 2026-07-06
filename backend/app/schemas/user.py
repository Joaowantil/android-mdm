from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str | None = None
    role: str
    is_active: bool
    created_at: datetime | None = None


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str | None = None
    role: str = "operator"


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class PasswordChange(BaseModel):
    password: str
