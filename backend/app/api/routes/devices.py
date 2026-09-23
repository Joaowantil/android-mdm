import json
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.device import Device
from app.models.command import DeviceCommand
from app.models.group import Group
from app.services.audit import log_action
from app.schemas.device import (
    ONLINE_THRESHOLD_SECONDS,
    DeviceResponse,
    DeviceUpdate,
    DeviceEnrollRequest,
    DeviceEnrollResponse,
    DeviceHeartbeat,
    DeviceLocationUpdate,
    DeviceLockRequest,
    asset_id_from_pk,
)
from app.schemas.command import CommandAck, CommandCreate, CommandResponse
from app.services.geocode import reverse_geocode

router = APIRouter(prefix="/devices", tags=["Devices"])


def _verify_device_secret(device: Device, provided_secret: str | None) -> None:
    """Rejects a device-facing request that doesn't prove it's the enrolled device.

    device.device_secret is None for devices enrolled before this check existed -
    those are let through once (logged) so an existing fleet isn't locked out mid-air;
    they become fully protected the next time they re-enroll. Any device that DOES have
    a secret on file must present the exact matching value, compared in constant time to
    avoid a timing side-channel.
    """
    if device.device_secret is None:
        logging.getLogger("app.security").warning(
            "Device %s has no device_secret on file (enrolled before device auth was "
            "added) - accepting without verification. Re-enroll to close this gap.",
            device.device_id,
        )
        return
    if not provided_secret or not secrets.compare_digest(provided_secret, device.device_secret):
        raise HTTPException(status_code=401, detail="Invalid device credentials")


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Device).order_by(Device.created_at.desc()))
    devices = result.scalars().all()
    return devices


