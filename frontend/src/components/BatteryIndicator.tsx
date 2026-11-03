import { Box, LinearProgress, useTheme } from '@mui/material'

// Barrinha + número, com cor por nível. Bateria baixa precisa PARECER problema.
export function batteryTone(level: number): 'error' | 'warning' | 'success' {
  if (level <= 15) return 'error'
  if (level <= 30) return 'warning'
  return 'success'
}

export default function BatteryIndicator({ level, width = 44 }: { level: number | null; width?: number }) {
  const theme = useTheme()
  if (level == null) return <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>
  const tone = batteryTone(level)
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, level))}
        color={tone}
        sx={{ width, height: 6, borderRadius: 3, bgcolor: theme.palette.action.hover }}
      />
      <Box component="span" sx={{ fontSize: '0.8125rem', fontWeight: tone === 'success' ? 500 : 700, color: tone === 'success' ? 'text.primary' : `${tone}.main`, minWidth: 34 }}>
        {level}%
      </Box>
    </Box>
  )
}
