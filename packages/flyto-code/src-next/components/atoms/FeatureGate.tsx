import { useNavigate, useParams } from 'react-router'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import type { ReactNode } from 'react'
import type { PageAccess, Paywall } from '@lib/engine'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { LockKeyhole, LayoutDashboard, RefreshCw } from 'lucide-react'
import { t } from '@lib/i18n';

export type FeatureGateProps = {
  /** Page id from `internal/permission/capabilities.yaml.pages`. */
  page: string
  /** Where to send the user when they don't have access. Defaults to
   *  the org's dashboard. */
  redirect?: string
  children: ReactNode
}

/**
 * FeatureGate — wraps a route's element with a backend-driven page
 * permission check. If the user's capabilities don't include the
 * given `page`, the gate renders an explicit disabled-module state
 * instead of auto-redirecting. While capabilities are still loading we
 * show a small spinner instead of flashing the gated content.
 *
 * Usage in a route definition:
 *   {
 *     path: 'domains',
 *     element: <FeatureGate page="domains"><DomainsPage /></FeatureGate>,
 *   }
 *
 * Do NOT use FeatureGate to hide menu items — that's `useCapabilities`
 * inside the nav builder. This is for the route boundary so a user
 * who types the URL directly still hits the gate.
 */
export function FeatureGate({ page, redirect, children }: FeatureGateProps) {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const caps = useCapabilities(orgId)
  const projectCaps = useProjectCapabilities(orgId)

  if (caps.isError || projectCaps.isError) {
    return <CapabilitiesUnavailable onRetry={() => { caps.refetch(); projectCaps.refetch() }} />
  }

  if (!caps.ready || !projectCaps.ready || caps.isLoading || projectCaps.isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 12 }}>
        <CircularProgress size={20} />
      </Box>
    )
  }

  const pageState = caps.pageState(page)
  if (pageState.state === 'locked_preview') {
    return (
      <FeatureLockedPreview
        page={page}
        state={pageState}
        paywall={caps.paywallFor(pageState.paywall_key)}
        onPrimary={() => navigate(orgId ? `/projects/${orgId}/settings` : '/projects')}
      />
    )
  }

  if (pageState.state !== 'enabled') {
    const fallback = redirect ?? (orgId ? `/projects/${orgId}/dashboard` : '/projects')
    return (
      <FeatureUnavailable
        page={page}
        onPrimary={() => navigate(fallback, { replace: true })}
      />
    )
  }

  if (!projectCaps.canOpenPage(page)) {
    const fallback = redirect ?? (orgId ? `/projects/${orgId}/dashboard` : '/projects')
    return (
      <FeatureUnavailable
        page={page}
        onPrimary={() => navigate(fallback, { replace: true })}
      />
    )
  }

  return <>{children}</>
}

export default FeatureGate

function FeatureLockedPreview({
  page,
  state,
  paywall,
  onPrimary,
}: {
  page: string
  state: PageAccess
  paywall?: Paywall
  onPrimary: () => void
}) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 360,
        display: 'grid',
        placeItems: 'center',
        px: { xs: 2, sm: 3 },
        py: 6,
        overflow: 'hidden',
      }}
    >
      <Box
        role="status"
        aria-live="polite"
        sx={{
          width: '100%',
          maxWidth: 620,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          p: { xs: 3, sm: 4 },
          textAlign: 'center',
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
        }}
      >
        <Box
          sx={{
            width: 54,
            height: 54,
            mx: 'auto',
            mb: 2,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(245, 158, 11, 0.14)',
            color: '#b45309',
          }}
        >
          <LockKeyhole size={26} />
        </Box>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          {paywall?.title || t('gate.previewLocked')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460, mx: 'auto', mb: 2.5 }}>
          {paywall?.message || state.reason || t('gate.previewLockedDesc')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5, fontFamily: 'monospace' }}>
          {state.required_sku || state.required_feature || page}
        </Typography>
        <Button
          variant="contained"
          startIcon={<LockKeyhole size={16} />}
          onClick={onPrimary}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {t('gate.openBilling')}
        </Button>
      </Box>
    </Box>
  )
}

function FeatureUnavailable({ page, onPrimary }: { page: string; onPrimary: () => void }) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 360,
        display: 'grid',
        placeItems: 'center',
        px: { xs: 2, sm: 3 },
        py: 6,
        overflow: 'hidden',
      }}
    >
      <Box
        role="status"
        aria-live="polite"
        sx={{
          width: '100%',
          maxWidth: 560,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          p: { xs: 3, sm: 4 },
          textAlign: 'center',
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
        }}
      >
        <Box
          sx={{
            width: 54,
            height: 54,
            mx: 'auto',
            mb: 2,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(148, 163, 184, 0.12)',
            color: 'text.secondary',
          }}
        >
          <LockKeyhole size={26} />
        </Box>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          {t('gate.moduleUnavailable')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: 2.5 }}>
          {t('gate.moduleUnavailableDesc')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5, fontFamily: 'monospace' }}>
          {page}
        </Typography>
        <Button
          variant="contained"
          startIcon={<LayoutDashboard size={16} />}
          onClick={onPrimary}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {t('gate.backToDashboard')}
        </Button>
      </Box>
    </Box>
  )
}

function CapabilitiesUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 360,
        display: 'grid',
        placeItems: 'center',
        px: { xs: 2, sm: 3 },
        py: 6,
        overflow: 'hidden',
      }}
    >
      <Box
        role="alert"
        aria-live="assertive"
        sx={{
          width: '100%',
          maxWidth: 560,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          p: { xs: 3, sm: 4 },
          textAlign: 'center',
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
        }}
      >
        <Box
          sx={{
            width: 54,
            height: 54,
            mx: 'auto',
            mb: 2,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(148, 163, 184, 0.12)',
            color: 'text.secondary',
          }}
        >
          <LockKeyhole size={26} />
        </Box>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          {t('gate.capabilitiesUnavailable')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: 2.5 }}>
          {t('gate.capabilitiesUnavailableDesc')}
        </Typography>
        <Button
          variant="contained"
          startIcon={<RefreshCw size={16} />}
          onClick={onRetry}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {t('gate.retryCapabilities')}
        </Button>
      </Box>
    </Box>
  )
}
