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
import { Add, Delete, Key, Block, CheckCircle } from '@mui/icons-material'
import api from '../services/api'

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
      const e = err as { response?: { data?: { detail?: string } } }
      setAlert({ type: 'error', message: e.response?.data?.detail || 'Falha ao criar usuário' })
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
      const e = err as { response?: { data?: { detail?: string } } }
      setAlert({ type: 'error', message: e.response?.data?.detail || 'Falha ao alterar senha' })
    }
  }

  const toggleActive = async (user: User) => {
    try {
      await api.put(`/users/${user.id}`, { is_active: !user.is_active })
      setAlert({ type: 'success', message: `Usuário ${!user.is_active ? 'ativado' : 'desativado'}` })
      loadUsers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setAlert({ type: 'error', message: e.response?.data?.detail || 'Falha ao atualizar usuário' })
    }
  }

  const deleteUser = async (user: User) => {
    if (!confirm(`Excluir o usuário ${user.email}?`)) return
    try {
      await api.delete(`/users/${user.id}`)
      setAlert({ type: 'success', message: 'Usuário excluído' })
      loadUsers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setAlert({ type: 'error', message: e.response?.data?.detail || 'Falha ao excluir usuário' })
    }
  }

  const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label || role

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Usuários</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
          Novo Usuário
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
                  <TableCell>Email</TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Papel</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary">Nenhum usuário</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Typography fontWeight="medium">{user.email}</Typography>
                        {user.email === currentEmail && (
                          <Typography variant="caption" color="text.secondary">
                            (você)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{user.full_name || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={roleLabel(user.role)}
                          size="small"
                          color={user.role === 'admin' ? 'primary' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={user.is_active ? 'Ativo' : 'Inativo'}
                          size="small"
                          color={user.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Alterar senha">
                          <IconButton size="small" onClick={() => { setPwdTarget(user); setNewPassword('') }}>
                            <Key />
                          </IconButton>
                        </Tooltip>
                        {user.email !== currentEmail && (
                          <>
                            <Tooltip title={user.is_active ? 'Desativar' : 'Ativar'}>
                              <IconButton size="small" onClick={() => toggleActive(user)}>
                                {user.is_active ? <Block /> : <CheckCircle />}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Excluir">
                              <IconButton size="small" color="error" onClick={() => deleteUser(user)}>
                                <Delete />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
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
            disabled={!form.email || form.password.length < 4}
          >
            Criar
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
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdTarget(null)}>Cancelar</Button>
          <Button variant="contained" onClick={changePassword} disabled={newPassword.length < 4}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
