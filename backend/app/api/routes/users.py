from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_admin, get_password_hash
from app.models.user import User
from app.schemas.user import UserResponse, UserCreate, UserUpdate, PasswordChange
from app.services.audit import log_action

router = APIRouter(prefix="/users", tags=["Users"])

ALLOWED_ROLES = {"admin", "operator"}


@router.get("", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    email = payload.email.strip().lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    role = payload.role or "operator"
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Papel inválido. Use um de: {', '.join(sorted(ALLOWED_ROLES))}",
        )

    user = User(
        email=email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await log_action(
        db,
        actor=admin,
        action="user.create",
        target_type="user",
        target_id=user.id,
        details=f"Criou usuário {email} (papel: {role})",
        ip_address=http_request.client.host if http_request.client else None,
    )
    await db.flush()
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    is_self = user.email == admin["email"]
    changes = []

    if payload.email is not None:
        new_email = payload.email.strip().lower()
        if not new_email:
            raise HTTPException(status_code=400, detail="Email não pode ser vazio")
        if new_email != user.email:
            existing = await db.execute(
                select(User).where(User.email == new_email, User.id != user_id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Email já cadastrado")
            changes.append(f"email: {user.email} -> {new_email}")
            user.email = new_email

    if payload.full_name is not None:
        if payload.full_name != user.full_name:
            changes.append("nome alterado")
        user.full_name = payload.full_name

    if payload.role is not None:
        if payload.role not in ALLOWED_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Papel inválido. Use um de: {', '.join(sorted(ALLOWED_ROLES))}",
            )
        # Same idea as the "can't deactivate yourself" guard below: without this, an
        # admin editing their own account could accidentally demote themselves to
        # operator and lose the ability to undo it (or promote anyone else back).
        if is_self and payload.role != "admin":
            raise HTTPException(
                status_code=400, detail="Não é possível rebaixar a si mesmo"
            )
        if payload.role != user.role:
            changes.append(f"papel: {user.role} -> {payload.role}")
        user.role = payload.role

    if payload.is_active is not None:
        if is_self and payload.is_active is False:
            raise HTTPException(status_code=400, detail="Não é possível desativar a si mesmo")
        if payload.is_active != user.is_active:
            changes.append("ativado" if payload.is_active else "desativado")
        user.is_active = payload.is_active

    await db.flush()
    if changes:
        await log_action(
            db,
            actor=admin,
            action="user.update",
            target_type="user",
            target_id=user.id,
            details=f"Editou {user.email}: {'; '.join(changes)}",
            ip_address=http_request.client.host if http_request.client else None,
        )
        await db.flush()
    return user


@router.put("/{user_id}/password", response_model=UserResponse)
async def change_password(
    user_id: int,
    payload: PasswordChange,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.hashed_password = get_password_hash(payload.password)
    await db.flush()
    # Never log the password itself - only the fact that it changed.
    await log_action(
        db,
        actor=admin,
        action="user.password_change",
        target_type="user",
        target_id=user.id,
        details=f"Senha de {user.email} alterada",
        ip_address=http_request.client.host if http_request.client else None,
    )
    await db.flush()
    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.email == admin["email"]:
        raise HTTPException(status_code=400, detail="Não é possível excluir a si mesmo")
    deleted_email = user.email
    await db.delete(user)
    await log_action(
        db,
        actor=admin,
        action="user.delete",
        target_type="user",
        target_id=user_id,
        details=f"Excluiu usuário {deleted_email}",
        ip_address=http_request.client.host if http_request.client else None,
    )
    await db.flush()
    return {"message": "Usuário excluído"}
