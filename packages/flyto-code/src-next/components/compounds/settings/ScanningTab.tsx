import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Switch from '@mui/material/Switch'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import { Scan, Clock, ShieldAlert, ShieldCheck, Globe, Code as CodeIcon, Pause, Play, PlayCircle, AlertTriangle } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  getEventScope,
  listScanSchedules,
  putScanScheduleByKind,
  pauseScanSchedule,
  resumeScanSchedule,
  runScanScheduleNow,
  type ScanScheduleKind,
  type ScanScheduleRow,
} from '@lib/engine'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { request } from '@lib/engine/client'
import { sectionTitleSx, accentCardSx, rowSx, iconBoxSx, selectSx, switchSx } from './shared'

// ScheduleKindMeta lets us drive the two-card render off a single
// array instead of duplicating per-kind copy — adding a future
// 'cloud' kind is then a one-line addition here, not a fork of the
// component.
type KindMeta = {
  kind: ScanScheduleKind
  title: string
  titleKey: string
  desc: string
  descKey: string
  accent: string
  icon: typeof CodeIcon
  defaultCadence: string
  cadences: { value: string; label: string; labelKey: string }[]
}

const kindMetas: KindMeta[] = [
  {
    kind: 'code',
    title: 'Code Scans', titleKey: 'settings.schedule.code.title',
    desc: 'Repository deep-scan: SCA / CVE / SAST taint flow / secrets / IaC / containers / license.', descKey: 'settings.schedule.code.desc',
    accent: '#a78bfa',
    icon: CodeIcon,
    defaultCadence: 'weekly',
    cadences: [
      { value: 'daily', label: 'Daily', labelKey: 'settings.scanning.cadence.daily' },
      { value: 'weekly', label: 'Weekly (recommended)', labelKey: 'settings.scanning.cadence.weekly' },
      { value: 'manual', label: 'Manual only', labelKey: 'settings.scanning.cadence.manual' },
    ],
  },
  {
    kind: 'attack_surface',
    title: 'Attack Surface', titleKey: 'settings.schedule.attack_surface.title',
    desc: 'External discovery: subdomain enum / SSL / WAF / WHOIS / ports / threat intel — your perimeter as seen from the outside.', descKey: 'settings.schedule.attack_surface.desc',
    accent: '#38bdf8',
    icon: Globe,
    defaultCadence: 'daily',
    cadences: [
      { value: 'daily', label: 'Daily (recommended)', labelKey: 'settings.scanning.cadence.daily' },
      { value: 'daily_full', label: 'Daily + DAST', labelKey: 'settings.scanning.cadence.daily_full' },
      { value: 'weekly', label: 'Weekly', labelKey: 'settings.scanning.cadence.weekly' },
      { value: 'manual', label: 'Manual only', labelKey: 'settings.scanning.cadence.manual' },
    ],
  },
]

export function ScanningTab() {
  const { org } = useOrg()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: qk.platform.scanSchedules(org?.id),
    queryFn: () => listScanSchedules(org!.id),
    enabled: !!org?.id,
    refetchInterval: 30_000, // live-ish countdown + post-tick failure-counter update
    staleTime: 10_000,
  })

  // Index by kind so each card can render against a single row,
  // and missing rows render in their "not yet seeded" default state.
  const byKind = useMemo(() => {
    const out: Partial<Record<ScanScheduleKind, ScanScheduleRow>> = {}
    for (const r of data?.schedules ?? []) {
      out[r.kind as ScanScheduleKind] = r
    }
    return out
  }, [data])

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.platform.scanSchedules(org?.id) })

  return (
    <>
      <Box sx={sectionTitleSx}>
        <Scan size={15} style={{ color: '#a78bfa', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.scanning')}
        </Typography>
      </Box>

      {kindMetas.map((meta) => (
        <ScheduleCard
          key={meta.kind}
          meta={meta}
          row={byKind[meta.kind]}
          orgID={org?.id}
          loading={isLoading}
          onChange={invalidate}
        />
      ))}

      {/* Verification policy — unchanged from the pre-2026-05-18 tab. */}
      <Box sx={sectionTitleSx}>
        <ShieldCheck size={15} style={{ color: '#ef4444', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.verifyPolicy')}
        </Typography>
      </Box>
      <Box sx={accentCardSx('#22c55e')}>
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#34d399')}>
              <ShieldCheck size={15} style={{ color: '#34d399' }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600} color="text.primary">
                  {t('settings.verifyStaticTitle')}
                </Typography>
                <Chip label={t('settings.alwaysOn')} size="small" sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5, maxWidth: 480, lineHeight: 1.5 }}>
                {t('settings.verifyStaticDesc')}
              </Typography>
            </Box>
          </Box>
          <Switch size="small" checked readOnly sx={switchSx} />
        </Box>
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#fbbf24')}>
              <ShieldAlert size={15} style={{ color: '#fbbf24' }} />
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600} color="text.primary">
                  {t('settings.verifyDynamicTitle')}
                </Typography>
                <Chip label={t('settings.optIn')} size="small" sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5, maxWidth: 480, lineHeight: 1.5 }}>
                {t('settings.verifyDynamicDesc')}
              </Typography>
            </Box>
          </Box>
          <Switch size="small" checked readOnly sx={switchSx} />
        </Box>
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Alert severity="info" variant="outlined" sx={{ mt: 1, borderRadius: 2, borderColor: 'rgba(56,189,248,0.25)', bgcolor: 'rgba(56,189,248,0.04)', '& .MuiAlert-icon': { color: '#38bdf8' } }}>
            {t('settings.verifyAllowlistHint')}
          </Alert>
        </Box>
      </Box>

      {/* Platform-wide scanner registry — distinct from per-org
          schedules above. Lets admin see every background scanner
          + toggle / reschedule live without a redeploy. */}
      <SystemScannersSection />
    </>
  )
}

