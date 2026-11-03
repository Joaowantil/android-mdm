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
  IconButton,
  Alert,
  Tooltip,
  Avatar,
} from '@mui/material'
import { Add, Delete, Key, Block, CheckCircle, Edit } from '@mui/icons-material'
import api from '../services/api'
import { getErrorMessage } from '../utils/errors'
import PageHeader from '../components/PageHeader'
import { ToneChip } from '../components/StatusChip'
import { brand } from '../theme'

interface User {
  id: number
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string | null
}

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'operator', label: 'Operador' },
]

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'operator' })
  const [pwdTarget, setPwdTarget] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ email: '', full_name: '', role: 'operator' })

  const currentEmail = localStorage.getItem('mdm_email')

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const response = await api.get('/users')
      setUsers(response.data)
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao carregar usuários' })
    }
  }

  const createUser = async () => {
    try {
      await api.post('/users', form)
      setAlert({ type: 'success', message: 'Usuário criado com sucesso' })
      setCreateOpen(false)
      setForm({ email: '', password: '', full_name: '', role: 'operator' })
      loadUsers()
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao criar usuário') })
    }
  }

  const changePassword = async () => {
    if (!pwdTarget) return
    try {
      await api.put(`/users/${pwdTarget.id}/password`, { password: newPassword })
      setAlert({ type: 'success', message: `Senha de ${pwdTarget.email} alterada` })
      setPwdTarget(null)
      setNewPassword('')
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao alterar senha') })
    }
  }

  const openEdit = (user: User) => {
    setEditTarget(user)
    setEditForm({ email: user.email, full_name: user.full_name || '', role: user.role })
  }

  const updateUser = async () => {
    if (!editTarget) return
    try {
      await api.put(`/users/${editTarget.id}`, {
        email: editForm.email,
        full_name: editForm.full_name,
        role: editForm.role,
      })
      setAlert({ type: 'success', message: 'Usuário atualizado com sucesso' })
      setEditTarget(null)
      loadUsers()
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao atualizar usuário') })
    }
  }

  const toggleActive = async (user: User) => {
    try {
      await api.put(`/users/${user.id}`, { is_active: !user.is_active })
      setAlert({ type: 'success', message: `Usuário ${!user.is_active ? 'ativado' : 'desativado'}` })
      loadUsers()
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao atualizar usuário') })
    }
  }

  const deleteUser = async (user: User) => {
    if (!confirm(`Excluir o usuário ${user.email}?`)) return
    try {
      await api.delete(`/users/${user.id}`)
      setAlert({ type: 'success', message: 'Usuário excluído' })
      loadUsers()
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao excluir usuário') })
    }
  }

  const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label || role

  return (
    <Box>
      <PageHeader
        title="Usuários"
        subtitle={`${users.length} ${users.length === 1 ? 'usuário' : 'usuários'} com acesso ao painel`}
        actions={
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
            Novo usuário
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
                <TableCell>Usuário</TableCell>
                <TableCell>Perfil</TableCell>
                <TableCell>Situação</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">Nenhum usuário</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const isMe = user.email === currentEmail
                  return (
                    <TableRow key={user.id} hover sx={{ opacity: user.is_active ? 1 : 0.6 }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ width: 36, height: 36, bgcolor: brand.ink, color: brand.teal, fontSize: '0.95rem', fontWeight: 700 }}>
                            {(user.full_name || user.email)[0].toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontWeight: 600 }} noWrap>
                                {user.full_name || user.email}
                              </Typography>
                              {isMe && <ToneChip label="você" tone="info" />}
                            </Box>
                            {user.full_name && (
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                                {user.email}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <ToneChip label={roleLabel(user.role)} tone={user.role === 'admin' ? 'info' : 'default'} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: user.is_active ? 'success.main' : 'text.disabled' }} />
                          <Typography variant="body2" sx={{ fontWeight: 600, color: user.is_active ? 'success.main' : 'text.secondary' }}>
                            {user.is_active ? 'Ativo' : 'Desativado'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => openEdit(user)} aria-label="Editar usuário">
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Alterar senha">
                          <IconButton size="small" onClick={() => { setPwdTarget(user); setNewPassword('') }} aria-label="Alterar senha">
                            <Key fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {!isMe && (
                          <>
                            <Tooltip title={user.is_active ? 'Desativar acesso' : 'Reativar acesso'}>
                              <IconButton size="small" onClick={() => toggleActive(user)} aria-label={user.is_active ? 'Desativar usuário' : 'Reativar usuário'}>
                                {user.is_active ? <Block fontSize="small" /> : <CheckCircle fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Excluir">
                              <IconButton
                                size="small"
                                onClick={() => deleteUser(user)}
                                aria-label="Excluir usuário"
                                sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Novo Usuário</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Nome"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Senha"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            margin="normal"
            required
            helperText="Mínimo 8 caracteres"
          />
          <TextField
            fullWidth
            select
            label="Papel"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            margin="normal"
          >
            {ROLES.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={createUser}
            disabled={!form.email || form.password.length < 8}
          >
            Criar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar usuário</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Nome"
            value={editForm.full_name}
            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            select
            label="Papel"
            value={editForm.role}
            onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            margin="normal"
            disabled={editTarget?.email === currentEmail}
            helperText={
              editTarget?.email === currentEmail
                ? 'Não é possível alterar seu próprio papel'
                : undefined
            }
          >
            {ROLES.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Cancelar</Button>
          <Button variant="contained" onClick={updateUser} disabled={!editForm.email}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!pwdTarget} onClose={() => setPwdTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Alterar senha — {pwdTarget?.email}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Nova senha"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            margin="normal"
            required
            helperText="Mínimo 8 caracteres"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdTarget(null)}>Cancelar</Button>
          <Button variant="contained" onClick={changePassword} disabled={newPassword.length < 8}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
