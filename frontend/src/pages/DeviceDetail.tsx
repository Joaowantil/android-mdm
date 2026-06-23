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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  Lock,
  DeleteForever,
  LocationOn,
  ArrowBack,
} from '@mui/icons-material'
import api from '../services/api'
import { Device } from '../types'

function parseWebLinks(raw: string): { label: string; url: string }[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf('|')
      let label = ''
      let url = line
      if (sep >= 0) {
        label = line.slice(0, sep).trim()
        url = line.slice(sep + 1).trim()
      }
      if (url && !/^https?:\/\//i.test(url)) {
        url = `https://${url}`
      }
      if (!label) {
        label = url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
      }
      return { label, url }
    })
    .filter((l) => l.url)
}

export default function DeviceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [device, setDevice] = useState<Device | null>(null)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [kioskApps, setKioskApps] = useState('')
  const [kioskWebLinks, setKioskWebLinks] = useState('')
  const [kioskPin, setKioskPin] = useState('')
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [lockPin, setLockPin] = useState('')

  useEffect(() => {
    loadDevice()
  }, [id])

  const loadDevice = async () => {
    try {
      const response = await api.get(`/devices/${id}`)
      const dev: Device = response.data
      setDevice(dev)
      setKioskApps((dev.kiosk_apps || []).join(', '))
      setKioskWebLinks(
        (dev.kiosk_web_links || []).map((l) => `${l.label} | ${l.url}`).join('\n')
      )
    } catch (err) {
      console.error('Failed to load device:', err)
    }
  }

  const lockDevice = async () => {
    if (lockPin && !/^\d{4,8}$/.test(lockPin)) {
      setAlert({ type: 'error', message: 'O PIN deve ter de 4 a 8 dígitos' })
      return
    }
    try {
      await api.post(`/devices/${id}/lock`, lockPin ? { pin: lockPin } : {})
      setAlert({
        type: 'success',
        message: lockPin
          ? 'Dispositivo bloqueado. Desbloqueio exige o PIN definido.'
          : 'Dispositivo bloqueado',
      })
      setLockDialogOpen(false)
      setLockPin('')
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
    if (enabled && kioskPin && !/^\d{4,8}$/.test(kioskPin)) {
      setAlert({ type: 'error', message: 'O PIN do kiosk deve ter de 4 a 8 dígitos' })
      return
    }
    try {
      const apps = kioskApps.split(',').map((a) => a.trim()).filter(Boolean)
      const webLinks = parseWebLinks(kioskWebLinks)
      await api.put(`/devices/${id}`, {
        kiosk_enabled: enabled,
        kiosk_apps: apps,
        kiosk_web_links: webLinks,
        kiosk_pin: enabled && kioskPin ? kioskPin : undefined,
      })
      setAlert({ type: 'success', message: enabled ? 'Kiosk mode ativado' : 'Kiosk mode desativado' })
      loadDevice()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao alterar kiosk mode' })
      return
    }
  }

  const saveKiosk = async () => {
    if (kioskPin && !/^\d{4,8}$/.test(kioskPin)) {
      setAlert({ type: 'error', message: 'O PIN do kiosk deve ter de 4 a 8 dígitos' })
      return
    }
    try {
      const apps = kioskApps.split(',').map((a) => a.trim()).filter(Boolean)
      const webLinks = parseWebLinks(kioskWebLinks)
      await api.put(`/devices/${id}`, {
        kiosk_enabled: device?.kiosk_enabled ?? false,
        kiosk_apps: apps,
        kiosk_web_links: webLinks,
        kiosk_pin: device?.kiosk_enabled && kioskPin ? kioskPin : undefined,
      })
      setAlert({ type: 'success', message: 'Configurações do kiosk salvas' })
      loadDevice()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao salvar configurações do kiosk' })
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
        {device.asset_id ? `${device.asset_id} · ` : ''}
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
                  <Typography variant="body2" color="text.secondary">ID do Dispositivo</Typography>
                  <Typography>{device.asset_id || `MDM-${device.id}`}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">UUID</Typography>
                  <Typography sx={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{device.device_id}</Typography>
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
                sx={{ mt: 2 }}
                size="small"
              />
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Sites permitidos (um por linha: Nome | https://site)"
                placeholder={'Sistema de Chamados | https://chamados.empresa.com\nIntranet | https://intranet.empresa.com'}
                value={kioskWebLinks}
                onChange={(e) => setKioskWebLinks(e.target.value)}
                sx={{ mt: 2 }}
                size="small"
              />
              <TextField
                fullWidth
                label="PIN para sair do kiosk (4 a 8 dígitos)"
                type="password"
                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 8 }}
                value={kioskPin}
                onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, ''))}
                sx={{ my: 2 }}
                size="small"
              />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={device.kiosk_enabled}
                      onChange={(e) => toggleKiosk(e.target.checked)}
                    />
                  }
                  label={device.kiosk_enabled ? 'Kiosk Mode Ativo' : 'Kiosk Mode Inativo'}
                />
                <Button variant="outlined" size="small" onClick={saveKiosk}>
                  Salvar apps/sites
                </Button>
              </Box>
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
                  onClick={() => setLockDialogOpen(true)}
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

      <Dialog open={lockDialogOpen} onClose={() => setLockDialogOpen(false)}>
        <DialogTitle>Bloquear Dispositivo</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Defina um PIN (4 a 8 dígitos) que será exigido no aparelho para desbloquear.
            Deixe em branco para apenas travar a tela.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="PIN de desbloqueio (opcional)"
            type="password"
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 8 }}
            value={lockPin}
            onChange={(e) => setLockPin(e.target.value.replace(/\D/g, ''))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLockDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="warning" onClick={lockDevice}>
            Bloquear
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
