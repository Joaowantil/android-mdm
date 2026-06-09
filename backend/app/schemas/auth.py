from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_email: str
    user_role: str


class TokenData(BaseModel):
    email: str | None = None
    role: str | None = None
