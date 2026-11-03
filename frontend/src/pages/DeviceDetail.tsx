import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Divider,
  Alert,
  Switch,
  FormControlLabel,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Link,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  InputAdornment,
  LinearProgress,
  alpha,
  useTheme,
} from '@mui/material'
import { SelectChangeEvent } from '@mui/material/Select'
import {
  Lock,
  DeleteForever,
  LocationOn,
  ArrowBack,
  CleaningServices,
  Visibility,
  VisibilityOff,
  RestartAlt,
  Message,
} from '@mui/icons-material'
import api from '../services/api'
import { Device, Group } from '../types'
import { relativeTime, formatDateTime } from '../utils/time'
import { getErrorMessage } from '../utils/errors'
import { StatusChip, OnlineIndicator } from '../components/StatusChip'
import BatteryIndicator from '../components/BatteryIndicator'

const formatMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`)

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
  const [showKioskPin, setShowKioskPin] = useState(false)
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [lockPin, setLockPin] = useState('')
  const [locating, setLocating] = useState(false)
  const theme = useTheme()
  const [messageOpen, setMessageOpen] = useState(false)
  const [messageForm, setMessageForm] = useState({ title: 'Aviso', message: '' })
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeText, setWipeText] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const prevLocRef = useRef<string | null>(null)

  useEffect(() => {
    loadDevice()
    loadGroups()
  }, [id])

  const loadGroups = async () => {
    try {
      const response = await api.get('/groups')
      setGroups(response.data)
    } catch (err) {
      console.error('Failed to load groups:', err)
    }
  }

  const assignGroup = async (groupId: number | null) => {
    try {
      await api.put(`/devices/${id}`, { group_id: groupId })
      setDevice((prev) => (prev ? { ...prev, group_id: groupId } : prev))
      setAlert({ type: 'success', message: 'Grupo atualizado' })
    } catch {
      setAlert({ type: 'error', message: 'Falha ao alterar o grupo' })
    }
  }

  const [notesDraft, setNotesDraft] = useState('')
  const [notesDirty, setNotesDirty] = useState(false)

  const saveNotes = async () => {
    try {
      await api.put(`/devices/${id}`, { notes: notesDraft })
      setDevice((prev) => (prev ? { ...prev, notes: notesDraft || null } : prev))
      setNotesDirty(false)
      setAlert({ type: 'success', message: 'Notas salvas' })
    } catch {
      setAlert({ type: 'error', message: 'Falha ao salvar notas' })
    }
  }

  // While a location request is in flight, poll the device until it reports a
  // fresh position (or give up after a timeout if the device is offline).
  useEffect(() => {
    if (!locating) return
    const started = Date.now()
    const interval = setInterval(async () => {
      try {
        const response = await api.get(`/devices/${id}`)
        const dev: Device = response.data
        setDevice(dev)
        if (dev.location_updated_at && dev.location_updated_at !== prevLocRef.current) {
          setLocating(false)
          setAlert({ type: 'success', message: 'Localização atualizada' })
        } else if (Date.now() - started > 45000) {
          setLocating(false)
          setAlert({
            type: 'error',
            message: 'O dispositivo não respondeu à localização (pode estar offline)',
          })
        }
      } catch {
        /* keep polling */
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [locating, id])

  const loadDevice = async () => {
    try {
      const response = await api.get(`/devices/${id}`)
      const dev: Device = response.data
      setDevice(dev)
      setKioskApps((dev.kiosk_apps || []).join(', '))
      setKioskWebLinks(
        (dev.kiosk_web_links || []).map((l) => `${l.label} | ${l.url}`).join('\n')
      )
      setKioskPin(dev.kiosk_pin || '')
      setNotesDraft(dev.notes || '')
      setNotesDirty(false)
    } catch (err: unknown) {
      // Device removed (e.g. released and deleted) -> go back to the list.
      const e = err as { response?: { status?: number } }
      if (e.response?.status === 404) {
        navigate('/devices')
        return
      }
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
    try {
      await api.post(`/devices/${id}/wipe`)
      setAlert({ type: 'success', message: 'Comando de wipe enviado' })
      setWipeOpen(false)
      setWipeText('')
      loadDevice()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao executar wipe' })
    }
  }

  const rebootDevice = async () => {
    if (!window.confirm('Reiniciar este dispositivo agora?')) return
    try {
      await api.post(`/devices/${id}/reboot`)
      setAlert({ type: 'success', message: 'Comando de reinicialização enviado' })
    } catch (err) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao reiniciar dispositivo') })
    }
  }

  const sendMessage = async () => {
    try {
      await api.post(`/devices/${id}/message`, messageForm)
      setAlert({ type: 'success', message: 'Mensagem enviada ao dispositivo' })
      setMessageOpen(false)
      setMessageForm({ title: 'Aviso', message: '' })
    } catch (err) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao enviar mensagem') })
    }
  }

  const clearWebCache = async () => {
    try {
      await api.post(`/devices/${id}/command`, { command_type: 'clear_web_cache' })
      setAlert({
        type: 'success',
        message: 'Comando enviado. O cache do navegador será limpo no próximo contato do dispositivo.',
      })
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao limpar o cache' })
    }
  }

  const locateDevice = async () => {
    try {
      prevLocRef.current = device?.location_updated_at ?? null
      await api.post(`/devices/${id}/locate`)
      setLocating(true)
      setAlert({
        type: 'success',
        message: 'Solicitação enviada. Aguardando o dispositivo responder...',
      })
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
        kiosk_pin: kioskPin,
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
        kiosk_pin: kioskPin,
      })
      setAlert({ type: 'success', message: 'Configurações do kiosk salvas' })
      loadDevice()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao salvar configurações do kiosk' })
    }
  }

  if (!device) return <Typography>Carregando...</Typography>

  const remoteActions = [
    { label: locating ? 'Localizando...' : 'Localizar', icon: locating ? <CircularProgress size={16} /> : <LocationOn />, onClick: locateDevice, disabled: locating },
    { label: 'Enviar mensagem', icon: <Message />, onClick: () => setMessageOpen(true) },
    { label: 'Reiniciar', icon: <RestartAlt />, onClick: rebootDevice },
    { label: 'Bloquear', icon: <Lock />, onClick: () => setLockDialogOpen(true) },
    { label: 'Limpar cache do navegador', icon: <CleaningServices />, onClick: clearWebCache },
  ]

  return (
    <Box>
      <Button startIcon={<ArrowBack />} color="inherit" onClick={() => navigate('/devices')} sx={{ mb: 1, ml: -1, color: 'text.secondary' }}>
        Dispositivos
      </Button>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1">
          {device.name || [device.manufacturer, device.model].filter(Boolean).join(' ') || device.device_id}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 1.5, sm: 2.5 }, mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            {device.asset_id || `ARZ-${device.id}`}
          </Typography>
          {device.status !== 'pending' && <OnlineIndicator online={device.is_online} lastSeen={device.last_seen} />}
          <StatusChip status={device.status} />
          <BatteryIndicator level={device.battery_level} />
        </Box>
      </Box>

      {/* No celular as ações ficam logo abaixo do cabeçalho; no desktop, no cartão da direita. */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, overflowX: 'auto', pb: 1, mb: 2, mx: -2, px: 2 }}>
        {remoteActions.map((a) => (
          <Button
            key={a.label}
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={a.icon}
            onClick={a.onClick}
            disabled={a.disabled}
            sx={{ flexShrink: 0, whiteSpace: 'nowrap', borderColor: 'divider', bgcolor: 'background.paper' }}
          >
            {a.label}
          </Button>
        ))}
      </Box>

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
                  <Typography>{device.asset_id || `ARZ-${device.id}`}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">UUID</Typography>
                  <Typography sx={{ wordBreak: 'break-all', fontSize: '0.85rem', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>{device.device_id}</Typography>
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
                  <Typography variant="body2" color="text.secondary">Armazenamento</Typography>
{device.storage_free != null && device.storage_total != null && device.storage_total > 0 ? (
                    <Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.round(((device.storage_total - device.storage_free) / device.storage_total) * 100)}
                        sx={{ height: 6, borderRadius: 3, my: 0.75, maxWidth: 220 }}
                      />
                      <Typography variant="body2">
                        {formatMB(device.storage_free)} livres de {formatMB(device.storage_total)}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography>N/A</Typography>
                  )}
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Última vez online</Typography>
                  <Typography>{relativeTime(device.last_seen)}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatDateTime(device.last_seen, true)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Rede Wi-Fi</Typography>
                  <Typography>{device.wifi_ssid || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Endereço IP</Typography>
                  <Typography>{device.ip_address || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Grupo / Operação</Typography>
                  <FormControl size="small" variant="standard" sx={{ minWidth: 160, mt: 0.5 }}>
                    <Select
                      displayEmpty
                      value={device.group_id != null ? String(device.group_id) : ''}
                      onChange={(e: SelectChangeEvent) =>
                        assignGroup(e.target.value ? Number(e.target.value) : null)
                      }
                      renderValue={(v) =>
                        v
                          ? groups.find((g) => g.id === Number(v))?.name || '-'
                          : <em>Sem grupo</em>
                      }
                    >
                      <MenuItem value="">
                        <em>Sem grupo</em>
                      </MenuItem>
                      {groups.map((g) => (
                        <MenuItem key={g.id} value={String(g.id)}>
                          {g.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {(device.latitude && device.longitude) || locating ? (
                <Box sx={{ mt: 2 }}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2" color="text.secondary">Localização</Typography>
                  {locating && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2">Aguardando o dispositivo responder...</Typography>
                    </Box>
                  )}
                  {device.location_address && (
                    <Typography sx={{ mt: 0.5 }}>{device.location_address}</Typography>
                  )}
                  {device.latitude && device.longitude && (
                    <>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Lat: {device.latitude.toFixed(6)}, Lng: {device.longitude.toFixed(6)}
                        {' · '}
                        <Link
                          href={`https://www.openstreetmap.org/?mlat=${device.latitude}&mlon=${device.longitude}#map=17/${device.latitude}/${device.longitude}`}
                          target="_blank"
                          rel="noopener"
                        >
                          ver no mapa
                        </Link>
                      </Typography>
                      {device.location_updated_at && (
                        <Typography variant="caption" color="text.secondary">
                          Atualizada em {new Date(device.location_updated_at).toLocaleString('pt-BR')}
                        </Typography>
                      )}
                    </>
                  )}
                </Box>
              ) : null}
            </CardContent>
          </Card>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Notas
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Histórico de manutenção, quem usa o aparelho, etc. Só você
                (equipe interna) vê isso - nunca é enviado ao dispositivo.
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={3}
                placeholder="Ex: trocou a tela em 12/03, usado pelo turno da noite..."
                value={notesDraft}
                onChange={(e) => {
                  setNotesDraft(e.target.value)
                  setNotesDirty(true)
                }}
              />
              <Button
                variant="contained"
                size="small"
                sx={{ mt: 1 }}
                onClick={saveNotes}
                disabled={!notesDirty}
              >
                Salvar notas
              </Button>
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
                helperText="PIN atualmente em vigor no coletor. Use o olho para ver."
                type={showKioskPin ? 'text' : 'password'}
                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 8 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowKioskPin((v) => !v)}
                        edge="end"
                        aria-label={showKioskPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                      >
                        {showKioskPin ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
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
          <Card sx={{ display: { xs: 'none', md: 'block' } }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Ações remotas
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {remoteActions.map((a) => (
                  <Button
                    key={a.label}
                    variant="outlined"
                    color="inherit"
                    startIcon={a.icon}
                    onClick={a.onClick}
                    disabled={a.disabled}
                    fullWidth
                    sx={{ justifyContent: 'flex-start', borderColor: 'divider', py: 1 }}
                  >
                    {a.label}
                  </Button>
                ))}
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ mt: { xs: 0, md: 2 }, borderColor: alpha(theme.palette.error.main, 0.5) }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: 'error.main' }}>
                Zona de perigo
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Apaga todos os dados do aparelho e o devolve às configurações de fábrica. Não dá para desfazer.
              </Typography>
              <Button variant="outlined" color="error" startIcon={<DeleteForever />} onClick={() => setWipeOpen(true)} fullWidth>
                Apagar dados (wipe)
              </Button>
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

      <Dialog open={messageOpen} onClose={() => setMessageOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Enviar mensagem ao dispositivo</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A mensagem aparece como um pop-up na tela do aparelho, mesmo se ele estiver em modo kiosk.
          </Typography>
          <TextField fullWidth label="Título" value={messageForm.title} onChange={(e) => setMessageForm({ ...messageForm, title: e.target.value })} margin="normal" inputProps={{ maxLength: 100 }} />
          <TextField
            fullWidth
            label="Mensagem"
            value={messageForm.message}
            onChange={(e) => setMessageForm({ ...messageForm, message: e.target.value })}
            margin="normal"
            multiline
            rows={3}
            required
            inputProps={{ maxLength: 500 }}
            helperText={`${messageForm.message.length}/500`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={sendMessage} disabled={!messageForm.message.trim()}>
            Enviar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={wipeOpen} onClose={() => { setWipeOpen(false); setWipeText('') }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: 'error.main' }}>Apagar todos os dados?</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            Isso apaga TODOS os dados de {device.name || device.asset_id || 'este dispositivo'} e não pode ser desfeito.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Para confirmar, digite <strong>{device.asset_id || `ARZ-${device.id}`}</strong>:
          </Typography>
          <TextField fullWidth autoFocus size="small" value={wipeText} onChange={(e) => setWipeText(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setWipeOpen(false); setWipeText('') }}>Cancelar</Button>
          <Button
            variant="contained"
            color="error"
            onClick={wipeDevice}
            disabled={wipeText.trim().toUpperCase() !== (device.asset_id || `ARZ-${device.id}`).toUpperCase()}
          >
            Apagar tudo
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
