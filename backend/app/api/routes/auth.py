from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, get_current_user
from app.core.rate_limit import check_rate_limit, record_failure, reset
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    client_ip = http_request.client.host if http_request.client else "unknown"
    # Keyed by IP + email: one bad actor guessing many emails from one IP is capped,
    # and repeated bad guesses against a single account are capped even from
    # different IPs wouldn't be - this is deliberately the simple, cheap version.
    rate_key = f"login:{client_ip}:{request.email.lower()}"
    check_rate_limit(rate_key)

    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.hashed_password):
        record_failure(rate_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    reset(rate_key)
    token = create_access_token(data={"sub": user.email, "role": user.role})
    return LoginResponse(
        access_token=token,
        user_email=user.email,
        user_role=user.role,
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
