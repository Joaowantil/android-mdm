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
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tooltip,
} from '@mui/material'
import {
  Lock,
  Delete,
  LocationOn,
  Add,
  ContentCopy,
  Visibility,
} from '@mui/icons-material'
import api from '../services/api'
import { Device } from '../types'

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [enrollDialog, setEnrollDialog] = useState(false)
  const [enrollToken, setEnrollToken] = useState('')
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      const response = await api.get('/devices')
      setDevices(response.data)
    } catch (err) {
      console.error('Failed to load devices:', err)
    }
  }

  const generateToken = async () => {
    try {
      const response = await api.get('/devices/enrollment-token')
      setEnrollToken(response.data.enrollment_token)
      setEnrollDialog(true)
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao gerar token' })
    }
  }

  const lockDevice = async (id: number) => {
    try {
      await api.post(`/devices/${id}/lock`)
      setAlert({ type: 'success', message: 'Comando de bloqueio enviado' })
      loadDevices()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao bloquear dispositivo' })
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

  const deleteDevice = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este dispositivo?')) return
    try {
      await api.delete(`/devices/${id}`)
      setAlert({ type: 'success', message: 'Dispositivo removido' })
      loadDevices()
    } catch (err) {
      setAlert({ type: 'error', message: 'Falha ao remover dispositivo' })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'enrolled':
        return 'success'
      case 'locked':
        return 'warning'
      case 'wiped':
        return 'error'
      default:
        return 'default'
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Dispositivos</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={generateToken}>
          Novo Enrollment
        </Button>
      </Box>

      {alert && (
        <Alert
          severity={alert.type}
          onClose={() => setAlert(null)}
          sx={{ mb: 2 }}
        >
          {alert.message}
        </Alert>
      )}

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Dispositivo</TableCell>
                  <TableCell>Modelo</TableCell>
                  <TableCell>OS</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Online</TableCell>
                  <TableCell>Bateria</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="text.secondary">
                        Nenhum dispositivo registrado
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  devices.map((device) => (
                    <TableRow key={device.id} hover>
                      <TableCell>
                        {device.name || device.device_id.slice(0, 12)}
                      </TableCell>
                      <TableCell>
                        {device.manufacturer} {device.model}
                      </TableCell>
                      <TableCell>{device.os_version || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={device.status}
                          size="small"
                          color={getStatusColor(device.status)}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={device.is_online ? 'Online' : 'Offline'}
                          size="small"
                          color={device.is_online ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {device.battery_level != null ? `${device.battery_level}%` : '-'}
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Ver detalhes">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/devices/${device.id}`)}
                          >
                            <Visibility />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Bloquear">
                          <IconButton
                            size="small"
                            onClick={() => lockDevice(device.id)}
                          >
                            <Lock />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Localizar">
                          <IconButton
                            size="small"
                            onClick={() => locateDevice(device.id)}
                          >
                            <LocationOn />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remover">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => deleteDevice(device.id)}
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

      <Dialog open={enrollDialog} onClose={() => setEnrollDialog(false)}>
        <DialogTitle>Token de Enrollment</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Use este token no app do agente MDM para registrar um novo dispositivo:
          </Typography>
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
    </Box>
  )
}
