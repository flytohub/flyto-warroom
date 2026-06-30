import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Chip } from '@mui/material'
import { RefreshCw } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { getOrgHealthSummary } from '@lib/engine'
import { SectionCard } from '@atoms/SectionCard'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { relativeTime, TONE_COLOR } from './types'

// Scan freshness — derived from /health-summary repos[] (lastScannedAt +
// lastScanStatus, both real fields). Answers "is our data fresh, and is
// anything stuck or failing right now?" without a dedicated endpoint.
// (Per-asset freshness SLA / next_scan_at is PR-8 — see types.ts.)

export function ScanFreshnessPanel() {
  const { org } = useOrg()
  const orgId = org?.id

  const q = useQuery({
    queryKey: qk.ops.scanFreshness(orgId),
    queryFn: () => getOrgHealthSummary(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const stats = useMemo(() => {
    const repos = q.data?.repos ?? []
    let latest = 0
    for (const r of repos) {
      const t = r.scanned_at ? Date.parse(r.scanned_at) : NaN
      if (!Number.isNaN(t) && t > latest) latest = t
    }
    return {
      total: q.data?.total_count ?? repos.length,
      scanned: q.data?.scanned_count ?? 0,
      active: q.data?.active_scan_count ?? 0,
      latestIso: latest ? new Date(latest).toISOString() : undefined,
    }
  }, [q.data])

  return (
    <SectionCard icon={<RefreshCw size={16} />} title={t('ops.freshness.title')}>

      {q.isLoading && <LoadingState rows={2} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('ops.freshness.title')} compact />}

      {!q.isLoading && !q.isError && (
        stats.total === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('ops.freshness.none')}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              {t('ops.freshness.lastScan')}:{' '}
              <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{relativeTime(stats.latestIso)}</Box>
              {' · '}{stats.scanned}/{stats.total} {t('ops.freshness.scanned')}
            </Typography>
            {stats.active > 0 ? (
              <Chip size="small" label={`${stats.active} ${t('ops.freshness.running')}`}
                sx={{ fontWeight: 700, bgcolor: `${TONE_COLOR.warn}22`, color: TONE_COLOR.warn }} />
            ) : (
              <Chip size="small" label={t('ops.freshness.upToDate')}
                sx={{ fontWeight: 700, bgcolor: `${TONE_COLOR.ok}22`, color: TONE_COLOR.ok }} />
            )}
          </Box>
        )
      )}
    </SectionCard>
  )
}
