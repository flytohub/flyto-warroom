import { Alert, Box, Button, Chip, LinearProgress, MenuItem, Paper, Select, Stack, Switch, Tooltip, Typography } from '@mui/material'
import { Clock, Play, ShieldCheck } from 'lucide-react'

import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { t } from '@lib/i18n'
import type { SystemScanner, WarroomCampaignExecution } from '@lib/engine'
import { formatVerificationDate as formatDate } from './productVerificationModel'
import { ContractRow, EvidenceField, SectionHeader } from './productVerificationPrimitives'

function estimateNextRun(scanner: SystemScanner) {
  if (!scanner.last_run_end) return 'after first scheduled tick'
  const intervalMs = parseGoDurationMs(scanner.interval)
  if (!intervalMs) return 'unknown'
  const last = new Date(scanner.last_run_end)
  if (Number.isNaN(last.getTime())) return 'unknown'
  return formatDate(new Date(last.getTime() + intervalMs).toISOString()) || 'unknown'
}

function parseGoDurationMs(value: string) {
  const match = value.match(/^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$/)
  if (!match) return 0
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return ((hours * 60 + minutes) * 60 + seconds) * 1000
}

export function ProductVerificationSchedulerPanel({
  isPlatformAdmin,
  scopeLoading,
  scanner,
  loading,
  error,
  patchPending,
  runPending,
  latestEvidenceRun,
  onToggle,
  onInterval,
  onRunNow,
}: {
  isPlatformAdmin: boolean
  scopeLoading: boolean
  scanner: SystemScanner | null
  loading: boolean
  error: Error | null
  patchPending: boolean
  runPending: boolean
  latestEvidenceRun: WarroomCampaignExecution | null
  onToggle: (enabled: boolean) => void
  onInterval: (interval: string) => void
  onRunNow: () => void
}) {
  const busy = patchPending || runPending || !!scanner?.currently_running
  const intervalOptions = [
    { value: '30m0s', label: '30m' },
    { value: '1h0m0s', label: '1h' },
    { value: '6h0m0s', label: '6h' },
    { value: '12h0m0s', label: '12h' },
    { value: '24h0m0s', label: '24h' },
  ]
  const intervalKnown = scanner ? intervalOptions.some((option) => option.value === scanner.interval) : true

  if (scopeLoading) {
    return <LinearProgress />
  }

  if (!isPlatformAdmin) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Clock size={16} />} title={t('productVerification.schedulerTitle')} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.schedulerPlatformAdminOnly')}
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Clock size={16} />} title={t('productVerification.schedulerTitle')} />
        {loading && <LinearProgress />}
        {error && (
          <Box sx={{ m: 2 }}>
            <InlineErrorNotice error={error} />
          </Box>
        )}
        {!loading && !error && !scanner && (
          <>
            <Alert severity="warning" sx={{ m: 2 }}>
              {t('productVerification.schedulerMissing')}
            </Alert>
            <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
              <EvidenceField label={t('hardcoded.scanner.id.ae6fe969')} value="product_verification" />
              <EvidenceField label="Registration" value="not registered in API scanner registry" />
              <EvidenceField label={t('hardcoded.manual.run.endpoint.fceb86d8')} value="/api/v1/code/orgs/{org_id}/warroom-verification/runs" />
              <EvidenceField label={t('hardcoded.evidence.link.6866d7fe')} value={latestEvidenceRun ? `run ${latestEvidenceRun.id} -> ${latestEvidenceRun.evidenceSig ?? 'evidence pending'}` : 'not captured'} />
            </Box>
          </>
        )}
        {scanner && (
          <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(300px, 0.55fr)' }, gap: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle2" fontWeight={850}>{scanner.name || t('productVerification.title')}</Typography>
                <Chip size="small" color={scanner.enabled ? 'success' : 'default'} label={scanner.enabled ? 'enabled' : 'disabled'} />
                {scanner.currently_running && <Chip size="small" color="primary" label={t('productVerification.schedulerRunning')} />}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.55 }}>
                {scanner.description}
              </Typography>
              <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                <EvidenceField label={t('hardcoded.scanner.id.ae6fe969')} value={scanner.id} />
                <EvidenceField label="Interval" value={scanner.interval} />
                <EvidenceField label={t('hardcoded.runs.failures.352ac0b1')} value={`${scanner.run_count} / ${scanner.fail_count}`} />
                <EvidenceField label={t('settings.schedule.lastRun')} value={formatDate(scanner.last_run_end) || 'never'} />
                <EvidenceField label={t('settings.schedule.nextRun')} value={estimateNextRun(scanner)} />
                <EvidenceField label={t('hardcoded.evidence.link.6866d7fe')} value={latestEvidenceRun ? `run ${latestEvidenceRun.id} -> ${latestEvidenceRun.evidenceSig ?? 'evidence pending'}` : 'not captured'} />
              </Box>
              {scanner.last_error && (
                <Box sx={{ mt: 1.5 }}>
                  <InlineErrorNotice error={scanner.last_error} />
                </Box>
              )}
            </Box>

            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={850}>{t('productVerification.schedulerControls')}</Typography>
              <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Typography variant="caption" color="text.secondary">{t('productVerification.schedulerEnabled')}</Typography>
                  <Switch
                    size="small"
                    checked={scanner.enabled}
                    disabled={patchPending || scanner.critical_for_platform}
                    slotProps={{ input: { 'aria-label': t('productVerification.schedulerEnabled') } }}
                    onChange={(event) => onToggle(event.target.checked)}
                  />
                </Stack>
                <Select
                  size="small"
                  fullWidth
                  value={scanner.interval}
                  disabled={patchPending}
                  onChange={(event) => onInterval(String(event.target.value))}
                >
                  {intervalOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                  {!intervalKnown && <MenuItem value={scanner.interval}>{scanner.interval}</MenuItem>}
                </Select>
                <Tooltip title={t('productVerification.schedulerRunNowTip')}>
                  <span>
                    <Button
                      variant="outlined"
                      startIcon={<Play size={16} />}
                      disabled={busy}
                      onClick={onRunNow}
                      fullWidth
                    >
                      {runPending ? t('common.running') : t('productVerification.schedulerRunNow')}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.schedulerSafety')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <ContractRow label={t('hardcoded.durable.job.94c5dfed')} value="product_verification in scheduled_jobs / scheduled_job_runs" />
          <ContractRow label={t('hardcoded.default.mode.a652e3e4')} value="disabled in scanners.yaml; dry-run unless FLYTO_PRODUCT_VERIFICATION_EXECUTE=true" />
          <ContractRow label="Runner" value="FLYTO_VERIFICATION_URL preferred, FLYTO_RUNNER_URL fallback" />
          <ContractRow label="Bounds" value="FLYTO_PRODUCT_VERIFICATION_MAX_ORGS and MAX_TARGETS_PER_ORG" />
          <ContractRow label="Scope" value="customer repo verify_targets first; verified customer domain fallback" />
          <ContractRow label="Evidence" value="campaign_executions row -> runner callback -> screenshot/DOM/network artifacts" />
        </Box>
      </Paper>
    </Stack>
  )
}
