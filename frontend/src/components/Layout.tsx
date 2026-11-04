import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar,
  Avatar,
  Box,
  ButtonBase,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material'
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  PhoneAndroid as DevicesIcon,
  Policy as PolicyIcon,
  Workspaces as GroupsIcon,
  People as PeopleIcon,
  History as AuditIcon,
  Logout as LogoutIcon,
  DarkMode,
  LightMode,
  DevicesOther as SessionsIcon,
  FactCheck as ComplianceIcon,
  KeyboardArrowDown,
} from '@mui/icons-material'
import { useThemeMode } from '../contexts/ThemeModeContext'
import { brand } from '../theme'
import { ROLE_LABEL } from '../utils/labels'
import BrandMark from './BrandMark'

const DRAWER_WIDTH = 252
// Altura da faixa de cima: 64 px de conteúdo + 1 px de borda. A barra superior E o bloco da
// marca no menu lateral usam este MESMO valor, senão as duas linhas ficam em alturas diferentes
// (eram 4 px de diferença: 65 contra 69).
const HEADER_HEIGHT = 65

interface NavItem {
  text: string
  icon: ReactNode
  path: string
}

const OPERATION: NavItem[] = [
  { text: 'Visão geral', icon: <DashboardIcon fontSize="small" />, path: '/' },
  { text: 'Dispositivos', icon: <DevicesIcon fontSize="small" />, path: '/devices' },
  { text: 'Políticas', icon: <PolicyIcon fontSize="small" />, path: '/policies' },
  { text: 'Grupos', icon: <GroupsIcon fontSize="small" />, path: '/groups' },
  { text: 'Conformidade', icon: <ComplianceIcon fontSize="small" />, path: '/compliance' },
]
const ADMIN: NavItem[] = [
  { text: 'Usuários', icon: <PeopleIcon fontSize="small" />, path: '/users' },
  { text: 'Log de auditoria', icon: <AuditIcon fontSize="small" />, path: '/audit-log' },
  { text: 'Sessões ativas', icon: <SessionsIcon fontSize="small" />, path: '/sessions' },
]

interface LayoutProps {
  children: ReactNode
  onLogout: () => void
}

