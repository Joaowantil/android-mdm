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
        kiosk_web_links=(
            json.loads(policy.kiosk_web_links) if policy.kiosk_web_links else None
        ),
        kiosk_pin=policy.kiosk_pin,
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


async def _push_kiosk_to_assigned(db: AsyncSession, policy: Policy) -> None:
    """Re-send the kiosk config (including the exit PIN) to the assigned devices.

    Editing a policy has to reach the devices already in that operation, not only
    the ones assigned afterwards.
    """
    result = await db.execute(
        select(PolicyAssignment.device_id).where(
            PolicyAssignment.policy_id == policy.id
        )
    )
    kiosk_apps = json.loads(policy.kiosk_apps) if policy.kiosk_apps else []
    web_links = json.loads(policy.kiosk_web_links) if policy.kiosk_web_links else []
    for (dev_id,) in result.all():
        dev_result = await db.execute(select(Device).where(Device.id == dev_id))
        device = dev_result.scalar_one_or_none()
        if not device:
            continue
        device.kiosk_enabled = True
        device.kiosk_apps = json.dumps(kiosk_apps)
        device.kiosk_web_links = json.dumps(web_links) if web_links else None
        if policy.kiosk_pin:
            device.kiosk_pin = policy.kiosk_pin
        payload = {"enabled": True, "apps": kiosk_apps, "web_links": web_links}
        if device.kiosk_pin:
            payload["pin"] = device.kiosk_pin
        db.add(DeviceCommand(
            device_id=dev_id,
            command_type="set_kiosk",
            payload=json.dumps(payload),
            status="pending",
        ))


async def _push_app_policy_to_assigned(db: AsyncSession, policy: Policy) -> None:
    """Re-send an app_allowlist/app_blocklist config to the devices already assigned.

    Mirrors _push_kiosk_to_assigned: editing a policy (e.g. adding one more app
    to the list) has to reach devices already in that assignment, not only
    devices assigned afterwards. Without this, apply_policy is only ever sent
    once, at assignment time, and any later edit needs an unassign/reassign to
    actually reach the device.
    """
    result = await db.execute(
        select(PolicyAssignment.device_id).where(
            PolicyAssignment.policy_id == policy.id
        )
    )
    app_list = json.loads(policy.app_list) if policy.app_list else []
    for (dev_id,) in result.all():
        db.add(DeviceCommand(
            device_id=dev_id,
            command_type="apply_policy",
            payload=json.dumps({
                "policy_type": policy.policy_type,
                "app_list": app_list,
                "restrictions": {},
            }),
            status="pending",
        ))


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
        kiosk_web_links=(
            json.dumps([link.model_dump() for link in policy.kiosk_web_links])
            if policy.kiosk_web_links
            else None
        ),
        kiosk_pin=(policy.kiosk_pin or "").strip() or None,
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
        if key in ("app_list", "kiosk_apps", "kiosk_web_links") and value is not None:
            setattr(policy, key, json.dumps(value))
        elif key == "kiosk_pin":
            policy.kiosk_pin = (value or "").strip() or None
        else:
            setattr(policy, key, value)

    await db.flush()
    if policy.policy_type == "kiosk" or policy.kiosk_enabled:
        await _push_kiosk_to_assigned(db, policy)
    elif policy.policy_type in ("app_allowlist", "app_blocklist"):
        await _push_app_policy_to_assigned(db, policy)
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

    # Deleting a policy must tear down whatever it applied on-device, the same
    # way unassigning a device from it does - otherwise devices are left
    # locked/blocked forever with no policy left to point at.
    is_kiosk = policy.policy_type == "kiosk" or policy.kiosk_enabled
    is_app_list_policy = policy.policy_type in ("app_allowlist", "app_blocklist")

    assigned = await db.execute(
        select(PolicyAssignment).where(PolicyAssignment.policy_id == policy_id)
    )
    assignment_rows = assigned.scalars().all()
    for row in assignment_rows:
        dev_id = row.device_id
        if is_kiosk:
            dev_result = await db.execute(select(Device).where(Device.id == dev_id))
            device = dev_result.scalar_one_or_none()
            if device:
                device.kiosk_enabled = False
                device.kiosk_apps = None
                device.kiosk_web_links = None
            db.add(DeviceCommand(
                device_id=dev_id,
                command_type="set_kiosk",
                payload=json.dumps({"enabled": False, "apps": [], "web_links": []}),
                status="pending",
            ))
        if is_app_list_policy:
            db.add(DeviceCommand(
                device_id=dev_id,
                command_type="apply_policy",
                payload=json.dumps({
                    "policy_type": "app_clear",
                    "app_list": [],
                    "restrictions": {},
                }),
                status="pending",
            ))
        await db.delete(row)

    await db.delete(policy)
    await db.flush()
    return {"message": "Policy deleted"}


