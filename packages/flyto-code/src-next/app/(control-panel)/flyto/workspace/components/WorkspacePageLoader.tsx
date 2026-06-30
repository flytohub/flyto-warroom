import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { FileWarning, FolderOpen, RefreshCw } from 'lucide-react'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'
import { PageShell } from '@atoms/PageShell'
import { t } from '@lib/i18n';

type ModuleComponent = ComponentType<unknown>

type LoadState =
  | { status: 'loading'; attempt: number }
  | { status: 'ready'; attempt: number; Component: ModuleComponent }
  | { status: 'failed'; attempt: number; error: unknown }

export interface WorkspacePageLoaderProps {
  moduleId: string
  modulePath: string
  load: () => Promise<{ default: ModuleComponent }>
  maxRetries?: number
}

export default function WorkspacePageLoader({
  moduleId,
  modulePath,
  load,
  maxRetries = 2,
}: WorkspacePageLoaderProps) {
  const navigate = useNavigate()
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading', attempt: 0 })

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    async function loadPage(attempt: number) {
      setState({ status: 'loading', attempt })
      try {
        const mod = await load()
        if (cancelled) return
        setState({ status: 'ready', attempt, Component: mod.default })
      } catch (error) {
        if (cancelled) return
        if (attempt < maxRetries) {
          const delayMs = attempt === 0 ? 300 : 900
          retryTimer = setTimeout(() => {
            void loadPage(attempt + 1)
          }, delayMs)
          return
        }
        setState({ status: 'failed', attempt, error })
      }
    }

    void loadPage(0)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [load, maxRetries, reloadKey])

  if (state.status === 'ready') {
    const Page = state.Component
    return <Page />
  }

  if (state.status === 'failed') {
    const detail = getErrorMessage(state.error)
    return (
      <PageShell padded={false} scroll="host" suspense={false}>
        <Box sx={{ height: '100%', minHeight: 360, display: 'grid', placeItems: 'center', p: 3 }}>
          <Box sx={{ width: '100%', maxWidth: 620 }}>
            <EmptyStateGuide
              icon={<FileWarning size={28} />}
              title={t('workspacePageLoader.title')}
              description={t('workspacePageLoader.description')}
              primaryAction={{
                label: t('workspacePageLoader.retry'),
                icon: <RefreshCw size={16} />,
                onClick: () => setReloadKey((key) => key + 1),
              }}
              secondaryAction={{
                label: t('workspacePageLoader.projects'),
                icon: <FolderOpen size={16} />,
                onClick: () => navigate('/projects'),
              }}
            />
            <Box
              sx={{
                mt: 2,
                mx: 'auto',
                maxWidth: 560,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
                p: 1.5,
              }}
            >
              <Typography variant="caption" component="div" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                module: {moduleId}
              </Typography>
              <Typography variant="caption" component="div" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                path: {modulePath}
              </Typography>
              {detail && (
                <Typography
                  variant="caption"
                  component="div"
                  color="text.secondary"
                  sx={{ fontFamily: 'monospace', mt: 0.75, wordBreak: 'break-word' }}
                >
                  error: {detail}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </PageShell>
    )
  }

  return (
    <PageShell padded={false} scroll="host" suspense={false}>
      <Box sx={{ height: '100%', minHeight: 280, display: 'grid', placeItems: 'center', p: 3 }}>
        <Box sx={{ textAlign: 'center' }}>
          <LoadingState variant="spinner" py={0} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {state.attempt > 0
              ? t('workspacePageLoader.retrying')
              : t('workspacePageLoader.loading')}
          </Typography>
        </Box>
      </Box>
    </PageShell>
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error == null) return ''
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
