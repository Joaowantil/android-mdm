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
  Chip,
  IconButton,
  Alert,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  Checkbox,
} from '@mui/material'
import { Add, Delete, Edit, Devices as DevicesIcon } from '@mui/icons-material'
import api from '../services/api'
import { Group, Device } from '../types'

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Group | null>(null)
  const [name, setName] = useState('')
  const [devices, setDevices] = useState<Device[]>([])
  const [manageTarget, setManageTarget] = useState<Group | null>(null)

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    try {
      const response = await api.get('/groups')
      setGroups(response.data)
    } catch {
      setAlert({ type: 'error', message: 'Falha ao carregar grupos' })
    }
  }

  const openCreate = () => {
    setEditTarget(null)
    setName('')
    setDialogOpen(true)
  }

  const openEdit = (group: Group) => {
    setEditTarget(group)
    setName(group.name)
    setDialogOpen(true)
  }

  const save = async () => {
    try {
      if (editTarget) {
        await api.put(`/groups/${editTarget.id}`, { name })
        setAlert({ type: 'success', message: 'Grupo atualizado' })
      } else {
        await api.post('/groups', { name })
        setAlert({ type: 'success', message: 'Grupo criado' })
      }
      setDialogOpen(false)
      setName('')
      loadGroups()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setAlert({ type: 'error', message: e.response?.data?.detail || 'Falha ao salvar grupo' })
    }
  }

  const openManage = async (group: Group) => {
    setManageTarget(group)
    try {
      const response = await api.get('/devices')
      setDevices(response.data)
    } catch {
      setAlert({ type: 'error', message: 'Falha ao carregar dispositivos' })
    }
  }

  const toggleDevice = async (device: Device, assign: boolean) => {
    if (!manageTarget) return
    try {
      await api.put(`/devices/${device.id}`, { group_id: assign ? manageTarget.id : null })
      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, group_id: assign ? manageTarget.id : null } : d
        )
      )
      loadGroups()
    } catch {
      setAlert({ type: 'error', message: 'Falha ao atualizar o dispositivo' })
    }
  }

  const deleteGroup = async (group: Group) => {
    if (!confirm(`Excluir o grupo "${group.name}"? Os dispositivos ficarão sem grupo.`)) return
    try {
      await api.delete(`/groups/${group.id}`)
      setAlert({ type: 'success', message: 'Grupo excluído' })
      loadGroups()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setAlert({ type: 'error', message: e.response?.data?.detail || 'Falha ao excluir grupo' })
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Grupos / Operações</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
          Novo Grupo
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
                  <TableCell>Grupo</TableCell>
                  <TableCell>Dispositivos</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      <Typography color="text.secondary">
                        Nenhum grupo criado. Crie grupos para separar operações (ex.: WEB, Controladora).
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((group) => (
                    <TableRow key={group.id} hover>
                      <TableCell>
                        <Typography fontWeight="medium">{group.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={group.device_count} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Gerenciar dispositivos">
                          <IconButton size="small" onClick={() => openManage(group)}>
                            <DevicesIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Renomear">
                          <IconButton size="small" onClick={() => openEdit(group)}>
                            <Edit />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir">
                          <IconButton size="small" color="error" onClick={() => deleteGroup(group)}>
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editTarget ? 'Renomear grupo' : 'Novo grupo'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Nome do grupo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            margin="normal"
            required
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save} disabled={!name.trim()}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={manageTarget !== null}
        onClose={() => setManageTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Dispositivos · {manageTarget?.name}</DialogTitle>
        <DialogContent dividers>
          {devices.length === 0 ? (
            <Typography color="text.secondary">Nenhum dispositivo cadastrado.</Typography>
          ) : (
            <List dense>
              {devices.map((device) => {
                const inThisGroup = device.group_id === manageTarget?.id
                const inOtherGroup = device.group_id != null && !inThisGroup
                const otherName = groups.find((g) => g.id === device.group_id)?.name
                return (
                  <ListItem
                    key={device.id}
                    secondaryAction={
                      <Checkbox
                        edge="end"
                        checked={inThisGroup}
                        onChange={(e) => toggleDevice(device, e.target.checked)}
                      />
                    }
                  >
                    <ListItemText
                      primary={device.name || device.asset_id || device.device_id}
                      secondary={
                        inOtherGroup ? `Atualmente em: ${otherName || '-'}` : undefined
                      }
                    />
                  </ListItem>
                )
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageTarget(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
