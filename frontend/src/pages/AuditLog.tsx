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
  Chip,
  TextField,
  MenuItem,
  Alert,
  Button,
  Stack,
} from '@mui/material'
import { Download } from '@mui/icons-material'
import api from '../services/api'
import { getErrorMessage } from '../utils/errors'
import { exportToCsv } from '../utils/csv'

interface AuditLogEntry {
  id: number
  created_at: string | null
  actor_email: string | null
  actor_role: string | null
  action: string
  target_type: string | null
  target_id: string | null
  details: string | null
  ip_address: string | null
}

const ACTION_COLORS: Record<string, 'error' | 'warning' | 'success' | 'info' | 'default'> = {
  'device.wipe': 'error',
  'device.lock': 'warning',
  'device.reboot': 'warning',
  'user.delete': 'error',
  'user.create': 'success',
  'auth.login': 'success',
  'auth.login_failed': 'error',
  'auth.login_blocked': 'error',
  'policy.delete': 'error',
}

function actionColor(action: string) {
  return ACTION_COLORS[action] || 'default'
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [actionFilter, setActionFilter] = useState('')
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  const loadLogs = async () => {
    try {
      const params = actionFilter ? { action: actionFilter } : {}
      const res = await api.get('/audit-logs', { params })
      setLogs(res.data)
    } catch (err: unknown) {
      setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao carregar log de auditoria') })
    }
  }

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter])

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action))).sort()

  const exportCsv = () => {
    exportToCsv(
      `auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
      logs.map((l) => ({
        data_hora: l.created_at || '',
        usuario: l.actor_email || '',
        papel: l.actor_role || '',
        acao: l.action,
        tipo_alvo: l.target_type || '',
        id_alvo: l.target_id || '',
        detalhes: l.details || '',
        ip: l.ip_address || '',
      }))
    )
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Log de auditoria
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Registro de quem fez o quê no sistema - login, gestão de usuários,
        políticas e comandos de dispositivo. Somente leitura.
      </Typography>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            select
            label="Filtrar por ação"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 260 }}
          >
            <MenuItem value="">Todas as ações</MenuItem>
            {uniqueActions.map((a) => (
              <MenuItem key={a} value={a}>
                {a}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Download />}
            onClick={exportCsv}
            disabled={logs.length === 0}
          >
            Exportar CSV
          </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data/hora</TableCell>
                <TableCell>Quem</TableCell>
                <TableCell>Ação</TableCell>
                <TableCell>Alvo</TableCell>
                <TableCell>Detalhes</TableCell>
                <TableCell>IP</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {log.created_at ? new Date(log.created_at).toLocaleString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell>{log.actor_email || '(sem usuário)'}</TableCell>
                  <TableCell>
                    <Chip label={log.action} size="small" color={actionColor(log.action)} />
                  </TableCell>
                  <TableCell>
                    {log.target_type ? `${log.target_type}${log.target_id ? `:${log.target_id}` : ''}` : '-'}
                  </TableCell>
                  <TableCell>{log.details || '-'}</TableCell>
                  <TableCell>{log.ip_address || '-'}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Nenhum registro encontrado
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
