import { useState, useEffect } from 'react'
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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Alert,
  Tooltip,
  Checkbox,
  FormControlLabel,
  FormGroup,
  InputAdornment,
  Skeleton,
} from '@mui/material'
import {
  Add,
  Delete,
  DevicesOther,
  Edit,
  Visibility,
  VisibilityOff,
  Block,
  CheckCircleOutline,
  Fullscreen,
  GppMaybeOutlined,
} from '@mui/icons-material'
import api from '../services/api'
import { Policy, Device } from '../types'
import PageHeader from '../components/PageHeader'
import { ToneChip } from '../components/StatusChip'
import type { Tone } from '../utils/labels'

const POLICY_TYPES = [
  { value: 'app_allowlist', label: 'App Allowlist (só esses apps)' },
  { value: 'app_blocklist', label: 'App Blocklist (bloquear esses apps)' },
  { value: 'kiosk', label: 'Kiosk Mode' },
  { value: 'restrictions', label: 'Restrições do Dispositivo' },
]

const TYPE_STYLE: Record<string, { label: string; tone: Tone; icon: React.ReactElement }> = {
  app_allowlist: { label: 'Apps permitidos', tone: 'success', icon: <CheckCircleOutline /> },
  app_blocklist: { label: 'Apps bloqueados', tone: 'error', icon: <Block /> },
  kiosk: { label: 'Modo kiosk', tone: 'info', icon: <Fullscreen /> },
  restrictions: { label: 'Restrições', tone: 'warning', icon: <GppMaybeOutlined /> },
}

// O que a política contém, em palavras. Antes só contava app_list, então "Kiosk" e
// "Restrições" apareciam como "0 app(s)" mesmo estando configuradas.
function scopeSummary(p: Policy): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  switch (p.policy_type) {
    case 'app_allowlist':
      return plural(p.app_list?.length ?? 0, 'app permitido', 'apps permitidos')
    case 'app_blocklist':
      return plural(p.app_list?.length ?? 0, 'app bloqueado', 'apps bloqueados')
    case 'kiosk': {
      const apps = p.kiosk_apps?.length ?? 0
      const links = p.kiosk_web_links?.length ?? 0
      return `${plural(apps, 'app', 'apps')} · ${plural(links, 'site', 'sites')}`
    }
    case 'restrictions': {
      const flags = [p.camera_disabled, p.screenshot_disabled, p.usb_disabled, p.wifi_config_disabled, p.bluetooth_disabled, p.install_apps_disabled, p.uninstall_apps_disabled, p.factory_reset_disabled]
      return plural(flags.filter(Boolean).length, 'restrição ativa', 'restrições ativas')
    }
    default:
      return '—'
  }
}

