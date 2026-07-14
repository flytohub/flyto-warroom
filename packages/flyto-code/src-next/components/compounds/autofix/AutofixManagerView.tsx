/**
 * Manager-mode AutoFix view.
 *
 * The backend owns repair state and run accounting. This component only
 * groups those rows into a management surface: readiness, blockers,
 * priority backlog, and recent execution.
 */

import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha, useTheme, type Theme } from '@mui/material/styles'
import {
  ListChecks,
  RotateCcw,
  ShieldCheck,
  Wand2,
  Workflow,
} from 'lucide-react'

import {
  listAutofixFindings,
  listAutofixRuns,
  type AutofixFindingRow,
  type AutofixRunLogRow,
} from '@lib/engine/code/autofix'
import { autofixStatusCopy, autofixStatusReason } from '@lib/autofix/statusReason'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n'
import { colors, gradients } from '@/styles/designTokens'
import { type Severity } from '@lib/tokens/severity'

type BucketKey = 'waiting' | 'ready' | 'pr' | 'blocked' | 'resolved'
type Tone = 'brand' | 'tech' | 'success' | 'warning' | 'danger' | 'neutral'

interface BucketSummary {
  key: BucketKey
  label: string
  count: number
  tone: Tone
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case 'brand': return colors.brand
    case 'tech': return colors.tech
    case 'success': return colors.semantic.success
    case 'warning': return colors.semantic.warning
    case 'danger': return colors.semantic.danger
    default: return colors.semantic.neutral
  }
}

function toSeverity(raw = ''): Severity {
  const severity = raw.toLowerCase()
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') return severity
  if (severity === 'moderate') return 'medium'
  return ''
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'critical': return t('severity.critical')
    case 'high': return t('severity.high')
    case 'medium': return t('severity.medium')
    case 'low': return t('severity.low')
    default: return tOr('severity.info', 'Info')
  }
}

function severityColor(severity: Severity): string {
  switch (severity) {
    case 'critical': return colors.severity.critical
    case 'high': return colors.severity.high
    case 'medium': return colors.severity.medium
    case 'low': return colors.severity.low
    default: return colors.semantic.neutral
  }
}

function formatI18n(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    template,
  )
}

function formatDate(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

function bucketForFinding(finding: AutofixFindingRow): BucketKey {
  const reason = autofixStatusReason(finding)
  if (finding.patch_status === 'pr_opened' || reason === 'pr_opened') return 'pr'
  if (finding.patch_status === 'preview' || reason === 'patch_ready') return 'ready'
  if (finding.patch_status === 'outdated' || reason === 'finding_resolved') return 'resolved'
  if (
    finding.patch_status === 'permanently_no_preview' ||
    reason === 'clone_failed' ||
    reason === 'detect_failed' ||
    reason === 'transform_failed' ||
    reason === 'rule_unavailable' ||
    reason === 'ambiguous_match' ||
    reason === 'retry_cap' ||
    reason === 'empty_patch'
  ) return 'blocked'
  return 'waiting'
}

function bucketLabel(key: BucketKey): string {
  switch (key) {
    case 'waiting': return tOr('autofix.manager.bucketWaiting', 'Awaiting preview')
    case 'ready': return tOr('autofix.manager.bucketReady', 'Ready for PR')
    case 'pr': return t('autofix.statusPROpened')
    case 'blocked': return tOr('autofix.manager.bucketBlocked', 'Needs intervention')
    case 'resolved': return t('autofix.status.findingResolved.label')
  }
}

function bucketTone(key: BucketKey): Tone {
  switch (key) {
    case 'ready': return 'success'
    case 'pr': return 'brand'
    case 'blocked': return 'danger'
    case 'resolved': return 'tech'
    default: return 'warning'
  }
}

function emptyCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return keys.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as Record<T, number>)
}

function panelSx(theme: Theme) {
  const border = theme.palette.mode === 'dark'
    ? alpha('#ffffff', 0.12)
    : alpha('#0f172a', 0.12)
  return {
    border: `1px solid ${border}`,
    borderRadius: 1,
    bgcolor: theme.palette.mode === 'dark' ? alpha('#0f172a', 0.72) : '#ffffff',
    boxShadow: theme.palette.mode === 'dark'
      ? `0 18px 42px ${alpha('#000000', 0.24)}`
      : `0 14px 32px ${alpha('#0f172a', 0.07)}`,
  } as const
}