export default function Layout({ children, onLogout }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const role = localStorage.getItem('mdm_role') || ''
  const email = localStorage.getItem('mdm_email') || ''
  const isAdmin = role === 'admin'
  const { mode, toggleMode } = useThemeMode()

  // A rolagem acontece num painel interno (veja o <main> abaixo), não na página. Ao trocar de
  // tela ele volta ao topo.
  const scrollerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  const isSelected = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <ListItemButton
        key={item.path}
        selected={isSelected(item.path)}
        onClick={() => {
          navigate(item.path)
          setMobileOpen(false)
        }}
        sx={{
          mx: 1.5,
          mb: 0.25,
          py: 0.9,
          borderRadius: 2,
          color: 'rgba(255,255,255,0.72)',
          '& .MuiListItemIcon-root': { minWidth: 36, color: 'inherit' },
          '& .MuiListItemText-primary': { fontSize: '0.9rem', fontWeight: 500 },
          '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
          '&.Mui-selected': {
            bgcolor: alpha(brand.teal, 0.2),
            color: '#fff',
            '& .MuiListItemIcon-root': { color: brand.teal },
            '& .MuiListItemText-primary': { fontWeight: 700 },
          },
          '&.Mui-selected:hover': { bgcolor: alpha(brand.teal, 0.28) },
        }}
      >
        <ListItemIcon>{item.icon}</ListItemIcon>
        <ListItemText primary={item.text} />
      </ListItemButton>
    ))

  const sectionLabel = (text: string) => (
    <Typography
      sx={{ px: 3.5, mt: 2.5, mb: 0.75, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}
    >
      {text}
    </Typography>
  )

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: brand.inkDeep, color: '#fff' }}>
      <Box
        data-testid="sidebar-brand"
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, height: HEADER_HEIGHT, boxSizing: 'border-box', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}
      >
        <BrandMark size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.15, fontSize: '1rem', letterSpacing: '-0.01em' }}>Arezzo</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.2 }}>Device Manager</Typography>
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 2 }}>
        {sectionLabel('Operação')}
        <List disablePadding>{renderItems(OPERATION)}</List>
        {isAdmin && (
          <>
            {sectionLabel('Administração')}
            <List disablePadding>{renderItems(ADMIN)}</List>
          </>
        )}
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', height: { sm: '100vh' }, overflow: { sm: 'hidden' } }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          ml: { sm: `${DRAWER_WIDTH}px` },
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: 1,
          borderColor: 'divider',
          height: HEADER_HEIGHT,
          boxSizing: 'border-box',
        }}
      >
        <Toolbar sx={{ minHeight: 64, gap: { xs: 0.25, sm: 1 }, px: { xs: 1.5, sm: 3 } }}>
          <IconButton edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ display: { sm: 'none' } }} aria-label="Abrir menu">
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', gap: 1, minWidth: 0 }}>
            <BrandMark size={28} />
            <Typography noWrap sx={{ fontWeight: 700, fontSize: { xs: '0.95rem', sm: '1rem' } }}>
              Arezzo Device Manager
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title={mode === 'light' ? 'Modo escuro' : 'Modo claro'}>
            <IconButton onClick={toggleMode} aria-label={mode === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}>
              {mode === 'light' ? <DarkMode /> : <LightMode />}
            </IconButton>
          </Tooltip>
          <ButtonBase
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={{ ml: 0.5, pl: 0.75, pr: 1, py: 0.5, borderRadius: 2, gap: 1, '&:hover': { bgcolor: 'action.hover' } }}
            aria-label="Menu do usuário"
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: brand.ink, color: brand.teal, fontSize: '0.9rem', fontWeight: 700 }}>
              {(email[0] || '?').toUpperCase()}
            </Avatar>
            <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left', minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.2, maxWidth: 200 }} noWrap>
                {email}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.2 }}>{ROLE_LABEL[role] ?? role}</Typography>
            </Box>
            <KeyboardArrowDown fontSize="small" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }} />
          </ButtonBase>
          <Menu
            anchorEl={menuAnchor}
            open={!!menuAnchor}
            onClose={() => setMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { mt: 1, minWidth: 220 } } }}
          >
            <Box sx={{ px: 2, py: 1.25 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }} noWrap>
                {email}
              </Typography>
              <Chip size="small" label={ROLE_LABEL[role] ?? role} sx={{ mt: 0.5 }} />
            </Box>
            <Divider />
            <MenuItem
              onClick={() => {
                setMenuAnchor(null)
                onLogout()
              }}
            >
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Sair
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 0 } }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 0 } }}
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Em tela larga a PÁGINA não rola: o que rola é o painel interno abaixo da barra superior.
          Assim a barra de rolagem nunca encolhe a janela e o que fica encostado à direita (modo
          escuro, usuário) não se mexe quando ela aparece. `scrollbar-gutter: stable` reserva o
          espaço dela, então o conteúdo também não pula entre páginas curtas e longas.
          No celular a barra é sobreposta e não ocupa espaço: lá a página rola normalmente.
          minWidth: 0 impede que uma tabela larga estique a página inteira. */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          display: 'flex',
          flexDirection: 'column',
          height: { sm: '100vh' },
        }}
      >
        <Box sx={{ height: HEADER_HEIGHT, flexShrink: 0 }} />
        <Box
          ref={scrollerRef}
          data-testid="scroller"
          sx={{ flex: { sm: '1 1 auto' }, minHeight: 0, overflowY: { sm: 'auto' }, scrollbarGutter: { sm: 'stable' } }}
        >
          <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1440, mx: 'auto' }}>{children}</Box>
        </Box>
      </Box>
    </Box>
  )
}
