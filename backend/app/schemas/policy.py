from datetime import datetime

from pydantic import BaseModel


class KioskWebLink(BaseModel):
    label: str
    url: str


class PolicyCreate(BaseModel):
    name: str
    description: str | None = None
    policy_type: str  # app_allowlist, app_blocklist, kiosk, restrictions
    app_list: list[str] | None = None
    kiosk_enabled: bool = False
    kiosk_apps: list[str] | None = None
    kiosk_web_links: list[KioskWebLink] | None = None
    camera_disabled: bool = False
    screenshot_disabled: bool = False
    usb_disabled: bool = False
    wifi_config_disabled: bool = False
    bluetooth_disabled: bool = False
    install_apps_disabled: bool = False
    uninstall_apps_disabled: bool = False
    factory_reset_disabled: bool = False


class PolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    app_list: list[str] | None = None
    kiosk_enabled: bool | None = None
    kiosk_apps: list[str] | None = None
    kiosk_web_links: list[KioskWebLink] | None = None
    camera_disabled: bool | None = None
    screenshot_disabled: bool | None = None
    usb_disabled: bool | None = None
    wifi_config_disabled: bool | None = None
    bluetooth_disabled: bool | None = None
    install_apps_disabled: bool | None = None
    uninstall_apps_disabled: bool | None = None
    factory_reset_disabled: bool | None = None
    is_active: bool | None = None


class PolicyResponse(BaseModel):
    id: int
    name: str
    description: str | None
    policy_type: str
    app_list: list[str] | None = None
    kiosk_enabled: bool
    kiosk_apps: list[str] | None = None
    kiosk_web_links: list[KioskWebLink] | None = None
    camera_disabled: bool
    screenshot_disabled: bool
    usb_disabled: bool
    wifi_config_disabled: bool
    bluetooth_disabled: bool
    install_apps_disabled: bool
    uninstall_apps_disabled: bool
    factory_reset_disabled: bool
    is_active: bool
    created_at: datetime | None

    class Config:
        from_attributes = True


class PolicyAssignRequest(BaseModel):
    device_ids: list[int]