// ScheduleCard renders one (org, kind) row with all the controls.
// Stateless — every action goes back to the API and the parent
// useQuery refetches. Saves us the "optimistic-update fights stale
// fetch" trap that bit the OAuth-only ScanningTab predecessor.
function ScheduleCard({
  meta,
  row,
  orgID,
  loading,
  onChange,
}: {
  meta: KindMeta
  row: ScanScheduleRow | undefined
  orgID: string | undefined
  loading: boolean
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)

  const upsert = useMutation({
    mutationFn: ({ schedule, enabled }: { schedule: string; enabled: boolean }) =>
      putScanScheduleByKind(orgID!, meta.kind, schedule, enabled),
    onSettled: () => { setBusy(false); onChange() },
  })
  const pause = useMutation({
    mutationFn: () => pauseScanSchedule(orgID!, meta.kind, 'paused from Settings'),
    onSettled: () => { setBusy(false); onChange() },
  })
  const resume = useMutation({
    mutationFn: () => resumeScanSchedule(orgID!, meta.kind),
    onSettled: () => { setBusy(false); onChange() },
  })
  const runNow = useMutation({
    mutationFn: () => runScanScheduleNow(orgID!, meta.kind),
    onSettled: () => { setBusy(false); onChange() },
  })

  const cadence = row?.schedule ?? meta.defaultCadence
  const enabled = row?.enabled ?? true
  const paused = !!row?.paused_at
  const failures = row?.consecutive_failures ?? 0

  return (
    <Box sx={{ ...accentCardSx(meta.accent), mb: 2 }}>
      {/* Header row: name + status pill */}
      <Box sx={{ ...rowSx, alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          <Box sx={iconBoxSx(meta.accent)}>
            <meta.icon size={15} style={{ color: meta.accent }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" fontWeight={700} color="text.primary">
                {tOr(meta.titleKey, meta.title)}
              </Typography>
              <StatusPill enabled={enabled} paused={paused} failures={failures} />
              {failures > 0 && (
                <Tooltip
                  arrow
                  title={
                    paused
                      ? t('settings.schedule.autoPausedTip')
                      : t('settings.schedule.failingTip')
                  }
                >
                  <Chip
                    icon={<AlertTriangle size={12} />}
                    label={`${failures} fail${failures > 1 ? 's' : ''}`}
                    size="small"
                    sx={{
                      height: 22, fontSize: 13, fontWeight: 700,
                      bgcolor: 'rgba(251,191,36,0.12)', color: '#fbbf24',
                      border: '1px solid rgba(251,191,36,0.25)',
                    }}
                  />
                </Tooltip>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5, maxWidth: 560, lineHeight: 1.5 }}>
              {tOr(meta.descKey, meta.desc)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 3, mt: 1.2, flexWrap: 'wrap' }}>
              <Stat label={t('settings.schedule.nextRun')} value={formatRelative(row?.next_run_at, 'in')} />
              <Stat label={t('settings.schedule.lastRun')} value={formatRelative(row?.last_run_at, 'ago')} />
            </Box>
          </Box>
        </Box>

        {/* Enabled toggle */}
        <Tooltip title={enabled ? t('settings.schedule.disableTip') : t('settings.schedule.enableTip')} arrow>
          <span>
            <Switch
              size="small"
              checked={enabled}
              onChange={(_, v) => { setBusy(true); upsert.mutate({ schedule: cadence, enabled: v }) }}
              disabled={busy || loading || !orgID}
              sx={switchSx}
            />
          </span>
        </Tooltip>
      </Box>

      {/* Cadence + actions row */}
      <Box sx={{ ...rowSx, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          <Box sx={iconBoxSx('#a78bfa')}>
            <Clock size={15} style={{ color: '#a78bfa' }} />
          </Box>
          <Box>
            <Typography variant="body2" fontWeight={600} color="text.primary">
              {t('settings.schedule.cadence')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
              {t('settings.schedule.cadenceDesc')}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select
              value={cadence}
              size="small"
              sx={selectSx}
              disabled={busy || loading || !enabled || !orgID}
              onChange={(e) => { setBusy(true); upsert.mutate({ schedule: String(e.target.value), enabled }) }}
            >
              {meta.cadences.map((c) => (
                <MenuItem key={c.value} value={c.value}>{tOr(c.labelKey, c.label)}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {paused ? (
            <Button
              size="small"
              startIcon={<Play size={14} />}
              variant="outlined"
              disabled={busy || !orgID}
              onClick={() => { setBusy(true); resume.mutate() }}
              sx={{ textTransform: 'none' }}
            >
              {t('settings.schedule.resume')}
            </Button>
          ) : (
            <Button
              size="small"
              startIcon={<Pause size={14} />}
              variant="outlined"
              color="warning"
              disabled={busy || !enabled || !orgID}
              onClick={() => { setBusy(true); pause.mutate() }}
              sx={{ textTransform: 'none' }}
            >
              {t('settings.schedule.pause')}
            </Button>
          )}

          <Tooltip arrow title={t('settings.schedule.runNowTip')}>
            <span>
              <Button
                size="small"
                startIcon={<PlayCircle size={14} />}
                variant="contained"
                disabled={busy || !orgID || paused}
                onClick={() => { setBusy(true); runNow.mutate() }}
                sx={{ textTransform: 'none', bgcolor: meta.accent, '&:hover': { bgcolor: meta.accent, opacity: 0.85 } }}
              >
                {t('settings.schedule.runNow')}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {paused && row?.paused_reason && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Alert
            severity="warning"
            variant="outlined"
            sx={{ mt: 1, borderRadius: 2 }}
          >
            <strong>{t('settings.schedule.pausedLabel')}</strong> {row.paused_reason}
          </Alert>
        </Box>
      )}
    </Box>
  )
}

// SystemScannersSection — surfaces the platform-wide scanner
// registry. Shows every registered scanner across categories
// (discovery / enrichment / scanning / monitoring / maintenance),
// per-scanner enabled toggle + interval + live stats.
//
// Reads /api/v1/system/scanners. Platform-admin scoped; normal org users
// should never call this route because the engine correctly returns 403.
//
// Different from the two cards above:
//   - Per-org scan schedule (above) = "when does THIS org's
//     scan_schedule fire" — code/attack_surface kinds only
//   - System scanners (this section) = "what platform-wide
//     background jobs are running across all orgs" — 13+ scanners
export function SystemScannersSection() {
  const qc = useQueryClient()
  const { data: scopeData, isLoading: scopeLoading } = useQuery({
    queryKey: qk.platform.eventScope(),
    queryFn: getEventScope,
    staleTime: 5 * 60_000,
  })
  const isPlatformAdmin = !!scopeData?.is_platform_admin
	  const { data } = useQuery({
	    queryKey: qk.platform.systemScanners(),
	    queryFn: () => request<{ scanners: SystemScanner[] }>('GET', '/api/v1/system/scanners'),
	    enabled: isPlatformAdmin,
	    refetchInterval: 15_000,
	    staleTime: 5_000,
	  })
	  const patchMut = useMutation({
    mutationFn: (vars: { id: string; body: Partial<{ enabled: boolean; interval: string }> }) =>
      request('PATCH', `/api/v1/system/scanners/${vars.id}`, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform.systemScanners() }),
  })
  const runNowMut = useMutation({
    mutationFn: (id: string) => request('POST', `/api/v1/system/scanners/${id}/run-now`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform.systemScanners() }),
	  })
	  const scanners = data?.scanners ?? []
	  if (scopeLoading || !isPlatformAdmin) return null
	  if (scanners.length === 0) return null

  // Group by category for visual hierarchy.
  const byCategory: Record<string, SystemScanner[]> = {}
  for (const s of scanners) {
    const cat = s.category || 'other'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(s)
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography sx={sectionTitleSx}>
        {t('settings.scanners.title')}
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
        {t('settings.scanners.subtitle')}
      </Typography>
      {Object.keys(byCategory).sort().map(cat => (
        <Box key={cat} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
            {cat}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {byCategory[cat].map(sc => (
              <Box key={sc.id} sx={{
                p: 1.5, borderRadius: 1.5,
                border: 1, borderColor: 'divider',
                bgcolor: 'action.hover',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>
                      {sc.name}
                      </Typography>
                      {sc.critical_for_platform && (
                        <Chip size="small" label={t('settings.scanners.critical')} sx={{ height: 18, fontSize: 12 }} color="warning" />
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                      {sc.description}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                      id={sc.id} · scope={sc.scope} · runs={sc.run_count} · fails={sc.fail_count}
                      {sc.last_error && ` · err: ${sc.last_error.slice(0, 60)}`}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Select
                      size="small"
                      value={sc.interval}
                      onChange={e => patchMut.mutate({ id: sc.id, body: { interval: e.target.value } })}
                      disabled={patchMut.isPending}
                      sx={selectSx}
                    >
                      {['1m','5m','15m','30m','1h','6h','24h'].map(opt => (
                        <MenuItem key={opt} value={opt + '0s'} sx={{ fontSize: 13 }}>{opt}</MenuItem>
                      ))}
                      {/* Show current interval if not in preset list */}
                      {!['1m0s','5m0s','15m0s','30m0s','1h0m0s','6h0m0s','24h0m0s'].includes(sc.interval) && (
                        <MenuItem value={sc.interval} sx={{ fontSize: 13 }}>{sc.interval}</MenuItem>
                      )}
                    </Select>
                    <Switch
                      size="small"
                      checked={sc.enabled}
                      disabled={patchMut.isPending || sc.critical_for_platform}
                      onChange={e => patchMut.mutate({ id: sc.id, body: { enabled: e.target.checked } })}
                      sx={switchSx}
                    />
                    <Tooltip title={t('settings.scanners.runNow')}>
                      <span>
                        <Button
                          size="small" variant="outlined"
                          onClick={() => runNowMut.mutate(sc.id)}
                          disabled={runNowMut.isPending || sc.currently_running}
                          sx={{ minWidth: 0, px: 1 }}
                        >
                          <PlayCircle size={14} />
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

interface SystemScanner {
  id: string
  name: string
  description: string
  category: string
  scope: string
  enabled: boolean
  interval: string
  run_count: number
  fail_count: number
  last_run_start?: string
  last_run_end?: string
  last_error?: string
  currently_running: boolean
  critical_for_platform: boolean
  notes?: string
}

function StatusPill({ enabled, paused, failures }: { enabled: boolean; paused: boolean; failures: number }) {
  if (!enabled) {
    return <Chip label={t('settings.schedule.disabled')} size="small" sx={{ height: 22, fontSize: 13, fontWeight: 700, bgcolor: 'rgba(107,114,128,0.12)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.2)' }} />
  }
  if (paused) {
    return <Chip label={t('settings.schedule.paused')} size="small" sx={{ height: 22, fontSize: 13, fontWeight: 700, bgcolor: 'rgba(251,191,36,0.14)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.28)' }} />
  }
  if (failures >= 3) {
    return <Chip label={t('settings.schedule.flaky')} size="small" sx={{ height: 22, fontSize: 13, fontWeight: 700, bgcolor: 'rgba(248,113,113,0.12)', color: '#ef4444', border: '1px solid rgba(248,113,113,0.25)' }} />
  }
  return <Chip label={t('settings.schedule.active')} size="small" sx={{ height: 22, fontSize: 13, fontWeight: 700, bgcolor: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }} />
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 12.5, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="body2" color="text.primary" sx={{ fontSize: 12.5, fontWeight: 600, mt: 0.15 }}>
        {value}
      </Typography>
    </Box>
  )
}

// formatRelative turns an ISO timestamp into "in 4h", "12 min ago",
// "never" etc. Same direction handling either way so the same fn
// works for next_run_at ("in") and last_run_at ("ago").
function formatRelative(iso: string | null | undefined, direction: 'in' | 'ago'): string {
  if (!iso) return direction === 'in' ? t('settings.schedule.notScheduled') : t('settings.schedule.never')
  const d = new Date(iso)
  const diffMs = d.getTime() - Date.now()
  const future = diffMs > 0
  const abs = Math.abs(diffMs)
  const min = Math.round(abs / 60_000)
  const hr = Math.round(abs / 3_600_000)
  const day = Math.round(abs / 86_400_000)
  let body: string
  if (abs < 60_000) body = t('settings.schedule.justNow')
  else if (min < 60) body = `${min} min`
  else if (hr < 48) body = `${hr} h`
  else body = `${day} d`
  if (direction === 'in') return future ? `in ${body}` : `${body} overdue`
  return future ? `in ${body}` : `${body} ago`
}
