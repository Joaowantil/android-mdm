import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'

type Mode = 'light' | 'dark'

const STORAGE_KEY = 'mdm_theme_mode'

interface ThemeModeContextValue {
  mode: Mode
  toggleMode: () => void
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined)

function readStoredMode(): Mode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  // Respect the OS/browser preference the first time, rather than always
  // defaulting to light - a small courtesy for anyone who already has their
  // system set to dark.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(readStoredMode)

  const toggleMode = () => {
    setMode((prev) => {
      const next: Mode = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: '#1976d2' },
          secondary: { main: '#dc004e' },
          background:
            mode === 'light' ? { default: '#f5f5f5' } : { default: '#121212', paper: '#1e1e1e' },
        },
      }),
    [mode]
  )

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext)
  if (!ctx) {
    throw new Error('useThemeMode must be used within a ThemeModeProvider')
  }
  return ctx
}
