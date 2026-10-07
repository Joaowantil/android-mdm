import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # bcrypt's own hashpw/checkpw, not passlib's CryptContext wrapper around it.
    # passlib hasn't had a release since 2020 and breaks outright on bcrypt>=4.1 (a
    # known, unresolved compatibility bug) - this project only worked because bcrypt
    # was pinned to the exact old 4.0.1 release to dodge it, a landmine that any
    # future dependency bump could silently step on and break every login. Calling
    # bcrypt directly removes that whole failure class. The hash FORMAT bcrypt
    # produces is unchanged, so existing password hashes already in the database
    # keep working with no migration needed.
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def get_password_hash(password: str) -> str:
    # bcrypt only ever looks at the first 72 bytes of the input and raises ValueError
    # on anything longer, rather than silently truncating - so it's truncated
    # explicitly here to keep behavior predictable instead of the endpoint blowing up
    # on a long password.
    password_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> tuple[str, str]:
    """Returns (token, jti). The jti (JWT ID) is a random, unique identifier embedded
    in the token and mirrored in a Session row - it's what lets a specific login be
    revoked later without needing to change SECRET_KEY (which would log everyone out,
    not just one session)."""
    jti = secrets.token_urlsafe(16)
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "jti": jti})
    token = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, jti


def decode_token(token: str) -> dict:
    try:
        # algorithms is a list with a single, explicit entry on purpose: this is what
        # stops an "alg=none" or algorithm-confusion token from being accepted - the
        # library is told exactly which one algorithm is valid, nothing else.
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    payload = decode_token(token)
    email = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    # The token's own "role" claim is NOT trusted on its own: without this DB check, a
    # user deactivated or deleted mid-session (e.g. an admin offboarding a departing
    # employee) would keep working with their old access for up to
    # ACCESS_TOKEN_EXPIRE_MINUTES, since a JWT can't be "un-issued" once handed out.
    # This adds one query per request to close that gap - acceptable for this scale of
    # deployment (SQLite, single instance).
    from app.models.user import User  # local import: avoids a circular import with database.py

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session no longer valid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Same idea, for one specific login rather than the whole account: if this
    # token's session was force-revoked (stolen laptop, admin cleaning up old
    # sessions), reject it immediately instead of honoring it until it expires.
    # Tokens issued before this feature existed have no "jti" claim at all - those
    # are let through unchecked (same graceful-degradation approach used for
    # device_secret on older enrollments) rather than being broken by the upgrade.
    jti = payload.get("jti")
    if jti:
        from app.models.session import Session as SessionModel

        session_result = await db.execute(
            select(SessionModel).where(SessionModel.jti == jti)
        )
        session = session_result.scalar_one_or_none()
        if session is not None and session.revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if session is not None:
            session.last_seen_at = datetime.now(timezone.utc)
            await db.flush()

    return {"email": user.email, "role": user.role}


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
