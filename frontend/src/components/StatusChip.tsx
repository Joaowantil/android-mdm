import { Box, Chip, alpha, useTheme } from '@mui/material'
import { statusInfo, type Tone } from '../utils/labels'
import { relativeTime } from '../utils/time'

// Selo "suave" (fundo translúcido + texto na cor do tom): não grita mais que o problema.
export function ToneChip({ label, tone, icon }: { label: string; tone: Tone; icon?: React.ReactElement }) {
  const theme = useTheme()
  const color = tone === 'default' ? theme.palette.text.secondary : theme.palette[tone].main
  const text = tone === 'default' ? theme.palette.text.secondary : theme.palette.mode === 'dark' ? theme.palette[tone].light : theme.palette[tone].dark
  return (
    <Chip
      size="small"
      icon={icon}
      label={label}
      sx={{ bgcolor: alpha(color, 0.14), color: text, '& .MuiChip-icon': { color: text } }}
    />
  )
}

export function StatusChip({ status }: { status: string }) {
  const { label, tone } = statusInfo(status)
  return <ToneChip label={label} tone={tone} />
}

// Bolinha + texto: "● Online" ou "○ Offline · há 3 h".
export function OnlineIndicator({ online, lastSeen }: { online: boolean; lastSeen: string | null }) {
  const theme = useTheme()
  const color = online ? theme.palette.success.main : theme.palette.text.disabled
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, boxShadow: online ? `0 0 0 3px ${alpha(color, 0.2)}` : 'none' }} />
      <Box component="span" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: online ? 'success.main' : 'text.secondary' }}>
        {online ? 'Online' : `Offline${lastSeen ? ` · ${relativeTime(lastSeen)}` : ''}`}
      </Box>
    </Box>
  )
}
