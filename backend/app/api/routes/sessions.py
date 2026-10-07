from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_admin, decode_token
from app.models.session import Session as SessionModel
from app.models.user import User
from app.schemas.session import SessionResponse
from app.services.audit import log_action

router = APIRouter(prefix="/sessions", tags=["Sessions"])

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


@router.get("", response_model=list[SessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
    token: str | None = Depends(_oauth2_scheme),
):
    """All currently-active (non-revoked) sessions across every user - admin-only,
    since seeing who else is logged in is exactly the oversight an admin needs
    after, say, a stolen laptop or an account compromise."""
    current_jti = None
    if token:
        current_jti = decode_token(token).get("jti")

    result = await db.execute(
        select(SessionModel, User.email)
        .join(User, User.id == SessionModel.user_id)
        .where(SessionModel.revoked == False)  # noqa: E712
        .order_by(SessionModel.last_seen_at.desc())
    )
    rows = result.all()
    return [
        SessionResponse(
            id=session.id,
            user_id=session.user_id,
            user_email=email,
            created_at=session.created_at,
            last_seen_at=session.last_seen_at,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
            is_current=(session.jti == current_jti),
        )
        for session, email in rows
    ]


@router.delete("/{session_id}")
async def revoke_session(
    session_id: int,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    result = await db.execute(select(SessionModel).where(SessionModel.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.revoked:
        return {"message": "Session already revoked"}

    user_result = await db.execute(select(User).where(User.id == session.user_id))
    target_user = user_result.scalar_one_or_none()

    session.revoked = True
    session.revoked_at = datetime.now(timezone.utc)
    await db.flush()
    await log_action(
        db,
        actor=admin,
        action="session.revoke",
        target_type="session",
        target_id=session_id,
        details=f"Revogou sessão de {target_user.email if target_user else session.user_id}",
        ip_address=http_request.client.host if http_request.client else None,
    )
    await db.flush()
    return {"message": "Session revoked"}
