import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Chip,
  Divider,
  Alert,
  Switch,
  FormControlLabel,
  TextField,
} from '@mui/material'
import {
  Lock,
  DeleteForever,
  LocationOn,
  ArrowBack,
} from '@mui/icons-material'
import api from '../services/api'
import { Device } from '../types'

export default function DeviceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [device, setDevice] = useState<Device | null>(null)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [kioskApps, setKioskApps] = useState('')

  useEffect(() => {
    loadDevice()
  }, [id])

  const loadDevice = async () => {
    try {
      const response = await api.get(`/devices/${id}`)
      setDevice(response.data)
    } catch (err) {
      console.error('Failed to load device:', err)
    }
  }

  const lockDevice = async () => {
    try {
      await api.post(`/devices/${id}/lock`)
      setAlert({ type: 'success', message: 'Dispositivo bloqueado' })
      loadDevice()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao bloquear' })
    }
  }

  const wipeDevice = async () => {
    if (!confirm('ATENÇÃO: Isso apagará TODOS os dados do dispositivo. Continuar?')) return
    try {
      await api.post(`/devices/${id}/wipe`)
      setAlert({ type: 'success', message: 'Comando de wipe enviado' })
      loadDevice()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao executar wipe' })
    }
  }

  const locateDevice = async () => {
    try {
      await api.post(`/devices/${id}/locate`)
      setAlert({ type: 'success', message: 'Solicitação de localização enviada' })
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao localizar' })
    }
  }

  const toggleKiosk = async (enabled: boolean) => {
    try {
      const apps = kioskApps.split(',').map((a) => a.trim()).filter(Boolean)
      await api.put(`/devices/${id}`, {
        kiosk_enabled: enabled,
        kiosk_apps: apps.length > 0 ? apps : undefined,
      })
      setAlert({ type: 'success', message: enabled ? 'Kiosk mode ativado' : 'Kiosk mode desativado' })
      loadDevice()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao alterar kiosk mode' })
    }
  }

  if (!device) return <Typography>Carregando...</Typography>

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/devices')} sx={{ mb: 2 }}>
        Voltar
      </Button>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Typography variant="h4" gutterBottom>
        {device.name || device.model || device.device_id}
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Informações do Dispositivo
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">ID</Typography>
                  <Typography>{device.device_id}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Modelo</Typography>
                  <Typography>{device.manufacturer} {device.model}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Android</Typography>
                  <Typography>{device.os_version || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Serial</Typography>
                  <Typography>{device.serial_number || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <Chip label={device.status} color={device.status === 'enrolled' ? 'success' : 'default'} size="small" />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Bateria</Typography>
                  <Typography>{device.battery_level != null ? `${device.battery_level}%` : 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Armazenamento</Typography>
                  <Typography>
                    {device.storage_free != null && device.storage_total != null
                      ? `${device.storage_free}MB livre / ${device.storage_total}MB total`
                      : 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Último contato</Typography>
                  <Typography>
                    {device.last_seen ? new Date(device.last_seen).toLocaleString('pt-BR') : 'Nunca'}
                  </Typography>
                </Grid>
              </Grid>

              {device.latitude && device.longitude && (
                <Box sx={{ mt: 2 }}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2" color="text.secondary">Localização</Typography>
                  <Typography>
                    Lat: {device.latitude.toFixed(6)}, Lng: {device.longitude.toFixed(6)}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Kiosk Mode
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Trave o dispositivo em apps específicos. O usuário não poderá sair desses apps.
              </Typography>
              <TextField
                fullWidth
                label="Apps permitidos (pacotes separados por vírgula)"
                placeholder="com.whatsapp, com.google.android.apps.maps"
                value={kioskApps}
                onChange={(e) => setKioskApps(e.target.value)}
                sx={{ my: 2 }}
                size="small"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={device.kiosk_enabled}
                    onChange={(e) => toggleKiosk(e.target.checked)}
                  />
                }
                label={device.kiosk_enabled ? 'Kiosk Mode Ativo' : 'Kiosk Mode Inativo'}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Ações Remotas
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<Lock />}
                  onClick={lockDevice}
                  fullWidth
                >
                  Bloquear Dispositivo
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<LocationOn />}
                  onClick={locateDevice}
                  fullWidth
                >
                  Localizar Dispositivo
                </Button>
                <Divider />
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<DeleteForever />}
                  onClick={wipeDevice}
                  fullWidth
                >
                  Wipe (Apagar Tudo)
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
