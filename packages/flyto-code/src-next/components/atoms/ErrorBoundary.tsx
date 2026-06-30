import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { RotateCw } from 'lucide-react'
import { Alert, Box, Button, Typography } from '@mui/material'
import { t } from '@lib/i18n'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    } else {
      // Production: report to console with structured metadata for
      // Cloud Run / log aggregators. Replace with Sentry when available.
      console.error(JSON.stringify({
        level: 'error',
        message: error.message,
        stack: error.stack?.slice(0, 500),
        component: info.componentStack?.slice(0, 300),
        url: window.location.href,
        ts: new Date().toISOString(),
      }))
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <Box className="flex flex-col items-center justify-center gap-4" sx={{ minHeight: 300 }}>
          <Alert
            severity="error"
            variant="outlined"
            sx={{ maxWidth: 480, width: '100%' }}
          >
            <Typography variant="body2" fontWeight={500}>
              {t('error.somethingWrong')}
            </Typography>
            {import.meta.env.DEV && this.state.error && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', maxWidth: 400 }}>
                {this.state.error.message}
              </Typography>
            )}
          </Alert>
          <Button
            variant="outlined"
            size="small"
            color="secondary"
            onClick={this.handleReload}
            startIcon={<RotateCw size={13} />}
          >
            {t('error.reload')}
          </Button>
        </Box>
      )
    }

    return this.props.children
  }
}
