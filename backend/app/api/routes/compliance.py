import json

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.device import Device
from app.models.policy import Policy, PolicyAssignment
from app.schemas.compliance import BlocklistViolation

router = APIRouter(prefix="/compliance", tags=["Compliance"])


@router.get("/blocklist-violations", response_model=list[BlocklistViolation])
async def blocklist_violations(
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    """Devices that have an app_blocklist policy assigned AND currently report at
    least one of that policy's blocked packages as installed (from the device's own
    last heartbeat). This only checks blocklist policies, not allowlist: the
    heartbeat's installed_apps includes ~300 system-level packages per device (the
    agent needs all of them for allowlist/blocklist enforcement itself), so comparing
    against an allowlist here would flood this report with false positives. A
    blocklist check doesn't have that problem - it only ever looks for a handful of
    specific, named packages, so noise isn't a factor. A true allowlist compliance
    view would need the agent to report only launchable (icon-having) apps instead
    of everything installed - the same fix already applied to the allowlist
    enforcement itself.
    """
    result = await db.execute(
        select(Device, Policy)
        .join(PolicyAssignment, PolicyAssignment.device_id == Device.id)
        .join(Policy, Policy.id == PolicyAssignment.policy_id)
        .where(Policy.policy_type == "app_blocklist")
    )

    violations: list[BlocklistViolation] = []
    for device, policy in result.all():
        if not device.installed_apps or not policy.app_list:
            continue
        installed = set(json.loads(device.installed_apps))
        blocked = set(json.loads(policy.app_list))
        found = sorted(installed & blocked)
        if found:
            violations.append(
                BlocklistViolation(
                    device_pk=device.id,
                    device_id=device.device_id,
                    device_name=device.name,
                    policy_id=policy.id,
                    policy_name=policy.name,
                    violating_apps=found,
                )
            )
    return violations
