import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { Box, Typography, Alert, Chip, Switch } from '@mui/material'
import { Clock } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import {
  listSchedulerConfigs, pauseSchedulerJob, resumeSchedulerJob,
  type ScheduledJobConfig,
} from '@lib/engine/system/scheduler'

// SchedulerTab — operator control of scheduled scanner jobs.
// Wires GET /system/scheduler/configs + POST {id}/pause + {id}/resume.
// Platform-admin gated. Toggle = optimistic-ish (invalidate on success) with toast.

export function SchedulerTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  const q = useQuery({
    queryKey: qk.platform.schedulerConfigs(),
    queryFn: () => listSchedulerConfigs(),
    staleTime: 15_000,
  })

  const toggleMut = useMutation({
    mutationFn: (vars: { jobId: string; enable: boolean }) =>
      vars.enable ? resumeSchedulerJob(vars.jobId) : pauseSchedulerJob(vars.jobId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.platform.schedulerConfigs() })
      enqueueSnackbar(
        vars.enable
          ? t('sys.sched.resumed')
          : t('sys.sched.paused'),
        { variant: vars.enable ? 'success' : 'info' },
      )
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const configs: ScheduledJobConfig[] = q.data?.configs ?? []

  return (
    <Box>
      <Alert severity="warning" sx={{ mb: 2, fontSize: 13 }}>
        {t('sys.sched.intro')}
      </Alert>

      {q.isLoading && <LoadingState variant="spinner" py={4} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('sys.sched.intro')} compact />}
      {!q.isLoading && !q.isError && configs.length === 0 && (
        <EmptyStateGuide icon={<Clock size={28} />} title={t('sys.sched.empty')} py={4} />
      )}

      {configs.map(c => (
        <Box key={`${c.job_id}-${c.org_id ?? 'platform'}`} sx={{
          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1.5, alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Box>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{c.job_id}</Typography>
            <Typography variant="caption" color="text.secondary">
              {c.org_id ? `org ${c.org_id}` : 'platform'}{c.cron ? ` · ${c.cron}` : ''}
            </Typography>
          </Box>
          <Chip size="small" label={c.enabled ? 'enabled' : 'paused'}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: c.enabled ? 'rgba(34,197,94,0.18)' : 'rgba(245,158,11,0.18)',
              color: c.enabled ? '#22c55e' : '#f59e0b' }} />
          <Switch size="small" checked={c.enabled}
            disabled={toggleMut.isPending}
            onChange={(_e, checked) => toggleMut.mutate({ jobId: c.job_id, enable: checked })} />
        </Box>
      ))}
    </Box>
  )
}
