import { useState } from 'react'
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material'
import { CheckCircleOutline, EmailOutlined, LockOutlined, Visibility, VisibilityOff } from '@mui/icons-material'
import api from '../services/api'
import { getErrorMessage } from '../utils/errors'
import { brand } from '../theme'
import BrandMark from '../components/BrandMark'

interface LoginProps {
  onLogin: (token: string) => void
}

const HIGHLIGHTS = [
  'Cadastro de aparelhos por QR code',
  'Políticas de apps, kiosk e restrições',
  'Comandos remotos e log de auditoria',
]

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post('/auth/login', { email, password })
      localStorage.setItem('mdm_role', response.data.user_role)
      localStorage.setItem('mdm_email', response.data.user_email)
      onLogin(response.data.access_token)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erro ao fazer login'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      {/* Painel da marca: só em telas largas */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: '0 0 44%',
          flexDirection: 'column',
          justifyContent: 'center',
          px: { md: 7, lg: 10 },
          color: '#fff',
          background: `radial-gradient(900px 500px at 15% 0%, ${brand.teal}33, transparent 60%), linear-gradient(160deg, ${brand.ink} 0%, ${brand.inkDeep} 100%)`,
        }}
      >
        <BrandMark size={64} />
        <Typography variant="h4" sx={{ mt: 3, fontWeight: 800, color: '#fff' }}>
          Arezzo Device Manager
        </Typography>
        <Typography sx={{ mt: 1, color: 'rgba(255,255,255,0.7)', fontSize: '1.05rem' }}>
          Gerenciamento de dispositivos móveis
        </Typography>
        <Box sx={{ mt: 5, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          {HIGHLIGHTS.map((text) => (
            <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'rgba(255,255,255,0.85)' }}>
              <CheckCircleOutline sx={{ color: brand.teal }} fontSize="small" />
              <Typography sx={{ fontSize: '0.95rem' }}>{text}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Formulário */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.5, mb: 4 }}>
            <BrandMark size={44} />
            <Box>
              <Typography sx={{ fontWeight: 800, lineHeight: 1.15 }}>Arezzo Device Manager</Typography>
              <Typography variant="body2" color="text.secondary">
                Gerenciamento de dispositivos móveis
              </Typography>
            </Box>
          </Box>

          <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
            Entrar
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
            Use o seu e-mail corporativo e a sua senha.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="E-mail"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailOutlined fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Senha"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlined fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              fullWidth
              size="large"
              variant="contained"
              type="submit"
              disabled={loading}
              sx={{ mt: 3, py: 1.25 }}
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </Box>
      </Box>
    </Box>
  )
}