@router.get("/{policy_id}/assignments")
async def get_policy_assignments(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PolicyAssignment.device_id).where(
            PolicyAssignment.policy_id == policy_id
        )
    )
    return {"device_ids": [row[0] for row in result.all()]}


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

    # Replace the assignment set so the dashboard checkboxes reflect exactly the
    # selected devices (unchecking a device removes its assignment).
    existing = await db.execute(
        select(PolicyAssignment).where(PolicyAssignment.policy_id == policy_id)
    )
    previous_device_ids = set()
    for old in existing.scalars().all():
        previous_device_ids.add(old.device_id)
        await db.delete(old)

    is_kiosk = policy.policy_type == "kiosk" or policy.kiosk_enabled
    is_app_list_policy = policy.policy_type in ("app_allowlist", "app_blocklist")

    # Devices removed from a kiosk policy must have the kiosk torn down so the
    # dashboard "reset" actually reaches the device (apps/sites cleared).
    removed_device_ids = previous_device_ids - set(request.device_ids)
    for dev_id in removed_device_ids:
        dev_result = await db.execute(select(Device).where(Device.id == dev_id))
        device = dev_result.scalar_one_or_none()
        if not device:
            continue
        if is_kiosk:
            device.kiosk_enabled = False
            device.kiosk_apps = None
            device.kiosk_web_links = None
            db.add(DeviceCommand(
                device_id=dev_id,
                command_type="set_kiosk",
                payload=json.dumps({
                    "enabled": False,
                    "apps": [],
                    "web_links": [],
                }),
                status="pending",
            ))
        # Devices removed from an allowlist/blocklist must have their suspended apps
        # released, otherwise they'd stay blocked forever with no policy attached.
        if is_app_list_policy:
            db.add(DeviceCommand(
                device_id=dev_id,
                command_type="apply_policy",
                payload=json.dumps({
                    "policy_type": "app_clear",
                    "app_list": [],
                    "restrictions": {},
                }),
                status="pending",
            ))

    # A device having two app-list-type policies (allowlist + blocklist, or two
    # blocklists) at once is what caused "allowlist doesn't work": whichever
    # policy's apply_policy command reaches the device last silently overwrites
    # the other's effect (the agent only tracks one mode/list at a time). So
    # assigning a device to an app_allowlist/app_blocklist policy here always
    # unassigns it from any OTHER policy of that same policy family first.
    if is_app_list_policy and request.device_ids:
        other_assignments = await db.execute(
            select(PolicyAssignment, Policy.policy_type)
            .join(Policy, Policy.id == PolicyAssignment.policy_id)
            .where(
                PolicyAssignment.device_id.in_(request.device_ids),
                PolicyAssignment.policy_id != policy_id,
                Policy.policy_type.in_(("app_allowlist", "app_blocklist")),
            )
        )
        for assignment_row, _other_type in other_assignments.all():
            await db.delete(assignment_row)

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

        # Kiosk policies reuse the proven set_kiosk command so they apply even on
        # agents that predate the apply_policy kiosk support, and we mirror the
        # state onto the device so the dashboard reflects it.
        if is_kiosk:
            web_links = (
                json.loads(policy.kiosk_web_links) if policy.kiosk_web_links else []
            )
            device.kiosk_enabled = True
            device.kiosk_apps = json.dumps(kiosk_apps)
            device.kiosk_web_links = json.dumps(web_links) if web_links else None
            # The exit PIN travels with the policy so every device in the same
            # operation shares it; a device-specific PIN stays put if the policy
            # does not define one.
            if policy.kiosk_pin:
                device.kiosk_pin = policy.kiosk_pin
            payload = {
                "enabled": True,
                "apps": kiosk_apps,
                "web_links": web_links,
            }
            if device.kiosk_pin:
                payload["pin"] = device.kiosk_pin
            db.add(DeviceCommand(
                device_id=dev_id,
                command_type="set_kiosk",
                payload=json.dumps(payload),
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
