import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, Typography, Paper } from '@mui/material'
import { ErrorOutline } from '@mui/icons-material'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Last line of defense against a blank white screen.
 *
 * Without this, any unexpected render error anywhere in the tree - a malformed API
 * response, a null field the UI didn't expect, a third-party library throwing - takes
 * the ENTIRE app down to a blank page with no message, because React unmounts
 * everything above the point of the error when nothing catches it. This is a class
 * component because React error boundaries currently require the class lifecycle
 * (getDerivedStateFromError / componentDidCatch); there's no hook equivalent yet.
 *
 * This is a safety net, not a substitute for fixing the actual bug that threw - see
 * getErrorMessage() in utils/errors.ts for the specific fix to the most common cause
 * (a Pydantic validation error array rendered directly into JSX).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            p: 3,
            bgcolor: '#f5f5f5',
          }}
        >
          <Paper sx={{ p: 4, maxWidth: 480, textAlign: 'center' }}>
            <ErrorOutline sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Algo deu errado
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Ocorreu um erro inesperado nesta tela. Tente recarregar a
              página - se o problema continuar, entre em contato com o
              suporte.
            </Typography>
            <Button variant="contained" onClick={this.handleReload}>
              Recarregar página
            </Button>
          </Paper>
        </Box>
      )
    }

    return this.props.children
  }
}
