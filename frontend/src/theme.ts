import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material'

/**
 * Cores da marca. Vieram do ícone do app Android (fundo #263238, escudo #26A69A) para
 * painel e aplicativo parecerem o mesmo produto. Quando houver a identidade visual oficial
 * da Arezzo, este é o único lugar que precisa mudar.
 */
export const brand = {
  ink: '#263238',
  inkDeep: '#1B2428',
  teal: '#26A69A',
  // Mesmo verde-azulado, escurecido para ter contraste suficiente (5,3:1) como cor de
  // texto e de botão sobre fundo branco. O #26A69A puro dá só 2,9:1.
  tealText: '#00796B',
}

export function createAppTheme(mode: PaletteMode): Theme {
  const dark = mode === 'dark'
  return createTheme({
    palette: {
      mode,
      primary: dark ? { main: '#4DB6AC', contrastText: '#06201D' } : { main: brand.tealText },
      background: dark
        ? { default: '#12191D', paper: '#1A2328' }
        : { default: '#F3F5F6', paper: '#FFFFFF' },
      divider: dark ? 'rgba(255,255,255,0.10)' : '#E2E7E9',
      text: dark
        ? { primary: '#E8EEF0', secondary: '#9AABB3' }
        : { primary: '#1C2A30', secondary: '#5A6B73' },
    },
    shape: { borderRadius: 10 },
    typography: {
      // Sem fonte externa de propósito: painel em rede corporativa não deve depender de CDN.
      fontFamily: '"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
      h4: { fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.015em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontSize: '1.05rem', fontWeight: 600 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8 } } },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({ border: `1px solid ${theme.palette.divider}`, backgroundImage: 'none' }),
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({ borderColor: theme.palette.divider }),
          head: ({ theme }) => ({
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase' as const,
            color: theme.palette.text.secondary,
            backgroundColor: theme.palette.mode === 'dark' ? alpha('#fff', 0.03) : '#F8FAFA',
            whiteSpace: 'nowrap' as const,
          }),
        },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 14 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 10 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  })
}
