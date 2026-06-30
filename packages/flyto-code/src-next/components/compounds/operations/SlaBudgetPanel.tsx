import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Chip } from '@mui/material'
import { Timer } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { getSLABudget } from '@lib/engine'
import { SectionCard } from '@atoms/SectionCard'
import { SeverityChip } from '@atoms/SeverityChip'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { healthTone, TONE_COLOR } from './types'

// SLA budget — /sla-budget per-severity error-budget usage. Operator
// answer to "are we burning our remediation budget?" Reads only; the
// alert-on-breach delivery is PR-9 (see types.ts NotificationRule).

export function SlaBudgetPanel() {
  const { org } = useOrg()
  const orgId = org?.id

  const q = useQuery({
    queryKey: qk.ops.slaBudget(orgId),
    queryFn: () => getSLABudget(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // Only rows with an active policy are meaningful here.
  const items = (q.data?.items ?? []).filter(i => i.status !== 'no_policy' && i.status !== 'inactive')

  return (
    <SectionCard icon={<Timer size={16} />} title={t('ops.sla.title')}>

      {q.isLoading && <LoadingState rows={3} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('ops.sla.title')} compact />}

      {!q.isLoading && !q.isError && (
        items.length === 0 ? (
          <EmptyStateGuide
            icon={<Timer size={28} />}
            title={t('ops.sla.emptyTitle')}
            description={t('ops.sla.empty')}
            py={4}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {items.map(i => {
              const tone = healthTone(i.status)
              return (
                <Box key={i.severity} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25,
                  py: 1, px: 1.25, borderRadius: 1, border: '1px solid', borderColor: 'divider',
                }}>
                  <SeverityChip severity={i.severity} />
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                    {t('ops.sla.breaches')
                      .replace('{used}', String(i.used_breaches))
                      .replace('{allowed}', String(i.allowed_breaches))}
                    {' · '}{Math.round(i.used_percent)}%
                  </Typography>
                  <Chip
                    size="small"
                    label={i.status}
                    sx={{ fontWeight: 700, textTransform: 'capitalize', bgcolor: `${TONE_COLOR[tone]}22`, color: TONE_COLOR[tone] }}
                  />
                </Box>
              )
            })}
          </Box>
        )
      )}
    </SectionCard>
  )
}
