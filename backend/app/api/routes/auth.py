from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, get_current_user, decode_token
from app.core.rate_limit import check_rate_limit, record_failure, reset
from app.models.user import User
from app.models.session import Session as SessionModel
from app.schemas.auth import LoginRequest, LoginResponse
from app.services.audit import log_action

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, http_request: Request, db: AsyncSession = Depends(get_db)):
    # Must match the exact normalization create_user() applies (email.strip().lower())
    # - without this, an email saved as "joao@empresa.com" (lowercased on creation)
    # never matches a case-sensitive lookup for "Joao@empresa.com" typed at login,
    # even with the correct password. SQLite string comparison is case-sensitive by
    # default, so this was a real, silent lockout for any email not typed in the
    # exact casing it happened to be created with.
    email = request.email.strip().lower()
    client_ip = http_request.client.host if http_request.client else "unknown"

    # Keyed by IP + email: one bad actor guessing many emails from one IP is capped,
    # and repeated bad guesses against a single account are capped even from
    # different IPs wouldn't be - this is deliberately the simple, cheap version.
    rate_key = f"login:{client_ip}:{email}"
    check_rate_limit(rate_key)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.hashed_password):
        record_failure(rate_key)
        await log_action(
            db,
            actor=None,
            action="auth.login_failed",
            target_type="user",
            details=f"Tentativa de login falhou para {email}",
            ip_address=client_ip,
        )
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        await log_action(
            db,
            actor={"email": user.email, "role": user.role},
            action="auth.login_blocked",
            target_type="user",
            target_id=user.id,
            details="Login recusado: conta desativada",
            ip_address=client_ip,
        )
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    reset(rate_key)
    token, jti = create_access_token(data={"sub": user.email, "role": user.role})
    db.add(SessionModel(
        user_id=user.id,
        jti=jti,
        ip_address=client_ip,
        user_agent=http_request.headers.get("user-agent"),
    ))
    await log_action(
        db,
        actor={"email": user.email, "role": user.role},
        action="auth.login",
        target_type="user",
        target_id=user.id,
        details=f"Login bem-sucedido de {user.email}",
        ip_address=client_ip,
    )
    await db.flush()
    return LoginResponse(
        access_token=token,
        user_email=user.email,
        user_role=user.role,
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


@router.post("/logout")
async def logout(
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(_oauth2_scheme),
    _current_user: dict = Depends(get_current_user),
):
    """Revokes the session behind the token used to call this - a clean logout
    doesn't just forget the token client-side, it also closes the door on the
    server so the same token can't keep working if it leaked (browser history,
    a proxy log) before it would have naturally expired."""
    if not token:
        return {"message": "Logged out"}
    payload = decode_token(token)
    jti = payload.get("jti")
    if jti:
        result = await db.execute(select(SessionModel).where(SessionModel.jti == jti))
        session = result.scalar_one_or_none()
        if session and not session.revoked:
            from datetime import datetime, timezone
            session.revoked = True
            session.revoked_at = datetime.now(timezone.utc)
            await db.flush()
    return {"message": "Logged out"}
