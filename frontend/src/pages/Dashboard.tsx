import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Grid,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material'
import {
  PhoneAndroid,
  CheckCircle,
  Cancel,
  Lock,
  Warning,
  BatteryAlert,
  WifiOff,
} from '@mui/icons-material'
import api from '../services/api'
import { Device } from '../types'
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

// Thresholds for the "needs attention" card. Kept as named constants so they're easy to
// tune later without hunting through the JSX.
const LOW_BATTERY_THRESHOLD = 15 // percent
const LONG_OFFLINE_HOURS = 1

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      const response = await api.get('/devices')
      setDevices(response.data)
    } catch (err) {
      console.error('Failed to load devices:', err)
    }
  }

  const stats = {
    total: devices.length,
    online: devices.filter((d) => d.is_online).length,
    offline: devices.filter((d) => !d.is_online).length,
    locked: devices.filter((d) => d.status === 'locked').length,
    pending: devices.filter((d) => d.status === 'pending').length,
  }

  // Only devices that have actually enrolled can be "low on battery" or "offline too
  // long" - a pending device has never reported anything, and a wiped device is
  // expected to be offline, so neither should ever show up as an alert.
  const activeDevices = devices.filter((d) => d.status !== 'pending' && d.status !== 'wiped')

  const lowBattery = activeDevices.filter(
    (d) => d.battery_level != null && d.battery_level <= LOW_BATTERY_THRESHOLD
  )

  const longOffline = activeDevices.filter((d) => {
    if (d.is_online || !d.last_seen) return false
    const lastSeen = new Date(d.last_seen).getTime()
    const hoursOffline = (Date.now() - lastSeen) / (1000 * 60 * 60)
    return hoursOffline >= LONG_OFFLINE_HOURS
  })

  // Status distribution (pie) - one slice per distinct status value actually present,
  // so a status that doesn't exist in this fleet (e.g. no device is "wiped" right now)
  // simply doesn't show a slice, rather than rendering an empty/zero one.
  const STATUS_COLORS: Record<string, string> = {
    enrolled: '#2e7d32',
    active: '#2e7d32',
    pending: '#ed6c02',
    locked: '#f57c00',
    wiped: '#d32f2f',
  }
  const statusCounts = devices.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1
    return acc
  }, {})
  const statusChartData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status,
    value: count,
  }))

  // Battery distribution (bar) - fixed buckets regardless of fleet size, only counting
  // devices that have actually reported a battery level at least once.
  const BATTERY_BUCKETS: [string, (n: number) => boolean][] = [
    ['0-20%', (n) => n <= 20],
    ['21-50%', (n) => n > 20 && n <= 50],
    ['51-80%', (n) => n > 50 && n <= 80],
    ['81-100%', (n) => n > 80],
  ]
  const devicesWithBattery = devices.filter((d) => d.battery_level != null)
  const batteryChartData = BATTERY_BUCKETS.map(([label, inBucket]) => ({
    name: label,
    quantidade: devicesWithBattery.filter((d) => inBucket(d.battery_level as number)).length,
  }))

  const statCards = [
    { label: 'Total de Dispositivos', value: stats.total, icon: <PhoneAndroid />, color: '#1976d2', to: '/devices' },
    { label: 'Online', value: stats.online, icon: <CheckCircle />, color: '#2e7d32', to: '/devices?status=online' },
    { label: 'Offline', value: stats.offline, icon: <Cancel />, color: '#d32f2f', to: '/devices?status=offline' },
    { label: 'Bloqueados', value: stats.locked, icon: <Lock />, color: '#ed6c02', to: '/devices?status=locked' },
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((stat) => (
          <Grid item xs={12} sm={6} md={3} key={stat.label}>
            <Card>
              <CardActionArea onClick={() => navigate(stat.to)}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ color: stat.color }}>{stat.icon}</Box>
                    <Box>
                      <Typography variant="h4">{stat.value}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {stat.label}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      {devices.length > 0 && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Status da frota
                </Typography>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry: { name?: string; value?: number }) =>
                        `${entry.name ?? ''}: ${entry.value ?? 0}`
                      }
                    >
                      {statusChartData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#9e9e9e'} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Distribuição de bateria
                </Typography>
                {devicesWithBattery.length === 0 ? (
                  <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                    Nenhum dispositivo reportou nível de bateria ainda
                  </Typography>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={batteryChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <RechartsTooltip />
                      <Bar dataKey="quantidade" fill="#1976d2" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {(lowBattery.length > 0 || longOffline.length > 0) && (
        <Card sx={{ mb: 3, borderLeft: '4px solid #ed6c02' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Atenção necessária
            </Typography>
            <List dense>
              {lowBattery.map((device) => (
                <ListItem
                  key={`bat-${device.id}`}
                  button
                  onClick={() => navigate(`/devices/${device.id}`)}
                >
                  <ListItemIcon>
                    <BatteryAlert color="error" />
                  </ListItemIcon>
                  <ListItemText
                    primary={device.name || device.asset_id || device.device_id.slice(0, 12)}
                    secondary={`Bateria em ${device.battery_level}%`}
                  />
                </ListItem>
              ))}
              {longOffline.map((device) => (
                <ListItem
                  key={`off-${device.id}`}
                  button
                  onClick={() => navigate(`/devices/${device.id}`)}
                >
                  <ListItemIcon>
                    <WifiOff color="warning" />
                  </ListItemIcon>
                  <ListItemText
                    primary={device.name || device.asset_id || device.device_id.slice(0, 12)}
                    secondary={`Offline há mais de ${LONG_OFFLINE_HOURS}h (última vez: ${
                      device.last_seen ? new Date(device.last_seen).toLocaleString('pt-BR') : 'nunca'
                    })`}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Dispositivos Recentes
          </Typography>
          {devices.length === 0 ? (
            <Typography color="text.secondary">
              Nenhum dispositivo registrado. Gere um token de enrollment para começar.
            </Typography>
          ) : (
            <List>
              {devices.slice(0, 5).map((device) => (
                <ListItem
                  key={device.id}
                  button
                  onClick={() => navigate(`/devices/${device.id}`)}
                >
                  <ListItemIcon>
                    <PhoneAndroid color={device.is_online ? 'success' : 'disabled'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={device.name || device.model || device.device_id}
                    secondary={`${device.manufacturer || ''} ${device.model || ''} - ${device.os_version || 'N/A'}`}
                  />
                  <Chip
                    label={device.status}
                    size="small"
                    color={
                      device.status === 'active' || device.status === 'enrolled'
                        ? 'success'
                        : device.status === 'locked'
                        ? 'warning'
                        : 'default'
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {stats.pending > 0 && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Warning color="warning" />
              <Typography>
                {stats.pending} dispositivo(s) aguardando enrollment
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
