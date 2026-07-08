from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.group import Group
from app.models.device import Device
from app.schemas.group import GroupCreate, GroupUpdate, GroupResponse

router = APIRouter(prefix="/groups", tags=["Groups"])


async def _counts(db: AsyncSession) -> dict[int, int]:
    result = await db.execute(
        select(Device.group_id, func.count(Device.id))
        .where(Device.group_id.isnot(None))
        .group_by(Device.group_id)
    )
    return {row[0]: row[1] for row in result.all()}


@router.get("", response_model=list[GroupResponse])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Group).order_by(Group.name))
    groups = result.scalars().all()
    counts = await _counts(db)
    return [
        GroupResponse(
            id=g.id,
            name=g.name,
            device_count=counts.get(g.id, 0),
            created_at=g.created_at,
        )
        for g in groups
    ]


@router.post("", response_model=GroupResponse)
async def create_group(
    group: GroupCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    name = group.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")
    existing = await db.execute(select(Group).where(Group.name == name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Group already exists")
    db_group = Group(name=name)
    db.add(db_group)
    await db.flush()
    await db.refresh(db_group)
    return GroupResponse(id=db_group.id, name=db_group.name, device_count=0,
                         created_at=db_group.created_at)


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    update: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    name = update.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")
    group.name = name
    await db.flush()
    counts = await _counts(db)
    return GroupResponse(id=group.id, name=group.name,
                         device_count=counts.get(group.id, 0),
                         created_at=group.created_at)


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    # Detach devices from the group being removed.
    devs = await db.execute(select(Device).where(Device.group_id == group_id))
    for dev in devs.scalars().all():
        dev.group_id = None
    await db.delete(group)
    return {"message": "Group deleted"}
