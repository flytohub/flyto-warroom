import { useQuery } from '@tanstack/react-query'
import { Box } from '@mui/material'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getEventScope } from '@lib/engine'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { ConnectorHealthPanel } from './ConnectorHealthPanel'
import { ScanFreshnessPanel } from './ScanFreshnessPanel'
import { SlaBudgetPanel } from './SlaBudgetPanel'
import { SystemHealthPanel } from './SystemHealthPanel'

// OperationsView — the operator plane v1. A single health page that turns
// platform facts (connector/credential state, scan freshness, system
// wiring) into one operator-facing view. Each panel owns its own query +
// loading/error/empty states. The system-wiring panel is platform-admin
// only (gated by /events/scope). Notification rules + operator action
// ledger + per-asset freshness SLA are PR-6/PR-9 follow-ups (see types.ts).

export function OperationsView() {
  const scopeQ = useQuery({
    queryKey: qk.ops.eventScope(),
    queryFn: () => getEventScope(),
    staleTime: 5 * 60_000,
  })
  const isPlatformAdmin = !!scopeQ.data?.is_platform_admin

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 3 } }}>
        <FlytoPageHeader
          title={t('ops.title')}
          subtitle={t('ops.subtitle')}
          bottomGap={4}
        />
      </Box>

      <Box sx={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        px: { xs: 2, md: 4 }, pb: 3,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        <ConnectorHealthPanel />
        <ScanFreshnessPanel />
        <SlaBudgetPanel />
        {isPlatformAdmin && <SystemHealthPanel />}
      </Box>
    </Box>
  )
}
