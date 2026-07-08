import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
} from '@mui/material'
import { SelectChangeEvent } from '@mui/material/Select'
import {
  Lock,
  Delete,
  LocationOn,
  Add,
  ContentCopy,
  Visibility,
} from '@mui/icons-material'
import { QRCodeCanvas } from 'qrcode.react'
import api from '../services/api'
import { Device, Group } from '../types'
import { lastOnlineText } from '../utils/time'

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [enrollDialog, setEnrollDialog] = useState(false)
  const [enrollToken, setEnrollToken] = useState('')
  const [enrollDeviceId, setEnrollDeviceId] = useState<number | null>(null)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || 'all'

  useEffect(() => {
    loadDevices()
    loadGroups()
    // Keep the list fresh on its own so changes (a device released/removed,
    // going offline, battery, etc.) show up without a manual reload.
    const interval = setInterval(loadDevices, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadDevices = async () => {
    try {
      const response = await api.get('/devices')
      setDevices(response.data)
    } catch (err) {
      console.error('Failed to load devices:', err)
    }
  }

  const loadGroups = async () => {
    try {
      const response = await api.get('/groups')
      setGroups(response.data)
    } catch (err) {
      console.error('Failed to load groups:', err)
    }
  }

  const groupName = (id: number | null) =>
    id == null ? null : groups.find((g) => g.id === id)?.name || null

  const assignGroup = async (device: Device, groupId: number | null) => {
    try {
      await api.put(`/devices/${device.id}`, { group_id: groupId })
      setDevices((prev) =>
        prev.map((d) => (d.id === device.id ? { ...d, group_id: groupId } : d))
      )
      loadGroups()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao alterar o grupo do dispositivo' })
    }
  }

  const setStatusFilter = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('status')
    else next.set('status', value)
    setSearchParams(next, { replace: true })
  }

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (statusFilter === 'online' && !d.is_online) return false
      if (statusFilter === 'offline' && d.is_online) return false
      if (statusFilter === 'locked' && d.status !== 'locked') return false
      if (groupFilter === 'none' && d.group_id != null) return false
      if (groupFilter !== 'all' && groupFilter !== 'none' && String(d.group_id) !== groupFilter)
        return false
      return true
    })
  }, [devices, statusFilter, groupFilter])

  const generateToken = async () => {
    try {
      const response = await api.get('/devices/enrollment-token')
      setEnrollToken(response.data.enrollment_token)
      setEnrollDeviceId(response.data.id ?? null)
      setEnrollDialog(true)
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao gerar token' })
    }
  }

  // While the QR dialog is open, watch for the device to finish enrolling, then
  // close the dialog and refresh the list automatically.
  useEffect(() => {
    if (!enrollDialog || enrollDeviceId == null) return
    const interval = setInterval(async () => {
      try {
        const response = await api.get('/devices')
        setDevices(response.data)
        const enrolled = response.data.find(
          (d: Device) => d.id === enrollDeviceId && d.status !== 'pending'
        )
        if (enrolled) {
          setEnrollDialog(false)
          setEnrollDeviceId(null)
          setAlert({
            type: 'success',
            message: `Dispositivo ${enrolled.asset_id || `MDM-${enrolled.id}`} registrado`,
          })
        }
      } catch (err) {
        console.error('Failed to poll enrollment:', err)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [enrollDialog, enrollDeviceId])

  const lockDevice = async (id: number) => {
    try {
      await api.post(`/devices/${id}/lock`)
      setAlert({ type: 'success', message: 'Comando de bloqueio enviado' })
      loadDevices()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao bloquear dispositivo' })
    }
  }

  const locateDevice = async (id: number) => {
    try {
      await api.post(`/devices/${id}/locate`)
      setAlert({ type: 'success', message: 'Solicitação de localização enviada' })
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao localizar dispositivo' })
    }
  }

  const deleteDevice = async (device: Device) => {
    const label = device.asset_id || `MDM-${device.id}`
    if (device.is_online) {
      if (
        !confirm(
          `Remover ${label}?\n\nO MDM será desvinculado do aparelho (sai do kiosk, remove o Device Owner) e ele volta ao uso normal. O dispositivo será removido da lista assim que confirmar.`
        )
      )
        return
      try {
        const res = await api.delete(`/devices/${device.id}`)
        if (res.data?.pending) {
          setAlert({
            type: 'success',
            message: 'Liberação solicitada. O dispositivo será removido assim que confirmar.',
          })
          loadDevices()
          // Poll until the backend removes it (after the agent acks the release).
          const started = Date.now()
          const iv = setInterval(async () => {
            try {
              const r = await api.get('/devices')
              setDevices(r.data)
              if (!r.data.find((d: Device) => d.id === device.id) || Date.now() - started > 60000) {
                clearInterval(iv)
              }
            } catch {
              /* keep polling */
            }
          }, 3000)
        } else {
          setAlert({ type: 'success', message: 'Dispositivo removido' })
          loadDevices()
        }
      } catch (err) {
        setAlert({ type: 'error', message: 'Falha ao remover dispositivo' })
      }
    } else {
      if (
        !confirm(
          `${label} está offline — não dá para desvincular o MDM remotamente agora.\n\nRemover apenas o registro do painel? O aparelho continuará como Device Owner até ser liberado pelo app (botão "Remover MDM") ou via adb.`
        )
      )
        return
      try {
        await api.delete(`/devices/${device.id}?force=true`)
        setAlert({
          type: 'success',
          message: 'Registro removido. Libere o aparelho pelo app (Remover MDM) ou via adb.',
        })
        loadDevices()
      } catch (err) {
        setAlert({ type: 'error', message: 'Falha ao remover dispositivo' })
      }
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'enrolled':
        return 'success'
      case 'locked':
      case 'releasing':
        return 'warning'
      case 'wiped':
        return 'error'
      default:
        return 'default'
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Dispositivos</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={generateToken}>
          Novo Enrollment
        </Button>
      </Box>

      {alert && (
        <Alert
          severity={alert.type}
          onClose={() => setAlert(null)}
          sx={{ mb: 2 }}
        >
          {alert.message}
        </Alert>
      )}

      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="all">Todos</MenuItem>
            <MenuItem value="online">Online</MenuItem>
            <MenuItem value="offline">Offline</MenuItem>
            <MenuItem value="locked">Bloqueados</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Grupo</InputLabel>
          <Select
            label="Grupo"
            value={groupFilter}
            onChange={(e: SelectChangeEvent) => setGroupFilter(e.target.value)}
          >
            <MenuItem value="all">Todos os grupos</MenuItem>
            <MenuItem value="none">Sem grupo</MenuItem>
            {groups.map((g) => (
              <MenuItem key={g.id} value={String(g.id)}>
                {g.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Dispositivo</TableCell>
                  <TableCell>Grupo</TableCell>
                  <TableCell>Modelo</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Online</TableCell>
                  <TableCell>Última vez online</TableCell>
                  <TableCell>Bateria</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <Typography color="text.secondary">
                        Nenhum dispositivo
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDevices.map((device) => (
                    <TableRow key={device.id} hover>
                      <TableCell>
                        <Chip label={device.asset_id || `MDM-${device.id}`} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {device.name || device.device_id.slice(0, 12)}
                      </TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          variant="standard"
                          displayEmpty
                          value={device.group_id != null ? String(device.group_id) : ''}
                          onChange={(e: SelectChangeEvent) =>
                            assignGroup(device, e.target.value ? Number(e.target.value) : null)
                          }
                          renderValue={(v) =>
                            v ? groupName(Number(v)) || '-' : <em>Sem grupo</em>
                          }
                          sx={{ minWidth: 120 }}
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
                      </TableCell>
                      <TableCell>
                        {device.manufacturer} {device.model}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={device.status}
                          size="small"
                          color={getStatusColor(device.status)}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={device.is_online ? 'Online' : 'Offline'}
                          size="small"
                          color={device.is_online ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {lastOnlineText(device.last_seen)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {device.battery_level != null ? `${device.battery_level}%` : '-'}
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Ver detalhes">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/devices/${device.id}`)}
                          >
                            <Visibility />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Bloquear">
                          <IconButton
                            size="small"
                            onClick={() => lockDevice(device.id)}
                          >
                            <Lock />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Localizar">
                          <IconButton
                            size="small"
                            onClick={() => locateDevice(device.id)}
                          >
                            <LocationOn />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remover">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => deleteDevice(device)}
                          >
                            <Delete />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={enrollDialog} onClose={() => setEnrollDialog(false)}>
        <DialogTitle>Token de Enrollment</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Escaneie o QR Code no app do agente MDM (botão "Escanear QR") ou use o token abaixo:
          </Typography>
          {enrollToken && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
              <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 1, border: '1px solid', borderColor: 'grey.300' }}>
                <QRCodeCanvas value={enrollToken} size={200} level="M" />
              </Box>
            </Box>
          )}
          <Box
            sx={{
              p: 2,
              bgcolor: 'grey.100',
              borderRadius: 1,
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography sx={{ fontFamily: 'monospace', flex: 1 }}>
              {enrollToken}
            </Typography>
            <IconButton
              size="small"
              onClick={() => navigator.clipboard.writeText(enrollToken)}
            >
              <ContentCopy />
            </IconButton>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnrollDialog(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