function PageHeader({
  backlog,
  verifyRate,
  prs,
}: {
  backlog: number | null
  verifyRate: number | null
  prs: number | null
}) {
  const theme = useTheme()
  const border = theme.palette.mode === 'dark' ? alpha(colors.brand, 0.35) : alpha(colors.brand, 0.28)

  return (
    <Box
      sx={{
        ...panelSx(theme),
        borderColor: border,
        background: theme.palette.mode === 'dark'
          ? `linear-gradient(135deg, ${alpha(colors.brandDeep, 0.28)}, ${alpha(colors.techDeep, 0.1)}), ${alpha('#0b1220', 0.9)}`
          : `linear-gradient(135deg, ${alpha(colors.brand, 0.1)}, ${alpha(colors.tech, 0.07)}), #ffffff`,
        p: { xs: 1.5, lg: 2 },
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" gap={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.5} minWidth={0}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
              color: '#ffffff',
              background: gradients.autofix,
              boxShadow: `0 14px 28px ${alpha(colors.brand, 0.28)}`,
              flexShrink: 0,
            }}
          >
            <Wand2 size={22} />
          </Box>
          <Box minWidth={0}>
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: 0, lineHeight: 1.05 }}>
              {t('autofix.manager.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.35 }}>
              {t('autofix.manager.subtitle')}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          <HeaderChip
            label={t('autofix.manager.kpiEligibleBacklog')}
            value={backlog == null ? '-' : String(backlog)}
            tone="brand"
          />
          <HeaderChip
            label={t('autofix.manager.kpiVerifyPassRate')}
            value={verifyRate == null ? '-' : `${verifyRate}%`}
            tone={verifyRate == null ? 'neutral' : verifyRate >= 90 ? 'success' : verifyRate >= 70 ? 'warning' : 'danger'}
          />
          <HeaderChip
            label={t('autofix.manager.kpiPRsOpened')}
            value={prs == null ? '-' : String(prs)}
            tone="tech"
          />
        </Stack>
      </Stack>
    </Box>
  )
}

function HeaderChip({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const theme = useTheme()
  const color = toneColor(tone)
  return (
    <Box
      sx={{
        minWidth: 118,
        border: `1px solid ${alpha(color, theme.palette.mode === 'dark' ? 0.45 : 0.28)}`,
        borderRadius: 1,
        px: 1.2,
        py: 0.8,
        bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.13 : 0.08),
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.1 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ color, fontWeight: 900, lineHeight: 1.1, mt: 0.35 }}>
        {value}
      </Typography>
    </Box>
  )
}

function StatusFunnel({
  buckets,
  passed,
  failed,
}: {
  buckets: BucketSummary[]
  passed: number
  failed: number
}) {
  const theme = useTheme()
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count), passed, failed)

  return (
    <Box sx={{ ...panelSx(theme), p: 1.75 }}>
      <SectionHeading
        icon={<Workflow size={17} />}
        title={tOr('autofix.manager.statusFunnel', 'Repair funnel')}
        subtitle={tOr('autofix.manager.statusFunnelSub', 'Backend states grouped by readiness')}
      />
      <Stack spacing={1.25} sx={{ mt: 1.55 }}>
        {buckets.map((bucket) => (
          <FunnelRow key={bucket.key} label={bucket.label} count={bucket.count} max={max} tone={bucket.tone} />
        ))}
        <FunnelRow
          label={tOr('autofix.manager.verifiedPatches', 'Verified patches')}
          count={passed}
          max={max}
          tone="success"
        />
        <FunnelRow
          label={tOr('autofix.manager.failedPatches', 'Failed gates')}
          count={failed}
          max={max}
          tone={failed > 0 ? 'danger' : 'neutral'}
        />
      </Stack>
    </Box>
  )
}

function FunnelRow({ label, count, max, tone }: { label: string; count: number; max: number; tone: Tone }) {
  const theme = useTheme()
  const color = toneColor(tone)
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 900, color }}>
          {count}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, (count / max) * 100))}
        sx={{
          height: 7,
          borderRadius: 1,
          mt: 0.5,
          bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.16 : 0.12),
          '& .MuiLinearProgress-bar': {
            borderRadius: 1,
            bgcolor: color,
          },
        }}
      />
    </Box>
  )
}

