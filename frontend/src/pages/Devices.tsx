import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box,
  Card,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Menu,
  FormControl,
  InputLabel,
  TextField,
  Checkbox,
  Toolbar,
  Divider,
  InputAdornment,
  ListItemIcon,
  TablePagination,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { SelectChangeEvent } from '@mui/material/Select'
import {
  Lock,
  Delete,
  LocationOn,
  Add,
  ContentCopy,
  Visibility,
  RestartAlt,
  Message,
  Download,
  MoreVert,
  Search,
} from '@mui/icons-material'
import { QRCodeCanvas } from 'qrcode.react'
import api from '../services/api'
import { Device, Group } from '../types'
import PageHeader from '../components/PageHeader'
import BatteryIndicator from '../components/BatteryIndicator'
import { StatusChip, OnlineIndicator } from '../components/StatusChip'
import { getErrorMessage } from '../utils/errors'
import { exportToCsv } from '../utils/csv'

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [enrollDialog, setEnrollDialog] = useState(false)
  const [enrollToken, setEnrollToken] = useState('')
  const [enrollDeviceId, setEnrollDeviceId] = useState<number | null>(null)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [selected, setSelected] = useState<number[]>([])
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
    const query = searchText.trim().toLowerCase()
    return devices.filter((d) => {
      if (statusFilter === 'online' && !d.is_online) return false
      if (statusFilter === 'offline' && d.is_online) return false
      if (statusFilter === 'locked' && d.status !== 'locked') return false
      if (groupFilter === 'none' && d.group_id != null) return false
      if (groupFilter !== 'all' && groupFilter !== 'none' && String(d.group_id) !== groupFilter)
        return false
      if (query) {
        const haystack = [
          d.name,
          groupName(d.group_id),
          d.asset_id,
          d.device_id,
          d.model,
          d.manufacturer,
          d.serial_number,
          d.wifi_ssid,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [devices, groups, statusFilter, groupFilter, searchText])

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
            message: `Dispositivo ${enrolled.asset_id || `ARZ-${enrolled.id}`} registrado`,
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

  const rebootDevice = async (id: number) => {
    if (!window.confirm('Reiniciar este dispositivo agora?')) return
    try {
      await api.post(`/devices/${id}/reboot`)
      setAlert({ type: 'success', message: 'Comando de reinicialização enviado' })
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao reiniciar dispositivo' })
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

  const [messageTarget, setMessageTarget] = useState<Device | null>(null)
  const [messageForm, setMessageForm] = useState({ title: 'Aviso', message: '' })

  const sendMessage = async () => {
    if (!messageTarget) return
    try {
      await api.post(`/devices/${messageTarget.id}/message`, messageForm)
      setAlert({ type: 'success', message: 'Mensagem enviada ao dispositivo' })
      setMessageTarget(null)
      setMessageForm({ title: 'Aviso', message: '' })
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao enviar mensagem') })
    }
  }

  const [bulkMessageOpen, setBulkMessageOpen] = useState(false)

  const sendBulkMessage = async () => {
    if (selected.length === 0) return
    const results = await Promise.allSettled(
      selected.map((id) => api.post(`/devices/${id}/message`, messageForm))
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    setAlert({
      type: failed === 0 ? 'success' : 'error',
      message:
        failed === 0
          ? `Mensagem enviada a ${selected.length} dispositivo(s)`
          : `Enviado a ${selected.length - failed} de ${selected.length} (${failed} falharam)`,
    })
    setBulkMessageOpen(false)
    setMessageForm({ title: 'Aviso', message: '' })
    setSelected([])
  }

  const bulkReboot = async () => {
    if (selected.length === 0) return
    if (!window.confirm(`Reiniciar ${selected.length} dispositivo(s) agora?`)) return
    const results = await Promise.allSettled(selected.map((id) => api.post(`/devices/${id}/reboot`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setAlert({
      type: failed === 0 ? 'success' : 'error',
      message:
        failed === 0
          ? `Comando de reinicialização enviado a ${selected.length} dispositivo(s)`
          : `Enviado a ${selected.length - failed} de ${selected.length} (${failed} falharam - confira suas permissões)`,
    })
    setSelected([])
  }

  const bulkLock = async () => {
    if (selected.length === 0) return
    if (!window.confirm(`Bloquear ${selected.length} dispositivo(s) agora?`)) return
    const results = await Promise.allSettled(selected.map((id) => api.post(`/devices/${id}/lock`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setAlert({
      type: failed === 0 ? 'success' : 'error',
      message:
        failed === 0
          ? `${selected.length} dispositivo(s) bloqueado(s)`
          : `Bloqueado ${selected.length - failed} de ${selected.length} (${failed} falharam - confira suas permissões)`,
    })
    setSelected([])
    loadDevices()
  }

  const toggleSelectOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    if (selected.length === filteredDevices.length) {
      setSelected([])
    } else {
      setSelected(filteredDevices.map((d) => d.id))
    }
  }

  const exportDevicesCsv = () => {
    exportToCsv(
      `dispositivos-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredDevices.map((d) => ({
        asset_id: d.asset_id || '',
        device_id: d.device_id,
        nome: d.name || '',
        modelo: d.model || '',
        fabricante: d.manufacturer || '',
        versao_os: d.os_version || '',
        numero_serie: d.serial_number || '',
        status: d.status,
        online: d.is_online ? 'sim' : 'não',
        ultima_vez_visto: d.last_seen || '',
        bateria_pct: d.battery_level ?? '',
        wifi: d.wifi_ssid || '',
        ip: d.ip_address || '',
        grupo_id: d.group_id ?? '',
      }))
    )
  }

  const deleteDevice = async (device: Device) => {
    const label = device.asset_id || `ARZ-${device.id}`
    if (device.is_online) {
      if (
        !confirm(
          `Remover ${label}?\n\nO Arezzo Device Manager será desvinculado do aparelho (sai do kiosk, remove o Device Owner) e ele volta ao uso normal. O dispositivo será removido da lista assim que confirmar.`
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
          `${label} está offline — não dá para desvincular o Arezzo Device Manager remotamente agora.\n\nRemover apenas o registro do painel? O aparelho continuará como Device Owner até ser liberado pelo app (botão "Remover Arezzo Device Manager") ou via adb.`
        )
      )
        return
      try {
        await api.delete(`/devices/${device.id}?force=true`)
        setAlert({
          type: 'success',
          message: 'Registro removido. Libere o aparelho pelo app (Remover Arezzo Device Manager) ou via adb.',
        })
        loadDevices()
      } catch (err) {
        setAlert({ type: 'error', message: 'Falha ao remover dispositivo' })
      }
    }
  }

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; device: Device } | null>(null)

  // Voltar para a primeira página quando o filtro muda.
  useEffect(() => {
    setPage(0)
  }, [statusFilter, groupFilter, searchText])

  const maxPage = Math.max(0, Math.ceil(filteredDevices.length / rowsPerPage) - 1)
  const safePage = Math.min(page, maxPage)
  const pageDevices = filteredDevices.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage)

  const displayName = (d: Device) =>
    d.name ||
    (d.status === 'pending' ? 'Aguardando cadastro no aparelho' : [d.manufacturer, d.model].filter(Boolean).join(' ')) ||
    d.device_id.slice(0, 8)
  const subtitle = (d: Device) =>
    [
      d.asset_id || `ARZ-${d.id}`,
      // Sem nome cadastrado o modelo já é o título; não repetir.
      d.name ? [d.manufacturer, d.model].filter(Boolean).join(' ') : null,
      d.os_version ? `Android ${d.os_version}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

  const closeMenu = () => setMenu(null)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  const groupSelect = (device: Device) => (
    <Select
      size="small"
      variant="standard"
      disableUnderline
      displayEmpty
      value={device.group_id != null ? String(device.group_id) : ''}
      onClick={stop}
      onChange={(e: SelectChangeEvent) => assignGroup(device, e.target.value ? Number(e.target.value) : null)}
      renderValue={(v) =>
        v ? groupName(Number(v)) || '-' : <Typography component="span" variant="body2" sx={{ color: 'text.disabled' }}>Sem grupo</Typography>
      }
      sx={{ fontSize: '0.875rem', width: 200, borderRadius: 1, '& .MuiSelect-select': { py: 0.5, pl: 1 }, '&:hover': { bgcolor: 'action.hover' } }}
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
  )

  const actionsButton = (device: Device) => (
    <Tooltip title="Ações">
      <IconButton size="small" onClick={(e) => { stop(e); setMenu({ anchor: e.currentTarget, device }) }} aria-label={`Ações de ${displayName(device)}`}>
        <MoreVert fontSize="small" />
      </IconButton>
    </Tooltip>
  )

  const isPending = (d: Device) => d.status === 'pending'

  return (
    <Box>
      <PageHeader
        title="Dispositivos"
        subtitle={`${devices.length} ${devices.length === 1 ? 'dispositivo' : 'dispositivos'} · ${devices.filter((d) => d.is_online).length} online`}
        actions={
          <Button variant="contained" startIcon={<Add />} onClick={generateToken}>
            Cadastrar dispositivo
          </Button>
        }
      />

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar por nome, ID, modelo, série ou Wi-Fi"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          sx={{ flex: '1 1 280px', maxWidth: 420, bgcolor: 'background.paper' }}
          InputProps={{ startAdornment: (<InputAdornment position="start"><Search fontSize="small" /></InputAdornment>) }}
        />
        <FormControl size="small" sx={{ minWidth: 150, bgcolor: 'background.paper' }}>
          <InputLabel>Situação</InputLabel>
          <Select label="Situação" value={statusFilter} onChange={(e: SelectChangeEvent) => setStatusFilter(e.target.value)}>
            <MenuItem value="all">Todas</MenuItem>
            <MenuItem value="online">Online</MenuItem>
            <MenuItem value="offline">Offline</MenuItem>
            <MenuItem value="locked">Bloqueados</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180, bgcolor: 'background.paper' }}>
          <InputLabel>Grupo</InputLabel>
          <Select label="Grupo" value={groupFilter} onChange={(e: SelectChangeEvent) => setGroupFilter(e.target.value)}>
            <MenuItem value="all">Todos os grupos</MenuItem>
            <MenuItem value="none">Sem grupo</MenuItem>
            {groups.map((g) => (
              <MenuItem key={g.id} value={String(g.id)}>
                {g.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="outlined" color="inherit" size="small" startIcon={<Download />} onClick={exportDevicesCsv} disabled={filteredDevices.length === 0} sx={{ borderColor: 'divider' }}>
          Exportar CSV
        </Button>
      </Box>

      {selected.length > 0 && (
        <Toolbar
          variant="dense"
          sx={{ mb: 2, borderRadius: 2, gap: 1, flexWrap: 'wrap', bgcolor: 'primary.main', color: 'primary.contrastText' }}
        >
          <Typography sx={{ flex: 1, fontWeight: 700 }} variant="subtitle2">
            {selected.length} selecionado(s)
          </Typography>
          <Button size="small" color="inherit" startIcon={<RestartAlt />} onClick={bulkReboot}>Reiniciar</Button>
          <Button size="small" color="inherit" startIcon={<Lock />} onClick={bulkLock}>Bloquear</Button>
          <Button size="small" color="inherit" startIcon={<Message />} onClick={() => setBulkMessageOpen(true)}>Mensagem</Button>
          <Button size="small" color="inherit" onClick={() => setSelected([])}>Limpar seleção</Button>
        </Toolbar>
      )}

      <Card>
        {filteredDevices.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 600 }}>Nenhum dispositivo encontrado</Typography>
            <Typography variant="body2" color="text.secondary">
              {devices.length === 0 ? 'Cadastre o primeiro aparelho pelo botão acima.' : 'Ajuste a busca ou os filtros.'}
            </Typography>
          </Box>
        ) : isMobile ? (
          <Box>
            {pageDevices.map((device, i) => (
              <Box
                key={device.id}
                onClick={() => navigate(`/devices/${device.id}`)}
                sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start', cursor: 'pointer', borderTop: i ? 1 : 0, borderColor: 'divider', bgcolor: selected.includes(device.id) ? 'action.selected' : 'transparent' }}
              >
                <Checkbox size="small" sx={{ mt: -0.5, ml: -1 }} checked={selected.includes(device.id)} onClick={stop} onChange={() => toggleSelectOne(device.id)} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 700 }}>{displayName(device)}</Typography>
                  <Typography noWrap variant="caption" color="text.secondary">{subtitle(device)}</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mt: 1 }}>
                    {!isPending(device) && <OnlineIndicator online={device.is_online} lastSeen={device.last_seen} />}
                    {device.status !== 'enrolled' && <StatusChip status={device.status} />}
                    <BatteryIndicator level={device.battery_level} />
                  </Box>
                  <Box onClick={stop} sx={{ mt: 0.75, ml: -1 }}>
                    {groupSelect(device)}
                  </Box>
                </Box>
                {actionsButton(device)}
              </Box>
            ))}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ '& td': { py: 1.25 } }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={filteredDevices.length > 0 && selected.length === filteredDevices.length}
                      indeterminate={selected.length > 0 && selected.length < filteredDevices.length}
                      onChange={toggleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Dispositivo</TableCell>
                  <TableCell>Grupo</TableCell>
                  <TableCell>Situação</TableCell>
                  <TableCell>Bateria</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {pageDevices.map((device) => (
                  <TableRow
                    key={device.id}
                    hover
                    selected={selected.includes(device.id)}
                    onClick={() => navigate(`/devices/${device.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell padding="checkbox" onClick={stop}>
                      <Checkbox size="small" checked={selected.includes(device.id)} onChange={() => toggleSelectOne(device.id)} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{displayName(device)}</Typography>
                      <Typography noWrap variant="caption" color="text.secondary">{subtitle(device)}</Typography>
                    </TableCell>
                    <TableCell onClick={stop}>{groupSelect(device)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                        {!isPending(device) && <OnlineIndicator online={device.is_online} lastSeen={device.last_seen} />}
                        {device.status !== 'enrolled' && <StatusChip status={device.status} />}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <BatteryIndicator level={device.battery_level} />
                    </TableCell>
                    <TableCell align="right" onClick={stop}>
                      <Tooltip title="Ver detalhes">
                        <IconButton size="small" onClick={() => navigate(`/devices/${device.id}`)} aria-label="Ver detalhes">
                          <Visibility fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {actionsButton(device)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {filteredDevices.length > 0 && (
          <TablePagination
            component="div"
            count={filteredDevices.length}
            page={safePage}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0) }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Por página"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            sx={{ borderTop: 1, borderColor: 'divider' }}
          />
        )}
      </Card>

      <Menu
        anchorEl={menu?.anchor ?? null}
        open={!!menu}
        onClose={closeMenu}
        onClick={stop}
        slotProps={{ paper: { sx: { minWidth: 210 } } }}
      >
        <MenuItem onClick={() => { const d = menu!.device; closeMenu(); navigate(`/devices/${d.id}`) }}>
          <ListItemIcon><Visibility fontSize="small" /></ListItemIcon>Ver detalhes
        </MenuItem>
        <MenuItem onClick={() => { const d = menu!.device; closeMenu(); locateDevice(d.id) }}>
          <ListItemIcon><LocationOn fontSize="small" /></ListItemIcon>Localizar
        </MenuItem>
        <MenuItem onClick={() => { const d = menu!.device; closeMenu(); setMessageTarget(d); setMessageForm({ title: 'Aviso', message: '' }) }}>
          <ListItemIcon><Message fontSize="small" /></ListItemIcon>Enviar mensagem
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { const d = menu!.device; closeMenu(); rebootDevice(d.id) }}>
          <ListItemIcon><RestartAlt fontSize="small" /></ListItemIcon>Reiniciar
        </MenuItem>
        <MenuItem onClick={() => { const d = menu!.device; closeMenu(); if (window.confirm('Bloquear este dispositivo agora?')) lockDevice(d.id) }}>
          <ListItemIcon><Lock fontSize="small" /></ListItemIcon>Bloquear
        </MenuItem>
        <Divider />
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { const d = menu!.device; closeMenu(); deleteDevice(d) }}>
          <ListItemIcon sx={{ color: 'inherit' }}><Delete fontSize="small" /></ListItemIcon>Remover dispositivo
        </MenuItem>
      </Menu>

      <Dialog open={enrollDialog} onClose={() => setEnrollDialog(false)}>
        <DialogTitle>Token de Enrollment</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Escaneie o QR Code no app Arezzo Device Manager (botão "Escanear QR") ou use o token abaixo:
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

      <Dialog open={bulkMessageOpen} onClose={() => setBulkMessageOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Enviar mensagem a {selected.length} dispositivo(s)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A mesma mensagem será enviada como pop-up a todos os dispositivos
            selecionados.
          </Typography>
          <TextField
            fullWidth
            label="Título"
            value={messageForm.title}
            onChange={(e) => setMessageForm({ ...messageForm, title: e.target.value })}
            margin="normal"
            inputProps={{ maxLength: 100 }}
          />
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
          <Button onClick={() => setBulkMessageOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={sendBulkMessage} disabled={!messageForm.message.trim()}>
            Enviar a todos
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!messageTarget} onClose={() => setMessageTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Enviar mensagem — {messageTarget?.asset_id || messageTarget?.device_id}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A mensagem aparece como um pop-up na tela do dispositivo, mesmo
            se ele estiver em modo kiosk.
          </Typography>
          <TextField
            fullWidth
            label="Título"
            value={messageForm.title}
            onChange={(e) => setMessageForm({ ...messageForm, title: e.target.value })}
            margin="normal"
            inputProps={{ maxLength: 100 }}
          />
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
          <Button onClick={() => setMessageTarget(null)}>Cancelar</Button>
          <Button variant="contained" onClick={sendMessage} disabled={!messageForm.message.trim()}>
            Enviar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
