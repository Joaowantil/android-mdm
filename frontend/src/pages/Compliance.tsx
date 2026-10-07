import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Alert,
} from '@mui/material'
import api from '../services/api'
import { getErrorMessage } from '../utils/errors'

interface Violation {
  device_pk: number
  device_id: string
  device_name: string | null
  policy_id: number
  policy_name: string
  violating_apps: string[]
}

export default function CompliancePage() {
  const navigate = useNavigate()
  const [violations, setViolations] = useState<Violation[]>([])
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/compliance/blocklist-violations')
      .then((res) => setViolations(res.data))
      .catch((err) =>
        setAlert({ type: 'error', message: getErrorMessage(err, 'Falha ao carregar conformidade') })
      )
      .finally(() => setLoading(false))
  }, [])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Conformidade de apps
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Dispositivos que têm uma política de bloqueio de apps atribuída e
        reportaram, no último contato, pelo menos um desses apps instalado.
        Só cobre políticas de <strong>bloqueio</strong> - um relatório
        equivalente para listas de permissão exigiria uma mudança no agente
        (hoje o heartbeat reporta todo pacote do sistema, não só os apps que
        a pessoa realmente usa, o que geraria muito ruído no relatório).
      </Typography>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {!loading && violations.length === 0 && !alert && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Nenhuma violação encontrada - todos os dispositivos com política de
          bloqueio estão em conformidade.
        </Alert>
      )}

      {violations.length > 0 && (
        <Card>
          <CardContent sx={{ pb: '8px !important' }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Dispositivo</TableCell>
                    <TableCell>Política</TableCell>
                    <TableCell>Apps encontrados (bloqueados)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {violations.map((v) => (
                    <TableRow
                      key={`${v.device_pk}-${v.policy_id}`}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/devices/${v.device_pk}`)}
                    >
                      <TableCell>{v.device_name || v.device_id}</TableCell>
                      <TableCell>{v.policy_name}</TableCell>
                      <TableCell>
                        {v.violating_apps.map((app) => (
                          <Chip key={app} label={app} size="small" color="error" sx={{ mr: 0.5, mb: 0.5 }} />
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
