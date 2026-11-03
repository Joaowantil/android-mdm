import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Grid,
  LinearProgress,
  Typography,
  alpha,
  useTheme,
} from '@mui/material'
import {
  PhoneAndroid,
  CheckCircle,
  CloudOff,
  Lock,
  Refresh,
  BatteryAlert,
  WifiOff,
  HourglassEmpty,
  TaskAlt,
  ChevronRight,
} from '@mui/icons-material'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import api from '../services/api'
import { Device } from '../types'
import PageHeader from '../components/PageHeader'
import BatteryIndicator from '../components/BatteryIndicator'
import { OnlineIndicator } from '../components/StatusChip'
import { relativeTime, parseServerDate } from '../utils/time'

// Limites do bloco "Atenção necessária". Constantes nomeadas para ajustar fácil depois.
const LOW_BATTERY_THRESHOLD = 15 // percent
const LONG_OFFLINE_HOURS = 1
const REFRESH_MS = 30_000
const MAX_ROWS = 5

const modelOf = (d: Device) => [d.manufacturer, d.model].filter(Boolean).join(' ')
// Sem nome cadastrado, o modelo é um título melhor que repetir o ID do ativo.
const deviceName = (d: Device) => d.name || modelOf(d) || d.asset_id || d.device_id.slice(0, 12)
const deviceSub = (d: Device) => [d.asset_id, d.name ? modelOf(d) : null].filter(Boolean).join(' · ')

