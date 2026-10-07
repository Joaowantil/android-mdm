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
  Chip,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material'
import { Logout as RevokeIcon } from '@mui/icons-material'
import api from '../services/api'
import { getErrorMessage } from '../utils/errors'

interface SessionEntry {
  id: number
  user_id: number
  user_email: string | null
  created_at: string | null
  last_seen_at: string | null
  ip_address: string | null
  user_agent: string | null
  is_current: boolean
}

function shortUserAgent(ua: string | null): string {
  if (!ua) return '-'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Edge')) return 'Edge'
  return ua.slice(0, 30)
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  const loadSessions = async () => {
    try {
      const res = await api.get('/sessions')
      setSessions(res.data)
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao carregar sessões') })
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const revoke = async (session: SessionEntry) => {
    const label = session.user_email || `usuário ${session.user_id}`
    const warning = session.is_current
      ? `Esta é a SUA sessão atual - revogar vai te desconectar agora. Continuar?`
      : `Revogar a sessão de ${label}? A pessoa será desconectada imediatamente.`
    if (!window.confirm(warning)) return
    try {
      await api.delete(`/sessions/${session.id}`)
      setAlert({ type: 'success', message: 'Sessão revogada' })
      if (session.is_current) {
        // We just logged ourselves out server-side - clear the local token too so
        // the UI doesn't sit there pretending we're still authenticated.
        localStorage.removeItem('mdm_token')
        window.location.href = '/'
        return
      }
      loadSessions()
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao revogar sessão') })
    }
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Sessões ativas
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Todos os logins ativos no painel agora. Revogar uma sessão desconecta
        a pessoa imediatamente, sem esperar o token expirar sozinho - útil se
        um notebook for roubado ou alguém sair da empresa.
      </Typography>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Usuário</TableCell>
                <TableCell>Login em</TableCell>
                <TableCell>Última atividade</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>Navegador</TableCell>
                <TableCell align="right">Ação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.user_email}
                    {s.is_current && (
                      <Chip label="esta sessão" size="small" color="primary" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    {s.created_at ? new Date(s.created_at).toLocaleString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell>
                    {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell>{s.ip_address || '-'}</TableCell>
                  <TableCell>{shortUserAgent(s.user_agent)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Revogar sessão">
                      <IconButton size="small" color="error" onClick={() => revoke(s)}>
                        <RevokeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Nenhuma sessão ativa
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  )
}