function PriorityQueue({
  rows,
  loading,
}: {
  rows: AutofixFindingRow[]
  loading: boolean
}) {
  const theme = useTheme()

  return (
    <Box sx={{ ...panelSx(theme), minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 1.8, py: 1.45, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.9)}` }}>
        <SectionHeading
          icon={<ListChecks size={17} />}
          title={tOr('autofix.manager.priorityTitle', 'Priority repair queue')}
          subtitle={t('autofix.manager.backlogSubtitle')}
          value={loading ? '-' : String(rows.length)}
        />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '88px minmax(0,1fr) 128px', xl: '96px minmax(0,1fr) 150px 170px' },
          gap: 1.25,
          px: 1.8,
          py: 1,
          bgcolor: theme.palette.mode === 'dark' ? alpha('#ffffff', 0.045) : alpha('#0f172a', 0.04),
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
        }}
      >
        <HeaderCell>{t('common.severity')}</HeaderCell>
        <HeaderCell>{t('autofix.manager.chartCategoryLabel')}</HeaderCell>
        <HeaderCell>{t('common.status')}</HeaderCell>
        <HeaderCell sx={{ display: { xs: 'none', xl: 'block' } }}>{t('warroom.repoName')}</HeaderCell>
      </Box>
      <Box sx={{ minHeight: 0, overflow: 'auto' }}>
        {rows.length === 0 ? (
          <Box sx={{ minHeight: 240, display: 'grid', placeItems: 'center', p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {loading ? t('common.loading') : tOr('autofix.manager.noBacklog', 'No repair backlog is waiting for manager review.')}
            </Typography>
          </Box>
        ) : (
          rows.map((finding) => <QueueRow key={finding.id || finding.fingerprint} finding={finding} />)
        )}
      </Box>
    </Box>
  )
}

function HeaderCell({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0, ...sx }}>
      {children}
    </Typography>
  )
}

function QueueRow({ finding }: { finding: AutofixFindingRow }) {
  const theme = useTheme()
  const severity = toSeverity(finding.severity)
  const sevColor = severityColor(severity)
  const status = autofixStatusCopy(finding)
  const bucket = bucketForFinding(finding)
  const bucketColor = toneColor(bucketTone(bucket))
  const statusLabel = bucket === 'waiting' ? bucketLabel(bucket) : status.label || bucketLabel(bucket)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '88px minmax(0,1fr) 128px', xl: '96px minmax(0,1fr) 150px 170px' },
        gap: 1.25,
        alignItems: 'center',
        px: 1.8,
        py: 1.2,
        minHeight: 74,
        borderBottom: `1px solid ${alpha(theme.palette.divider, theme.palette.mode === 'dark' ? 0.58 : 0.75)}`,
        '&:hover': {
          bgcolor: alpha(colors.brand, theme.palette.mode === 'dark' ? 0.08 : 0.045),
        },
      }}
    >
      <Chip
        size="small"
        label={severityLabel(severity)}
        sx={{
          width: 'fit-content',
          maxWidth: '100%',
          fontWeight: 900,
          borderRadius: 1,
          color: sevColor,
          bgcolor: alpha(sevColor, theme.palette.mode === 'dark' ? 0.18 : 0.1),
        }}
      />
      <Box minWidth={0}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 900 }}>
          {finding.title || finding.rule_title || finding.rule_id || t('autofix.manager.findingFallbackTitle')}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>
          {[finding.rule_category, finding.file_path].filter(Boolean).join(' / ')}
        </Typography>
      </Box>
      <Chip
        size="small"
        label={statusLabel}
        sx={{
          width: 'fit-content',
          maxWidth: '100%',
          fontWeight: 900,
          borderRadius: 1,
          color: bucketColor,
          bgcolor: alpha(bucketColor, theme.palette.mode === 'dark' ? 0.18 : 0.1),
          '& .MuiChip-label': {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }}
      />
      <Typography
        variant="body2"
        noWrap
        sx={{ display: { xs: 'none', xl: 'block' }, color: 'text.secondary', fontWeight: 800 }}
      >
        {finding.repo_name || finding.repo_id || tOr('autofix.manager.repoFallback', 'Repository')}
      </Typography>
    </Box>
  )
}

function LatestRuns({ runs }: { runs: AutofixRunLogRow[] }) {
  const theme = useTheme()

  return (
    <Box sx={{ ...panelSx(theme), p: 1.75, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <SectionHeading
        icon={<RotateCcw size={17} />}
        title={tOr('autofix.manager.latestRunsTitle', 'Recent automation runs')}
        subtitle={tOr('autofix.manager.latestRunsSub', 'PR output and gate results')}
      />
      <Stack spacing={0.95} sx={{ mt: 1.4, minHeight: 0, overflow: 'auto' }}>
        {runs.length === 0 ? (
          <Box sx={{ minHeight: 116, display: 'grid', placeItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">{tOr('autofix.manager.noRuns', 'No AutoFix runs yet')}</Typography>
          </Box>
        ) : (
          runs.map((run) => <RunRow key={run.ID} run={run} />)
        )}
      </Stack>
    </Box>
  )
}

function RunRow({ run }: { run: AutofixRunLogRow }) {
  const theme = useTheme()
  const failed = run.PatchesFailed ?? 0
  const passed = run.PatchesPassed ?? 0
  const prs = run.PRsOpened ?? 0
  const tone: Tone = failed > 0 ? 'danger' : passed > 0 || prs > 0 ? 'success' : 'neutral'
  const color = toneColor(tone)

  return (
    <Box
      sx={{
        border: `1px solid ${alpha(color, theme.palette.mode === 'dark' ? 0.3 : 0.18)}`,
        borderRadius: 1,
        px: 1,
        py: 0.9,
        bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.1 : 0.055),
      }}
    >
      <Stack direction="row" justifyContent="space-between" gap={1}>
        <Box minWidth={0}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 900 }}>
            {run.RepoID || tOr('autofix.manager.repoFallback', 'Repository')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {formatDate(run.StartedAt)}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={formatI18n(tOr('autofix.manager.runMeta', '{passed} pass / {failed} fail / {prs} PR'), {
            passed,
            failed,
            prs,
          })}
          sx={{
            height: 24,
            borderRadius: 1,
            fontWeight: 900,
            color,
            bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.18 : 0.1),
          }}
        />
      </Stack>
    </Box>
  )
}

function DistributionPanel({
  severityCounts,
  categoryCounts,
}: {
  severityCounts: Record<Severity, number>
  categoryCounts: Array<[string, number]>
}) {
  const theme = useTheme()
  const severityTotal = Object.values(severityCounts).reduce((sum, value) => sum + value, 0)
  const categoryTotal = categoryCounts.reduce((sum, [, value]) => sum + value, 0)

  return (
    <Box sx={{ ...panelSx(theme), p: 1.75 }}>
      <SectionHeading
        icon={<ShieldCheck size={17} />}
        title={tOr('autofix.manager.patchReadiness', 'Patch readiness')}
        subtitle={tOr('autofix.manager.patchReadinessSub', 'Severity and rule family mix')}
      />
      <Stack spacing={1.25} sx={{ mt: 1.4 }}>
        {(['critical', 'high', 'medium', 'low'] as Severity[]).map((severity) => (
          severityCounts[severity] > 0 ? (
            <MiniBar
              key={severity}
              label={severityLabel(severity)}
              value={severityCounts[severity]}
              total={severityTotal}
              color={severityColor(severity)}
            />
          ) : null
        ))}
        {severityTotal === 0 && (
          <Typography variant="body2" color="text.secondary">{t('autofix.manager.chartEmptyFindings')}</Typography>
        )}
      </Stack>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1.35 }}>
        {categoryCounts.slice(0, 5).map(([category, count]) => (
          <Chip
            key={category}
            size="small"
            label={`${category || tOr('autofix.manager.uncategorized', 'Uncategorized')} ${count}`}
            sx={{
              borderRadius: 1,
              fontWeight: 900,
              color: colors.tech,
              bgcolor: alpha(colors.tech, theme.palette.mode === 'dark' ? 0.16 : 0.08),
            }}
          />
        ))}
        {categoryTotal === 0 && null}
      </Stack>
    </Box>
  )
}

function MiniBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const theme = useTheme()
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 900, color }}>{value}</Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={total > 0 ? (value / total) * 100 : 0}
        sx={{
          height: 7,
          borderRadius: 1,
          mt: 0.45,
          bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.15 : 0.11),
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
        }}
      />
    </Box>
  )
}

function SectionHeading({
  icon,
  title,
  subtitle,
  value,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  value?: string
}) {
  return (
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.2}>
      <Stack direction="row" alignItems="flex-start" spacing={1} minWidth={0}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            display: 'grid',
            placeItems: 'center',
            color: colors.brand,
            bgcolor: alpha(colors.brand, 0.1),
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box minWidth={0}>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 900, lineHeight: 1.15 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.2 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Stack>
      {value ? (
        <Chip
          size="small"
          label={value}
          sx={{
            borderRadius: 1,
            fontWeight: 900,
            color: colors.brand,
            bgcolor: alpha(colors.brand, 0.12),
          }}
        />
      ) : null}
    </Stack>
  )
}

export function AutofixManagerView({ orgId }: { orgId: string | undefined }) {
  const runsQ = useQuery({
    queryKey: qk.autofix.runs(orgId),
    queryFn: () => listAutofixRuns(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
    retry: false,
  })

  const findingsQ = useQuery({
    queryKey: qk.autofix.findings(orgId),
    queryFn: () => listAutofixFindings(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
    retry: false,
  })

  const runs = useMemo(
    () =>
      [...(runsQ.data?.runs ?? [])].sort(
        (a, b) => new Date(b.StartedAt).getTime() - new Date(a.StartedAt).getTime(),
      ),
    [runsQ.data],
  )

  const findings = useMemo(
    () =>
      (findingsQ.data?.findings ?? []).filter(
        (finding) => !(finding.rule_id === 'tier2-ai' && finding.patch_status === 'no_preview'),
      ),
    [findingsQ.data],
  )

  const summary = useMemo(() => {
    const bucketCounts = emptyCounts<BucketKey>(['waiting', 'ready', 'pr', 'blocked', 'resolved'])
    const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, '': 0 }
    const categoryMap = new Map<string, number>()

    for (const finding of findings) {
      bucketCounts[bucketForFinding(finding)] += 1
      severityCounts[toSeverity(finding.severity)] += 1
      const category = finding.rule_category || tOr('autofix.manager.uncategorized', 'Uncategorized')
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1)
    }

    let prs = 0
    let passed = 0
    let failed = 0
    let runFindings = 0
    for (const run of runs) {
      prs += run.PRsOpened ?? 0
      passed += run.PatchesPassed ?? 0
      failed += run.PatchesFailed ?? 0
      runFindings += run.FindingsCount ?? 0
    }

    return {
      buckets: (['ready', 'pr', 'waiting', 'blocked', 'resolved'] as BucketKey[]).map((key) => ({
        key,
        label: bucketLabel(key),
        count: bucketCounts[key],
        tone: bucketTone(key),
      })),
      severityCounts,
      categoryCounts: [...categoryMap.entries()].sort((a, b) => b[1] - a[1]),
      prs,
      passed,
      failed,
      runFindings,
      verifyRate: passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : null,
    }
  }, [findings, runs])

  const priorityRows = useMemo(() => {
    const severityRank: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2, '': 1 }
    const bucketRank: Record<BucketKey, number> = { blocked: 5, ready: 4, waiting: 3, pr: 2, resolved: 1 }
    return [...findings]
      .sort((a, b) => {
        const bucketDiff = bucketRank[bucketForFinding(b)] - bucketRank[bucketForFinding(a)]
        if (bucketDiff !== 0) return bucketDiff
        const severityDiff = severityRank[toSeverity(b.severity)] - severityRank[toSeverity(a.severity)]
        if (severityDiff !== 0) return severityDiff
        return new Date(b.detected_at || 0).getTime() - new Date(a.detected_at || 0).getTime()
      })
      .slice(0, 24)
  }, [findings])

  const loadingFindings = findingsQ.isLoading && !findingsQ.data

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        width: '100%',
        maxWidth: 1580,
        mx: 'auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.35,
        overflow: 'hidden',
        p: { xs: 1.25, md: 1.5 },
      }}
    >
      <PageHeader
        backlog={findingsQ.data ? findings.length : null}
        verifyRate={summary.verifyRate}
        prs={runsQ.data ? summary.prs : null}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          overflowX: 'hidden',
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: 'minmax(0, 1fr) minmax(360px, 420px)',
            xl: 'minmax(0, 1fr) minmax(380px, 440px)',
          },
          alignItems: 'stretch',
          gap: 1.35,
        }}
      >
        <Box sx={{ minHeight: 0, overflow: 'hidden', display: 'grid' }}>
          <PriorityQueue rows={priorityRows} loading={loadingFindings} />
        </Box>

        <Box
          sx={{
            minHeight: 0,
            maxHeight: '100%',
            overflowX: 'hidden',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.35,
            pr: 0.25,
            scrollbarGutter: 'stable',
            '& > *': {
              flex: '0 0 auto',
            },
          }}
        >
          <StatusFunnel buckets={summary.buckets} passed={summary.passed} failed={summary.failed} />
          <LatestRuns runs={runs.slice(0, 8)} />
          <DistributionPanel severityCounts={summary.severityCounts} categoryCounts={summary.categoryCounts} />
        </Box>
      </Box>
    </Box>
  )
}
