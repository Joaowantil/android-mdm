import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.policy import Policy, PolicyAssignment
from app.models.device import Device
from app.models.command import DeviceCommand
from app.schemas.policy import (
    PolicyCreate,
    PolicyUpdate,
    PolicyResponse,
    PolicyAssignRequest,
)


def _policy_to_response(policy: Policy) -> PolicyResponse:
    """Convert a Policy ORM object to a PolicyResponse, parsing JSON fields."""
    return PolicyResponse(
        id=policy.id,
        name=policy.name,
        description=policy.description,
        policy_type=policy.policy_type,
        app_list=json.loads(policy.app_list) if policy.app_list else None,
        kiosk_enabled=policy.kiosk_enabled,
        kiosk_apps=json.loads(policy.kiosk_apps) if policy.kiosk_apps else None,
        camera_disabled=policy.camera_disabled,
        screenshot_disabled=policy.screenshot_disabled,
        usb_disabled=policy.usb_disabled,
        wifi_config_disabled=policy.wifi_config_disabled,
        bluetooth_disabled=policy.bluetooth_disabled,
        install_apps_disabled=policy.install_apps_disabled,
        uninstall_apps_disabled=policy.uninstall_apps_disabled,
        factory_reset_disabled=policy.factory_reset_disabled,
        is_active=policy.is_active,
        created_at=policy.created_at,
    )

router = APIRouter(prefix="/policies", tags=["Policies"])


@router.get("", response_model=list[PolicyResponse])
async def list_policies(
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Policy).order_by(Policy.created_at.desc()))
    policies = result.scalars().all()
    return [_policy_to_response(p) for p in policies]


@router.post("", response_model=PolicyResponse)
async def create_policy(
    policy: PolicyCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    db_policy = Policy(
        name=policy.name,
        description=policy.description,
        policy_type=policy.policy_type,
        app_list=json.dumps(policy.app_list) if policy.app_list else None,
        kiosk_enabled=policy.kiosk_enabled,
        kiosk_apps=json.dumps(policy.kiosk_apps) if policy.kiosk_apps else None,
        camera_disabled=policy.camera_disabled,
        screenshot_disabled=policy.screenshot_disabled,
        usb_disabled=policy.usb_disabled,
        wifi_config_disabled=policy.wifi_config_disabled,
        bluetooth_disabled=policy.bluetooth_disabled,
        install_apps_disabled=policy.install_apps_disabled,
        uninstall_apps_disabled=policy.uninstall_apps_disabled,
        factory_reset_disabled=policy.factory_reset_disabled,
    )
    db.add(db_policy)
    await db.flush()
    await db.refresh(db_policy)
    return _policy_to_response(db_policy)


@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return _policy_to_response(policy)


@router.put("/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: int,
    update: PolicyUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key in ("app_list", "kiosk_apps") and value is not None:
            setattr(policy, key, json.dumps(value))
        else:
            setattr(policy, key, value)

    await db.flush()
    await db.refresh(policy)
    return _policy_to_response(policy)


@router.delete("/{policy_id}")
async def delete_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    await db.delete(policy)
    return {"message": "Policy deleted"}


@router.post("/{policy_id}/assign")
async def assign_policy(
    policy_id: int,
    request: PolicyAssignRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    assigned_count = 0
    for dev_id in request.device_ids:
        # Check device exists
        dev_result = await db.execute(select(Device).where(Device.id == dev_id))
        device = dev_result.scalar_one_or_none()
        if not device:
            continue

        assignment = PolicyAssignment(policy_id=policy_id, device_id=dev_id)
        db.add(assignment)

        kiosk_apps = json.loads(policy.kiosk_apps) if policy.kiosk_apps else []
        is_kiosk = policy.policy_type == "kiosk" or policy.kiosk_enabled

        # Kiosk policies reuse the proven set_kiosk command so they apply even on
        # agents that predate the apply_policy kiosk support, and we mirror the
        # state onto the device so the dashboard reflects it.
        if is_kiosk:
            device.kiosk_enabled = True
            device.kiosk_apps = json.dumps(kiosk_apps)
            db.add(DeviceCommand(
                device_id=dev_id,
                command_type="set_kiosk",
                payload=json.dumps({
                    "enabled": True,
                    "apps": kiosk_apps,
                    "web_links": [],
                }),
                status="pending",
            ))

        has_restrictions = any([
            policy.camera_disabled,
            policy.screenshot_disabled,
            policy.usb_disabled,
            policy.install_apps_disabled,
            policy.uninstall_apps_disabled,
            policy.factory_reset_disabled,
        ])

        # Restrictions (and non-kiosk policies) still go through apply_policy.
        if has_restrictions or not is_kiosk:
            db.add(DeviceCommand(
                device_id=dev_id,
                command_type="apply_policy",
                payload=json.dumps({
                    "policy_id": policy_id,
                    "policy_type": policy.policy_type,
                    "app_list": json.loads(policy.app_list) if policy.app_list else [],
                    "kiosk_enabled": policy.kiosk_enabled,
                    "kiosk_apps": kiosk_apps,
                    "restrictions": {
                        "camera_disabled": policy.camera_disabled,
                        "screenshot_disabled": policy.screenshot_disabled,
                        "usb_disabled": policy.usb_disabled,
                        "install_apps_disabled": policy.install_apps_disabled,
                        "uninstall_apps_disabled": policy.uninstall_apps_disabled,
                        "factory_reset_disabled": policy.factory_reset_disabled,
                    },
                }),
                status="pending",
            ))
        assigned_count += 1

    await db.flush()
    return {"message": f"Policy assigned to {assigned_count} device(s)"}