@router.get("/enrollment-token")
async def generate_enrollment_token(
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    token = secrets.token_urlsafe(32)
    device = Device(
        device_id=f"pending-{secrets.token_hex(8)}",
        enrollment_token=token,
        status="pending",
    )
    db.add(device)
    await db.flush()
    return {"enrollment_token": token, "device_id": device.device_id, "id": device.id}


@router.post("/enroll", response_model=DeviceEnrollResponse)
async def enroll_device(
    request: DeviceEnrollRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Device).where(Device.enrollment_token == request.enrollment_token)
    )
    device = result.scalar_one_or_none()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid enrollment token",
        )

    if device.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Device already enrolled",
        )

    # An enrollment QR code/link has no natural expiry otherwise - if one is ever
    # exposed (a photo of a poster, an old email, a screenshot) it would stay valid
    # forever, letting an unauthorized device enroll into the fleet months later.
    ENROLLMENT_TOKEN_TTL = timedelta(hours=24)
    created_at = device.created_at
    if created_at.tzinfo is None:
        # SQLite hands back naive datetimes even for a DateTime(timezone=True)
        # column - same pattern already used for last_seen/enrolled_at elsewhere.
        created_at = created_at.replace(tzinfo=timezone.utc)
    token_age = datetime.now(timezone.utc) - created_at
    if token_age > ENROLLMENT_TOKEN_TTL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enrollment token expired - generate a new one",
        )

    device.device_id = request.device_id
    device.model = request.model
    device.manufacturer = request.manufacturer
    device.os_version = request.os_version
    device.serial_number = request.serial_number
    device.imei = request.imei
    device.fcm_token = request.fcm_token
    device.status = "enrolled"
    device.enrolled_at = datetime.now(timezone.utc)
    device.is_online = True
    device.last_seen = datetime.now(timezone.utc)
    device.device_secret = secrets.token_urlsafe(32)

    await db.flush()
    return DeviceEnrollResponse(
        success=True,
        device_id=device.device_id,
        asset_id=asset_id_from_pk(device.id),
        message="Device enrolled successfully",
        device_secret=device.device_secret,
    )


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.put("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: int,
    update: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if update.name is not None:
        device.name = update.name

    # group_id is settable to a value or explicitly to null (remove from group).
    if "group_id" in update.model_fields_set:
        device.group_id = update.group_id

    kiosk_changed = False
    # The PIN is kept on the device record so the dashboard can show the one in
    # force (operators forget it) and so re-enabling the kiosk resends it.
    if update.kiosk_pin is not None:
        device.kiosk_pin = update.kiosk_pin.strip() or None
        kiosk_changed = True
    if update.kiosk_apps is not None:
        device.kiosk_apps = json.dumps(update.kiosk_apps)
        kiosk_changed = True
    if update.kiosk_web_links is not None:
        device.kiosk_web_links = json.dumps(
            [link.model_dump() for link in update.kiosk_web_links]
        )
        kiosk_changed = True
    if update.kiosk_enabled is not None:
        device.kiosk_enabled = update.kiosk_enabled
        kiosk_changed = True

    # Push a kiosk command so the agent actually enters/exits kiosk mode.
    if kiosk_changed:
        apps = json.loads(device.kiosk_apps) if device.kiosk_apps else []
        web_links = json.loads(device.kiosk_web_links) if device.kiosk_web_links else []
        payload = {
            "enabled": device.kiosk_enabled,
            "apps": apps,
            "web_links": web_links,
        }
        if device.kiosk_pin:
            payload["pin"] = device.kiosk_pin
        command = DeviceCommand(
            device_id=device_id,
            command_type="set_kiosk",
            payload=json.dumps(payload),
            status="pending",
        )
        db.add(command)

    await db.flush()
    return device


@router.delete("/{device_id}")
async def delete_device(
    device_id: int,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    online = False
    if device.last_seen is not None:
        last = device.last_seen
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        online = (datetime.now(timezone.utc) - last).total_seconds() <= ONLINE_THRESHOLD_SECONDS

    # When the device is reachable, ask it to unbind itself (leave kiosk, drop
    # Device Owner/admin) so it becomes usable again. The record is only removed
    # once the agent acknowledges the release command (see ack_command). If the
    # device is offline or the caller forces it, just drop the record.
    if online and not force:
        db.add(
            DeviceCommand(
                device_id=device.id,
                command_type="release",
                status="pending",
            )
        )
        device.status = "releasing"
        await db.flush()
        return {"message": "Release requested", "pending": True}

    await db.delete(device)
    return {"message": "Device deleted", "pending": False}


@router.post("/{device_id}/lock", response_model=CommandResponse)
async def lock_device(
    device_id: int,
    http_request: Request,
    lock: DeviceLockRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    pin = lock.pin if lock else None
    command = DeviceCommand(
        device_id=device_id,
        command_type="lock",
        payload=json.dumps({"pin": pin}) if pin else None,
        status="pending",
    )
    db.add(command)
    device.status = "locked"
    await db.flush()
    await log_action(
        db,
        actor=current_user,
        action="device.lock",
        target_type="device",
        target_id=device.device_id,
        details=f"Bloqueou o device {device.device_id}",
        ip_address=http_request.client.host if http_request.client else None,
    )
    await db.flush()
    return command


@router.post("/{device_id}/wipe", response_model=CommandResponse)
async def wipe_device(
    device_id: int,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    command = DeviceCommand(
        device_id=device_id,
        command_type="wipe",
        status="pending",
    )
    db.add(command)
    device.status = "wiped"
    await db.flush()
    await log_action(
        db,
        actor=current_user,
        action="device.wipe",
        target_type="device",
        target_id=device.device_id,
        details=f"Apagou (wipe) o device {device.device_id} (model: {device.model})",
        ip_address=http_request.client.host if http_request.client else None,
    )
    await db.flush()
    return command


@router.post("/{device_id}/reboot", response_model=CommandResponse)
async def reboot_device(
    device_id: int,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_admin),
):
    """Reboots the device remotely. Requires Device Owner (dpm.reboot(), API 24+)."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    command = DeviceCommand(
        device_id=device_id,
        command_type="reboot",
        status="pending",
    )
    db.add(command)
    await db.flush()
    await log_action(
        db,
        actor=current_user,
        action="device.reboot",
        target_type="device",
        target_id=device.device_id,
        details=f"Reiniciou o device {device.device_id}",
        ip_address=http_request.client.host if http_request.client else None,
    )
    await db.flush()
    return command


@router.post("/{device_id}/locate", response_model=CommandResponse)
async def locate_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    command = DeviceCommand(
        device_id=device_id,
        command_type="locate",
        status="pending",
    )
    db.add(command)
    await db.flush()
    return command


@router.post("/{device_id}/command", response_model=CommandResponse)
async def send_command(
    device_id: int,
    cmd: CommandCreate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # lock/wipe/reboot have their own dedicated, admin-only endpoints above. Without
    # this check, any authenticated user (including the "operator" role) could send
    # the exact same destructive command through this generic endpoint instead,
    # completely bypassing the admin restriction those endpoints enforce.
    ADMIN_ONLY_COMMANDS = {"lock", "wipe", "reboot"}
    if cmd.command_type in ADMIN_ONLY_COMMANDS and current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"'{cmd.command_type}' requires admin privileges - use the dedicated endpoint",
        )

    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    command = DeviceCommand(
        device_id=device_id,
        command_type=cmd.command_type,
        payload=json.dumps(cmd.payload) if cmd.payload else None,
        status="pending",
    )
    db.add(command)
    await db.flush()
    await log_action(
        db,
        actor=current_user,
        action=f"device.command.{cmd.command_type}",
        target_type="device",
        target_id=device.device_id,
        details=f"Comando '{cmd.command_type}' enviado ao device {device.device_id}",
        ip_address=http_request.client.host if http_request.client else None,
    )
    await db.flush()
    return command


# Agent endpoints (called by the Android device)
@router.post("/heartbeat")
async def device_heartbeat(
    heartbeat: DeviceHeartbeat,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Device).where(Device.device_id == heartbeat.device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    _verify_device_secret(device, heartbeat.device_secret)

    device.is_online = True
    device.last_seen = datetime.now(timezone.utc)
    device.battery_level = heartbeat.battery_level
    device.storage_free = heartbeat.storage_free
    device.storage_total = heartbeat.storage_total
    if heartbeat.fcm_token:
        device.fcm_token = heartbeat.fcm_token
    if heartbeat.installed_apps:
        device.installed_apps = json.dumps(heartbeat.installed_apps)
    if heartbeat.wifi_ssid is not None:
        device.wifi_ssid = heartbeat.wifi_ssid or None
    if heartbeat.ip_address is not None:
        device.ip_address = heartbeat.ip_address or None

    await db.flush()

    # Return pending commands
    cmd_result = await db.execute(
        select(DeviceCommand).where(
            DeviceCommand.device_id == device.id,
            DeviceCommand.status == "pending",
        )
    )
    commands = cmd_result.scalars().all()
    pending_commands = []
    for cmd in commands:
        pending_commands.append({
            "id": cmd.id,
            "command_type": cmd.command_type,
            "payload": json.loads(cmd.payload) if cmd.payload else None,
        })
        cmd.status = "sent"

    group_name = None
    if device.group_id is not None:
        group_result = await db.execute(
            select(Group.name).where(Group.id == device.group_id)
        )
        group_name = group_result.scalar_one_or_none()

    await db.flush()
    return {
        "status": "ok",
        "asset_id": asset_id_from_pk(device.id),
        "group_name": group_name,
        "commands": pending_commands,
    }


@router.post("/command/{command_id}/ack")
async def ack_command(
    command_id: int,
    ack: CommandAck,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DeviceCommand).where(DeviceCommand.id == command_id)
    )
    command = result.scalar_one_or_none()
    if not command:
        raise HTTPException(status_code=404, detail="Command not found")

    # Command IDs are sequential integers - trivially enumerable - so without this check
    # anyone could mark ANY device's lock/wipe/apply_policy command as "executed" without
    # it ever actually running on that device, silently corrupting the audit trail.
    owner_result = await db.execute(
        select(Device).where(Device.id == command.device_id)
    )
    owner = owner_result.scalar_one_or_none()
    if owner is not None:
        _verify_device_secret(owner, ack.device_secret)

    command.status = ack.status
    command.result = json.dumps(ack.result) if ack.result else None
    command.executed_at = datetime.now(timezone.utc)
    await db.flush()

    # A device confirms it unbound itself -> finish the pending deletion.
    if command.command_type == "release" and ack.status == "executed":
        dev_result = await db.execute(
            select(Device).where(Device.id == command.device_id)
        )
        dev = dev_result.scalar_one_or_none()
        if dev is not None:
            await db.delete(dev)
            await db.flush()

    return {"status": "ok"}


@router.post("/location")
async def update_location(
    location: DeviceLocationUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Device).where(Device.device_id == location.device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    _verify_device_secret(device, location.device_secret)

    device.latitude = location.latitude
    device.longitude = location.longitude
    device.location_address = await reverse_geocode(location.latitude, location.longitude)
    device.location_updated_at = datetime.now(timezone.utc)
    await db.flush()
    return {"status": "ok"}
