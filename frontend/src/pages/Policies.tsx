import { useState, useEffect } from 'react'
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
} from '@mui/material'
import { Add, Delete, Edit } from '@mui/icons-material'
import api from '../services/api'
import { Policy } from '../types'

const POLICY_TYPES = [
  { value: 'app_allowlist', label: 'App Allowlist (só esses apps)' },
  { value: 'app_blocklist', label: 'App Blocklist (bloquear esses apps)' },
  { value: 'kiosk', label: 'Kiosk Mode' },
  { value: 'restrictions', label: 'Restrições do Dispositivo' },
]

export default function Policies() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    policy_type: 'app_allowlist',
    app_list: '',
    kiosk_apps: '',
    camera_disabled: false,
    screenshot_disabled: false,
    usb_disabled: false,
    install_apps_disabled: false,
  })

  useEffect(() => {
    loadPolicies()
  }, [])

  const loadPolicies = async () => {
    try {
      const response = await api.get('/policies')
      setPolicies(response.data)
    } catch (err) {
      console.error('Failed to load policies:', err)
    }
  }

  const createPolicy = async () => {
    try {
      const payload = {
        name: form.name,
        description: form.description,
        policy_type: form.policy_type,
        app_list: form.app_list ? form.app_list.split(',').map((a) => a.trim()) : undefined,
        kiosk_apps: form.kiosk_apps ? form.kiosk_apps.split(',').map((a) => a.trim()) : undefined,
        kiosk_enabled: form.policy_type === 'kiosk',
        camera_disabled: form.camera_disabled,
        screenshot_disabled: form.screenshot_disabled,
        usb_disabled: form.usb_disabled,
        install_apps_disabled: form.install_apps_disabled,
      }
      await api.post('/policies', payload)
      setAlert({ type: 'success', message: 'Política criada com sucesso' })
      setDialogOpen(false)
      resetForm()
      loadPolicies()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao criar política' })
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
      camera_disabled: false,
      screenshot_disabled: false,
      usb_disabled: false,
      install_apps_disabled: false,
    })
  }

  const getPolicyTypeLabel = (type: string) => {
    return POLICY_TYPES.find((t) => t.value === type)?.label || type
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Políticas</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setDialogOpen(true)}
        >
          Nova Política
        </Button>
      </Box>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Apps</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {policies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary">
                        Nenhuma política criada
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  policies.map((policy) => (
                    <TableRow key={policy.id} hover>
                      <TableCell>
                        <Typography fontWeight="medium">{policy.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {policy.description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getPolicyTypeLabel(policy.policy_type)}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {policy.app_list?.length || 0} app(s)
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={policy.is_active ? 'Ativa' : 'Inativa'}
                          size="small"
                          color={policy.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Remover">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => deletePolicy(policy.id)}
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nova Política</DialogTitle>
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
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={createPolicy} disabled={!form.name}>
            Criar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
