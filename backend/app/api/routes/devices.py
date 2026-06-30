import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.device import Device
from app.models.command import DeviceCommand
from app.schemas.device import (
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

router = APIRouter(prefix="/devices", tags=["Devices"])


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

    await db.flush()
    return DeviceEnrollResponse(
        success=True,
        device_id=device.device_id,
        asset_id=asset_id_from_pk(device.id),
        message="Device enrolled successfully",
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

    kiosk_changed = False
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
        if update.kiosk_pin:
            payload["pin"] = update.kiosk_pin
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
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(device)
    return {"message": "Device deleted"}


@router.post("/{device_id}/lock", response_model=CommandResponse)
async def lock_device(
    device_id: int,
    lock: DeviceLockRequest | None = None,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
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
    return command


@router.post("/{device_id}/wipe", response_model=CommandResponse)
async def wipe_device(
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
        command_type="wipe",
        status="pending",
    )
    db.add(command)
    device.status = "wiped"
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
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
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

    device.is_online = True
    device.last_seen = datetime.now(timezone.utc)
    device.battery_level = heartbeat.battery_level
    device.storage_free = heartbeat.storage_free
    device.storage_total = heartbeat.storage_total
    if heartbeat.fcm_token:
        device.fcm_token = heartbeat.fcm_token
    if heartbeat.installed_apps:
        device.installed_apps = json.dumps(heartbeat.installed_apps)

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

    await db.flush()
    return {
        "status": "ok",
        "asset_id": asset_id_from_pk(device.id),
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

    command.status = ack.status
    command.result = json.dumps(ack.result) if ack.result else None
    command.executed_at = datetime.now(timezone.utc)
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

    device.latitude = location.latitude
    device.longitude = location.longitude
    device.location_updated_at = datetime.now(timezone.utc)
    await db.flush()
    return {"status": "ok"}
