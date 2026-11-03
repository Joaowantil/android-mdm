import { useState, useEffect, useMemo } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Download, Search } from '@mui/icons-material'
import api from '../services/api'
import { getErrorMessage } from '../utils/errors'
import { exportToCsv } from '../utils/csv'
import { formatDateTime } from '../utils/time'
import { ACTION_OPTIONS, actionInfo, targetLabel } from '../utils/labels'
import PageHeader from '../components/PageHeader'
import { ToneChip } from '../components/StatusChip'

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

const LIMIT = 500

// Quem fez: tentativa de login falho não tem usuário; ações automáticas vêm como "sistema".
function actorLabel(l: AuditLogEntry): string {
  if (l.actor_email === 'sistema') return 'Sistema'
  return l.actor_email || 'Não identificado'
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const params: Record<string, string | number> = { limit: LIMIT }
        if (actionFilter) params.action = actionFilter
        const res = await api.get('/audit-logs', { params })
        setLogs(res.data)
      } catch (err: unknown) {
        setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao carregar log de auditoria') })
      }
    }
    load()
  }, [actionFilter])

  useEffect(() => setPage(0), [actionFilter, search])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return logs
    return logs.filter((l) =>
      [actorLabel(l), l.details, l.ip_address, actionInfo(l.action).label, l.target_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [logs, search])

  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1)
  const safePage = Math.min(page, maxPage)
  const rows = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage)

  const exportCsv = () => {
    exportToCsv(
      `auditoria-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((l) => ({
        data_hora: l.created_at || '',
        usuario: l.actor_email || '',
        papel: l.actor_role || '',
        acao: l.action,
        acao_descricao: actionInfo(l.action).label,
        tipo_alvo: l.target_type || '',
        id_alvo: l.target_id || '',
        detalhes: l.details || '',
        ip: l.ip_address || '',
      }))
    )
  }

  return (
    <Box>
      <PageHeader
        title="Log de auditoria"
        subtitle="Quem fez o quê no sistema: logins, usuários, políticas e comandos aos aparelhos. Somente leitura."
        actions={
          <Button variant="outlined" color="inherit" size="small" startIcon={<Download />} onClick={exportCsv} disabled={filtered.length === 0} sx={{ borderColor: 'divider' }}>
            Exportar CSV
          </Button>
        }
      />

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Buscar por pessoa, detalhe ou IP"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: '1 1 280px', maxWidth: 420, bgcolor: 'background.paper' }}
          InputProps={{ startAdornment: (<InputAdornment position="start"><Search fontSize="small" /></InputAdornment>) }}
        />
        <FormControl size="small" sx={{ minWidth: 240, bgcolor: 'background.paper' }}>
          <InputLabel>Tipo de evento</InputLabel>
          <Select label="Tipo de evento" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <MenuItem value="">Todos os eventos</MenuItem>
            {ACTION_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data e hora</TableCell>
                <TableCell>Quem</TableCell>
                <TableCell>Evento</TableCell>
                <TableCell>Alvo</TableCell>
                <TableCell>Detalhes</TableCell>
                <TableCell>IP</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((l) => {
                const a = actionInfo(l.action)
                return (
                  <TableRow key={l.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                      {formatDateTime(l.created_at, true)}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{actorLabel(l)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <ToneChip label={a.label} tone={a.tone} />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{targetLabel(l.target_type, l.target_id)}</TableCell>
                    <TableCell sx={{ minWidth: 260 }}>{l.details || '—'}</TableCell>
                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{l.ip_address || '—'}</TableCell>
                  </TableRow>
                )
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography sx={{ fontWeight: 600 }}>Nenhum registro encontrado</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {filtered.length > 0 && (
          <TablePagination
            component="div"
            count={filtered.length}
            page={safePage}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0) }}
            rowsPerPageOptions={[25, 50, 100]}
            labelRowsPerPage="Por página"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            sx={{ borderTop: 1, borderColor: 'divider' }}
          />
        )}
      </Card>
      {logs.length >= LIMIT && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Mostrando os {LIMIT} registros mais recentes. Use o filtro ou exporte para ver recortes específicos.
        </Typography>
      )}
    </Box>
  )
}
