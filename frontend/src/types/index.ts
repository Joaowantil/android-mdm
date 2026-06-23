export interface Device {
  id: number
  device_id: string
  asset_id: string | null
  name: string | null
  model: string | null
  manufacturer: string | null
  os_version: string | null
  serial_number: string | null
  status: string
  is_online: boolean
  last_seen: string | null
  latitude: number | null
  longitude: number | null
  kiosk_enabled: boolean
  kiosk_apps: string[] | null
  kiosk_web_links: { label: string; url: string }[] | null
  battery_level: number | null
  storage_free: number | null
  storage_total: number | null
  enrolled_at: string | null
  created_at: string | null
}

export interface Policy {
  id: number
  name: string
  description: string | null
  policy_type: string
  app_list: string[] | null
  kiosk_enabled: boolean
  kiosk_apps: string[] | null
  camera_disabled: boolean
  screenshot_disabled: boolean
  usb_disabled: boolean
  wifi_config_disabled: boolean
  bluetooth_disabled: boolean
  install_apps_disabled: boolean
  uninstall_apps_disabled: boolean
  factory_reset_disabled: boolean
  is_active: boolean
  created_at: string | null
}

export interface Command {
  id: number
  device_id: number
  command_type: string
  payload: string | null
  status: string
  result: string | null
  created_at: string | null
  executed_at: string | null
}
