import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Chip } from '@mui/material'
import { ServerCog } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getWiringHealth } from '@lib/engine'
import { SectionCard } from '@atoms/SectionCard'
import { StatusDot } from '@atoms/StatusDot'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { healthTone, TONE_COLOR } from './types'

// System wiring health — /system/wiring-health (platform component status).
// Rendered only for platform admins (the orchestrator gates this via
// /events/scope); org members never see it.

export function SystemHealthPanel() {
  const q = useQuery({
    queryKey: qk.ops.wiringHealth(),
    queryFn: () => getWiringHealth(),
    staleTime: 60_000,
  })

  const components = q.data?.components ?? []
  const overallOk = q.data?.overall_ok

  return (
    <SectionCard
      icon={<ServerCog size={16} />}
      title={t('ops.system.title')}
      action={q.data ? (
        <Chip
          size="small"
          label={overallOk ? t('ops.system.ok') : t('ops.system.degraded')}
          sx={{
            fontWeight: 700,
            bgcolor: `${overallOk ? TONE_COLOR.ok : TONE_COLOR.error}22`,
            color: overallOk ? TONE_COLOR.ok : TONE_COLOR.error,
          }}
        />
      ) : undefined}
    >

      {q.isLoading && <LoadingState rows={4} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('ops.system.title')} compact />}

      {!q.isLoading && !q.isError && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {components.map(c => {
            const tone = healthTone(c.status)
            return (
              <Box key={c.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.75 }}>
                <StatusDot color={TONE_COLOR[tone]} />
                <Typography variant="body2" fontWeight={600} sx={{ minWidth: 0 }}>
                  {c.name}
                </Typography>
                {c.critical && tone !== 'ok' && (
                  <Chip size="small" label={t('ops.system.critical')} sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: `${TONE_COLOR.error}22`, color: TONE_COLOR.error }} />
                )}
                <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', textAlign: 'right' }}>
                  {c.details || c.status}
                </Typography>
              </Box>
            )
          })}
        </Box>
      )}
    </SectionCard>
  )
}
