import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Grid,
  Card,
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
} from '@mui/icons-material'
import api from '../services/api'
import { Device } from '../types'

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

  const statCards = [
    { label: 'Total de Dispositivos', value: stats.total, icon: <PhoneAndroid />, color: '#1976d2' },
    { label: 'Online', value: stats.online, icon: <CheckCircle />, color: '#2e7d32' },
    { label: 'Offline', value: stats.offline, icon: <Cancel />, color: '#d32f2f' },
    { label: 'Bloqueados', value: stats.locked, icon: <Lock />, color: '#ed6c02' },
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
            </Card>
          </Grid>
        ))}
      </Grid>

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