export default function Policies() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [appliedTo, setAppliedTo] = useState<Record<number, number>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [assignTarget, setAssignTarget] = useState<Policy | null>(null)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showKioskPin, setShowKioskPin] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    policy_type: 'app_allowlist',
    app_list: '',
    kiosk_apps: '',
    kiosk_web_links: '',
    kiosk_pin: '',
    camera_disabled: false,
    screenshot_disabled: false,
    usb_disabled: false,
    install_apps_disabled: false,
  })

  const parseWebLinks = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [first, ...rest] = line.split('|')
        if (rest.length > 0) {
          return { label: first.trim(), url: rest.join('|').trim() }
        }
        return { label: first.trim(), url: first.trim() }
      })
      .filter((l) => l.url)

  useEffect(() => {
    loadPolicies()
  }, [])

  const openAssign = async (policy: Policy) => {
    setAssignTarget(policy)
    setSelectedDeviceIds([])
    try {
      const [devicesRes, assignmentsRes] = await Promise.all([
        api.get('/devices'),
        api.get(`/policies/${policy.id}/assignments`),
      ])
      setDevices(devicesRes.data)
      setSelectedDeviceIds(assignmentsRes.data.device_ids || [])
    } catch (err) {
      console.error('Failed to load devices/assignments:', err)
    }
  }

  const toggleDevice = (deviceId: number) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId) ? prev.filter((d) => d !== deviceId) : [...prev, deviceId]
    )
  }

  const assignPolicy = async () => {
    if (!assignTarget) return
    try {
      await api.post(`/policies/${assignTarget.id}/assign`, { device_ids: selectedDeviceIds })
      setAlert({ type: 'success', message: 'Política atribuída aos dispositivos selecionados' })
      setAssignTarget(null)
      loadPolicies()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao atribuir política' })
    }
  }

  const loadPolicies = async () => {
    try {
      const response = await api.get('/policies')
      setPolicies(response.data)
      loadAppliedCounts(response.data)
    } catch (err) {
      console.error('Failed to load policies:', err)
    }
  }

  // Em quantos aparelhos cada política está aplicada (uma consulta por política; são poucas).
  const loadAppliedCounts = async (list: Policy[]) => {
    const entries = await Promise.all(
      list.map(async (p) => {
        try {
          const r = await api.get(`/policies/${p.id}/assignments`)
          return [p.id, new Set<number>(r.data.device_ids || []).size] as const
        } catch {
          return [p.id, -1] as const
        }
      })
    )
    setAppliedTo(Object.fromEntries(entries))
  }

  const openCreate = () => {
    resetForm()
    setEditingId(null)
    setDialogOpen(true)
  }

  const openEdit = (policy: Policy) => {
    setForm({
      name: policy.name,
      description: policy.description || '',
      policy_type: policy.policy_type,
      app_list: (policy.app_list || []).join(', '),
      kiosk_apps: (policy.kiosk_apps || []).join(', '),
      kiosk_web_links: (policy.kiosk_web_links || [])
        .map((l) => `${l.label} | ${l.url}`)
        .join('\n'),
      kiosk_pin: policy.kiosk_pin || '',
      camera_disabled: policy.camera_disabled,
      screenshot_disabled: policy.screenshot_disabled,
      usb_disabled: policy.usb_disabled,
      install_apps_disabled: policy.install_apps_disabled,
    })
    setShowKioskPin(false)
    setEditingId(policy.id)
    setDialogOpen(true)
  }

  const savePolicy = async () => {
    if (form.policy_type === 'kiosk' && form.kiosk_pin && !/^\d{4,8}$/.test(form.kiosk_pin)) {
      setAlert({ type: 'error', message: 'O PIN do kiosk deve ter de 4 a 8 dígitos' })
      return
    }
    try {
      const payload = {
        name: form.name,
        description: form.description,
        policy_type: form.policy_type,
        app_list: form.app_list ? form.app_list.split(',').map((a) => a.trim()) : undefined,
        kiosk_apps: form.kiosk_apps ? form.kiosk_apps.split(',').map((a) => a.trim()) : undefined,
        kiosk_web_links:
          form.policy_type === 'kiosk' ? parseWebLinks(form.kiosk_web_links) : undefined,
        kiosk_pin: form.policy_type === 'kiosk' ? form.kiosk_pin : undefined,
        kiosk_enabled: form.policy_type === 'kiosk',
        camera_disabled: form.camera_disabled,
        screenshot_disabled: form.screenshot_disabled,
        usb_disabled: form.usb_disabled,
        install_apps_disabled: form.install_apps_disabled,
      }
      if (editingId) {
        await api.put(`/policies/${editingId}`, payload)
        setAlert({ type: 'success', message: 'Política atualizada com sucesso' })
      } else {
        await api.post('/policies', payload)
        setAlert({ type: 'success', message: 'Política criada com sucesso' })
      }
      setDialogOpen(false)
      setEditingId(null)
      resetForm()
      loadPolicies()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao salvar política' })
    }
  }

  const deletePolicy = async (id: number) => {
    if (!confirm('Remover esta política?')) return
    try {
      await api.delete(`/policies/${id}`)
      setAlert({ type: 'success', message: 'Política removida' })
      loadPolicies()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao remover política' })
    }
  }

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      policy_type: 'app_allowlist',
      app_list: '',
      kiosk_apps: '',
      kiosk_web_links: '',
      kiosk_pin: '',
      camera_disabled: false,
      screenshot_disabled: false,
      usb_disabled: false,
      install_apps_disabled: false,
    })
    setShowKioskPin(false)
  }

  const getPolicyTypeLabel = (type: string) => {
    return POLICY_TYPES.find((t) => t.value === type)?.label || type
  }

  return (
    <Box>
      <PageHeader
        title="Políticas"
        subtitle="Regras aplicadas aos aparelhos: apps, kiosk e restrições"
        actions={
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            Nova política
          </Button>
        }
      />

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Política</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Conteúdo</TableCell>
                <TableCell>Aplicada a</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {policies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    <Typography sx={{ fontWeight: 600 }}>Nenhuma política criada</Typography>
                    <Typography variant="body2" color="text.secondary">Crie a primeira pelo botão acima.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                policies.map((policy) => {
                  const style = TYPE_STYLE[policy.policy_type]
                  const count = appliedTo[policy.id]
                  return (
                    <TableRow key={policy.id} hover>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 600 }}>{policy.name}</Typography>
                          {!policy.is_active && <ToneChip label="Inativa" tone="default" />}
                        </Box>
                        {policy.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {policy.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {style ? (
                          <ToneChip label={style.label} tone={style.tone} icon={style.icon} />
                        ) : (
                          <Chip label={getPolicyTypeLabel(policy.policy_type)} size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{scopeSummary(policy)}</TableCell>
                      <TableCell>
                        {count === undefined ? (
                          <Skeleton width={90} />
                        ) : count < 0 ? (
                          '—'
                        ) : count === 0 ? (
                          <Typography variant="body2" color="text.disabled">Nenhum aparelho</Typography>
                        ) : (
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {count} {count === 1 ? 'dispositivo' : 'dispositivos'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Button size="small" startIcon={<DevicesOther />} onClick={() => openAssign(policy)} sx={{ mr: 0.5 }}>
                          Atribuir
                        </Button>
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => openEdit(policy)} aria-label="Editar política">
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir">
                          <IconButton
                            size="small"
                            onClick={() => deletePolicy(policy.id)}
                            aria-label="Excluir política"
                            sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Editar Política' : 'Nova Política'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Descrição"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            select
            label="Tipo de Política"
            value={form.policy_type}
            onChange={(e) => setForm({ ...form, policy_type: e.target.value })}
            margin="normal"
          >
            {POLICY_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </TextField>

          {(form.policy_type === 'app_allowlist' || form.policy_type === 'app_blocklist') && (
            <TextField
              fullWidth
              label="Lista de Apps (pacotes separados por vírgula)"
              placeholder="com.whatsapp, com.google.android.gm"
              value={form.app_list}
              onChange={(e) => setForm({ ...form, app_list: e.target.value })}
              margin="normal"
              multiline
              rows={3}
            />
          )}

          {form.policy_type === 'kiosk' && (
            <>
              <TextField
                fullWidth
                label="Apps do Kiosk (pacotes separados por vírgula)"
                placeholder="com.whatsapp"
                value={form.kiosk_apps}
                onChange={(e) => setForm({ ...form, kiosk_apps: e.target.value })}
                margin="normal"
                multiline
                rows={3}
              />
              <TextField
                fullWidth
                label="Sites permitidos (um por linha: Nome | https://site)"
                placeholder={'Sistema de Chamados | https://chamados.empresa.com\nIntranet | https://intranet.empresa.com'}
                value={form.kiosk_web_links}
                onChange={(e) => setForm({ ...form, kiosk_web_links: e.target.value })}
                margin="normal"
                multiline
                rows={3}
              />
              <TextField
                fullWidth
                label="PIN para sair do kiosk (4 a 8 dígitos)"
                helperText="Aplicado a todos os coletores atribuídos a esta política"
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
                value={form.kiosk_pin}
                onChange={(e) =>
                  setForm({ ...form, kiosk_pin: e.target.value.replace(/\D/g, '') })
                }
                margin="normal"
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={savePolicy} disabled={!form.name}>
            {editingId ? 'Salvar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!assignTarget} onClose={() => setAssignTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Atribuir "{assignTarget?.name}" a dispositivos</DialogTitle>
        <DialogContent>
          {devices.length === 0 ? (
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Nenhum dispositivo cadastrado.
            </Typography>
          ) : (
            <FormGroup>
              {devices.map((dev) => (
                <FormControlLabel
                  key={dev.id}
                  control={
                    <Checkbox
                      checked={selectedDeviceIds.includes(dev.id)}
                      onChange={() => toggleDevice(dev.id)}
                    />
                  }
                  label={
                    `${dev.asset_id ? dev.asset_id + ' — ' : ''}${
                      dev.name ||
                      `${dev.manufacturer || ''} ${dev.model || ''}`.trim() ||
                      dev.device_id
                    }`
                  }
                />
              ))}
            </FormGroup>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignTarget(null)}>Cancelar</Button>
          <Button variant="contained" onClick={assignPolicy}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