export default function Dashboard() {
  const theme = useTheme()
  const navigate = useNavigate()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const loadDevices = useCallback(async () => {
    try {
      const response = await api.get('/devices')
      setDevices(response.data)
      setUpdatedAt(new Date())
    } catch (err) {
      console.error('Failed to load devices:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDevices()
    const timer = setInterval(loadDevices, REFRESH_MS)
    return () => clearInterval(timer)
  }, [loadDevices])

  // Aparelho "aguardando cadastro" nunca se comunicou e "apagado" é esperado offline:
  // nenhum dos dois conta como problema de conexão.
  const pending = devices.filter((d) => d.status === 'pending')
  const activeDevices = devices.filter((d) => d.status !== 'pending' && d.status !== 'wiped')
  const online = activeDevices.filter((d) => d.is_online)
  const offline = activeDevices.filter((d) => !d.is_online)
  const locked = devices.filter((d) => d.status === 'locked')

  const lowBattery = activeDevices
    .filter((d) => d.battery_level != null && d.battery_level <= LOW_BATTERY_THRESHOLD)
    .sort((a, b) => (a.battery_level as number) - (b.battery_level as number))

  const longOffline = activeDevices
    .filter((d) => {
      if (d.is_online || !d.last_seen) return false
      return (Date.now() - parseServerDate(d.last_seen).getTime()) / 3_600_000 >= LONG_OFFLINE_HOURS
    })
    .sort((a, b) => parseServerDate(a.last_seen as string).getTime() - parseServerDate(b.last_seen as string).getTime())

  const total = devices.length
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}% da frota` : '—')

  const kpis = [
    { label: 'Total de dispositivos', value: total, sub: pending.length ? `${pending.length} aguardando cadastro` : 'cadastrados', icon: <PhoneAndroid />, tone: theme.palette.primary.main, to: '/devices' },
    { label: 'Online', value: online.length, sub: pct(online.length), icon: <CheckCircle />, tone: theme.palette.success.main, to: '/devices?status=online' },
    { label: 'Offline', value: offline.length, sub: offline.length ? pct(offline.length) : 'nenhum', icon: <CloudOff />, tone: offline.length ? theme.palette.error.main : theme.palette.text.secondary, to: '/devices?status=offline' },
    { label: 'Bloqueados', value: locked.length, sub: locked.length ? pct(locked.length) : 'nenhum', icon: <Lock />, tone: locked.length ? theme.palette.warning.main : theme.palette.text.secondary, to: '/devices?status=locked' },
  ]

  // A rosca usa a MESMA regra dos cartões de cima (online/offline por conectividade), para a
  // mesma tela nunca mostrar dois números diferentes para a mesma coisa. "Bloqueado" tem
  // cartão próprio: um aparelho bloqueado continua online.
  const wiped = devices.filter((d) => d.status === 'wiped')
  const fleetData = [
    { name: 'Online', value: online.length, color: theme.palette.success.main },
    { name: 'Offline', value: offline.length, color: theme.palette.error.main },
    { name: 'Aguardando cadastro', value: pending.length, color: theme.palette.text.disabled },
    { name: 'Apagados', value: wiped.length, color: theme.palette.grey[600] },
  ].filter((x) => x.value > 0)

  const BUCKETS: [string, (n: number) => boolean, string][] = [
    ['0–20%', (n) => n <= 20, theme.palette.error.main],
    ['21–50%', (n) => n > 20 && n <= 50, theme.palette.warning.main],
    ['51–80%', (n) => n > 50 && n <= 80, theme.palette.primary.light],
    ['81–100%', (n) => n > 80, theme.palette.success.main],
  ]
  const withBattery = devices.filter((d) => d.battery_level != null)
  const batteryData = BUCKETS.map(([name, inBucket, color]) => ({
    name,
    color,
    quantidade: withBattery.filter((d) => inBucket(d.battery_level as number)).length,
  }))
  const withoutReading = devices.filter((d) => d.battery_level == null && d.status !== 'pending').length

  const recent = [...activeDevices]
    .filter((d) => d.last_seen)
    .sort((a, b) => parseServerDate(b.last_seen as string).getTime() - parseServerDate(a.last_seen as string).getTime())
    .slice(0, 5)

  const attentionRow = (d: Device, right: React.ReactNode) => (
    <Box
      key={d.id}
      onClick={() => navigate(`/devices/${d.id}`)}
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 1.1, px: 1.5, mx: -1.5, borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
          {deviceName(d)}
        </Typography>
        <Typography noWrap variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {deviceSub(d)}
        </Typography>
      </Box>
      <Box sx={{ flexShrink: 0 }}>{right}</Box>
    </Box>
  )

  const allGood = lowBattery.length === 0 && longOffline.length === 0 && pending.length === 0

  return (
    <Box>
      <PageHeader
        title="Visão geral"
        subtitle={updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString('pt-BR')} · atualiza sozinho a cada 30 s` : 'Carregando…'}
        actions={
          <Button variant="outlined" size="small" startIcon={<Refresh />} onClick={loadDevices}>
            Atualizar
          </Button>
        }
      />
      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid item xs={12} sm={6} md={3} key={k.label}>
            <Card>
              <CardActionArea onClick={() => navigate(k.to)}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2.5 }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: alpha(k.tone, 0.14), color: k.tone, flexShrink: 0 }}>
                    {k.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{k.value}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {k.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {k.sub}
                    </Typography>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}

        {total > 0 && (
          <>
            <Grid item xs={12} md={5}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Situação da frota
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Box sx={{ position: 'relative', width: 190, height: 190 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={fleetData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={fleetData.length > 1 ? 3 : 0} stroke="none" cornerRadius={4}>
                            {fleetData.map((e) => (
                              <Cell key={e.name} fill={e.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
                        <Box>
                          <Typography sx={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{total}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            dispositivos
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.1, minWidth: 170 }}>
                      {fleetData.map((e) => (
                        <Box key={e.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: e.color, flexShrink: 0 }} />
                          <Typography variant="body2" sx={{ flex: 1 }}>
                            {e.name}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {e.value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={7}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                    <Typography variant="h6">Bateria da frota</Typography>
                    {withoutReading > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {withoutReading} sem leitura
                      </Typography>
                    )}
                  </Box>
                  {withBattery.length === 0 ? (
                    <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
                      Nenhum dispositivo reportou bateria ainda
                    </Typography>
                  ) : (
                    <Box sx={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={batteryData} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={theme.palette.divider} />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
                          <YAxis hide domain={[0, (max: number) => max + 1]} allowDecimals={false} />
                          <RechartsTooltip cursor={{ fill: alpha(theme.palette.text.primary, 0.06) }} formatter={(v) => [`${v} dispositivo(s)`, '']} separator="" />
                          <Bar dataKey="quantidade" radius={[6, 6, 0, 0]} maxBarSize={64}>
                            {batteryData.map((b) => (
                              <Cell key={b.name} fill={b.color} />
                            ))}
                            <LabelList dataKey="quantidade" position="top" style={{ fill: theme.palette.text.primary, fontWeight: 700, fontSize: 13 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </>
        )}

        <Grid item xs={12}>
          <Card sx={{ borderColor: allGood ? 'divider' : alpha(theme.palette.warning.main, 0.5) }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Atenção necessária
              </Typography>
              {allGood ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, color: 'success.main' }}>
                  <TaskAlt />
                  <Typography>Tudo em ordem: nenhuma bateria crítica, nenhum aparelho sem comunicação.</Typography>
                </Box>
              ) : (
                <Grid container spacing={4}>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, color: 'error.main' }}>
                      <BatteryAlert fontSize="small" />
                      <Typography variant="subtitle2" sx={{ color: 'text.primary' }}>
                        Bateria baixa (até {LOW_BATTERY_THRESHOLD}%)
                      </Typography>
                    </Box>
                    {lowBattery.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        Nenhum aparelho com bateria crítica.
                      </Typography>
                    ) : (
                      lowBattery.slice(0, MAX_ROWS).map((d) => attentionRow(d, <BatteryIndicator level={d.battery_level} />))
                    )}
                    {lowBattery.length > MAX_ROWS && (
                      <Typography variant="caption" color="text.secondary">
                        + {lowBattery.length - MAX_ROWS} outros
                      </Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, color: 'warning.main' }}>
                      <WifiOff fontSize="small" />
                      <Typography variant="subtitle2" sx={{ color: 'text.primary' }}>
                        Sem comunicação há mais de {LONG_OFFLINE_HOURS} h
                      </Typography>
                    </Box>
                    {longOffline.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        Todos os aparelhos ativos estão se comunicando.
                      </Typography>
                    ) : (
                      longOffline.slice(0, MAX_ROWS).map((d) =>
                        attentionRow(
                          d,
                          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                            {relativeTime(d.last_seen)}
                          </Typography>
                        )
                      )
                    )}
                    {longOffline.length > MAX_ROWS && (
                      <Typography variant="caption" color="text.secondary">
                        + {longOffline.length - MAX_ROWS} outros
                      </Typography>
                    )}
                  </Grid>
                  {pending.length > 0 && (
                    <Grid item xs={12}>
                      <Box
                        onClick={() => navigate('/devices')}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2, cursor: 'pointer', bgcolor: alpha(theme.palette.info.main, 0.1), '&:hover': { bgcolor: alpha(theme.palette.info.main, 0.16) } }}
                      >
                        <HourglassEmpty fontSize="small" color="info" />
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          <strong>{pending.length}</strong> {pending.length === 1 ? 'dispositivo aguardando' : 'dispositivos aguardando'} cadastro no aparelho
                        </Typography>
                        <ChevronRight fontSize="small" />
                      </Box>
                    </Grid>
                  )}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        {recent.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6">Últimos a se comunicar</Typography>
                  <Button size="small" endIcon={<ChevronRight />} onClick={() => navigate('/devices')}>
                    Ver todos
                  </Button>
                </Box>
                {recent.map((d) => (
                  <Box
                    key={d.id}
                    onClick={() => navigate(`/devices/${d.id}`)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.25, px: 1.5, mx: -1.5, borderRadius: 2, cursor: 'pointer', flexWrap: 'wrap', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {deviceName(d)}
                      </Typography>
                      <Typography noWrap variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {deviceSub(d)}
                      </Typography>
                    </Box>
                    <Box sx={{ width: 150 }}>
                      <OnlineIndicator online={d.is_online} lastSeen={d.last_seen} />
                    </Box>
                    <Box sx={{ width: 110 }}>
                      <BatteryIndicator level={d.battery_level} />
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  )
}
