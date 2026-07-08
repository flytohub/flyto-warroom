/**
 * IssuesManagerView - manager-mode command board for code security issues.
 *
 * The backend-owned enriched issues endpoint remains the source of truth:
 *   GET /issues?enrich=true&status=open
 *
 * This view does not invent scores. It only rolls up the returned issues into
 * the decisions a manager needs: critical/high backlog, exploit exposure,
 * fix-readiness, repository concentration, and the next priority queue.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  AlertTriangle,
  Crosshair,
  Flame,
  GitPullRequestArrow,
  ListChecks,
  Package,
  ShieldAlert,
  ShieldCheck,
  Wand2,
} from 'lucide-react'

import { getEnrichedOrgIssues, type EnrichedSecurityIssue } from '@lib/engine/code/issues'
import { type Severity } from '@lib/tokens/severity'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n'
import { colors } from '@/styles/designTokens'

type SeverityBucket = Exclude<Severity, ''>

interface ManagerStats {
  total: number
  crit: number
  high: number
  medium: number
  low: number
  kev: number
  autofixable: number
  exposed: number
  kevExposed: number
  autofixPct: number
  urgent: number
}

interface PriorityIssue {
  id: string
  title: string
  repo: string
  meta: string
  score: number
  severity: Severity
  badges: string[]
}

interface RepoRisk {
  repo: string
  total: number
  criticalHigh: number
  autofixable: number
}

function normSev(s: string): Severity {
  switch ((s || '').toLowerCase()) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'moderate':
    case 'medium': return 'medium'
    case 'low': return 'low'
    default: return ''
  }
}

const SEVERITIES: SeverityBucket[] = ['critical', 'high', 'medium', 'low']
const ACCENT = colors.brand
const RISK_TONE = colors.semantic.danger
const MUTED_TONE = colors.semantic.neutral

function issueWeight(issue: EnrichedSecurityIssue): number {
  const sev = normSev(issue.severity)
  const sevScore = sev === 'critical' ? 80 : sev === 'high' ? 56 : sev === 'medium' ? 32 : sev === 'low' ? 12 : 0
  return (
    Math.max(issue.risk_score ?? 0, sevScore) +
    (issue.in_kev ? 36 : 0) +
    (issue.external_exposed ? 24 : 0) +
    (issue.autofix_eligible ? 8 : 0) +
    Math.min(issue.blast_radius ?? 0, 20)
  )
}

function issueUnits(issue: EnrichedSecurityIssue): number {
  return issue ? 1 : 0
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function severityLabel(sev: Severity): string {
  if (sev === 'critical') return t('common.critical')
  if (sev === 'high') return t('common.high')
  if (sev === 'medium') return t('common.medium')
  if (sev === 'low') return t('common.low')
  return tOr('common.other', 'Other')
}

function managerToneForSeverity(sev: Severity): string {
  return sev === 'critical' || sev === 'high' ? RISK_TONE : MUTED_TONE
}

export function IssuesManagerView() {
  const { orgId } = useParams<{ orgId: string }>()

  const issuesQ = useQuery({
    queryKey: qk.ctem.enrichedIssues(orgId, 'manager'),
    queryFn: () => getEnrichedOrgIssues(orgId!, { status: 'open' }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const rows = useMemo<EnrichedSecurityIssue[]>(() => issuesQ.data?.issues ?? [], [issuesQ.data])
  const counts = issuesQ.data?.counts
  const loading = issuesQ.isLoading

  const stats = useMemo<ManagerStats>(() => {
    let crit = 0
    let high = 0
    let medium = 0
    let low = 0
    let kev = 0
    let autofixable = 0
    let exposed = 0
    let kevExposed = 0

    for (const issue of rows) {
      const units = issueUnits(issue)
      const sev = normSev(issue.severity)
      if (sev === 'critical') crit += units
      if (sev === 'high') high += units
      if (sev === 'medium') medium += units
      if (sev === 'low') low += units
      if (issue.in_kev) kev += units
      if (issue.autofix_eligible) autofixable += units
      if (issue.external_exposed) exposed += units
      if (issue.in_kev && issue.external_exposed) kevExposed += units
    }

    const total = counts?.open ?? rows.reduce((sum, issue) => sum + issueUnits(issue), 0)
    const autofixPct = total > 0 ? Math.round((autofixable / total) * 100) : 0
    return { total, crit, high, medium, low, kev, autofixable, exposed, kevExposed, autofixPct, urgent: crit + high }
  }, [rows, counts])

  const typeMix = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const issue of rows) {
      const key = issue.type || 'other'
      grouped.set(key, (grouped.get(key) ?? 0) + issueUnits(issue))
    }
    return [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [rows])

  const repoRisks = useMemo<RepoRisk[]>(() => {
    const grouped = new Map<string, RepoRisk>()
    for (const issue of rows) {
      const repo = issue.repo_name || issue.repo_id || tOr('common.unknown', 'Unknown')
      const current = grouped.get(repo) ?? { repo, total: 0, criticalHigh: 0, autofixable: 0 }
      const units = issueUnits(issue)
      const sev = normSev(issue.severity)
      current.total += units
      if (sev === 'critical' || sev === 'high') current.criticalHigh += units
      if (issue.autofix_eligible) current.autofixable += units
      grouped.set(repo, current)
    }
    return [...grouped.values()]
      .sort((a, b) => b.criticalHigh - a.criticalHigh || b.total - a.total)
      .slice(0, 5)
  }, [rows])

  const priorityItems = useMemo<PriorityIssue[]>(() => {
    return [...rows]
      .sort((a, b) => issueWeight(b) - issueWeight(a))
      .slice(0, 5)
      .map((issue) => {
        const badges = [
          issue.in_kev ? 'KEV' : null,
          issue.external_exposed ? tOr('exposure.issuesManager.badge.exposed', 'Exposed') : null,
          issue.autofix_eligible ? t('exposure.issuesManager.autofixableLabel') : null,
        ].filter((value): value is string => !!value)
        const meta = [issue.type, issue.package].filter(Boolean).join(' / ')
        return {
          id: issue.fingerprint || issue.id,
          title: issue.title || issue.cve_id || issue.type || tOr('common.issue', 'Issue'),
          repo: issue.repo_name || issue.repo_id || tOr('common.unknown', 'Unknown'),
          meta,
          score: Math.round(issueWeight(issue)),
          severity: normSev(issue.severity),
          badges,
        }
      })
  }, [rows])

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        p: { xs: 1.25, md: 2 },
        maxWidth: 1560,
        mx: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <IssuesHeader loading={loading} />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          pr: 0.35,
          pb: 1.25,
          scrollbarGutter: 'stable',
          overscrollBehavior: 'contain',
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.92fr) minmax(420px, 1.08fr)' },
            alignItems: 'stretch',
            gap: 1.25,
            minWidth: 0,
          }}
        >
          <CommandPanel stats={stats} loading={loading} />
          <PriorityPanel items={priorityItems} loading={loading} />
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
            gap: 1.25,
            minWidth: 0,
            alignItems: 'stretch',
          }}
        >
          <SeverityPanel stats={stats} loading={loading} />
          <RepoPanel rows={repoRisks} total={stats.total} loading={loading} />
          <TypePanel rows={typeMix} total={stats.total} loading={loading} />
        </Box>

        <DecisionBrief stats={stats} repos={repoRisks} loading={loading} />
      </Box>
    </Box>
  )
}

function IssuesHeader({ loading }: { loading: boolean }) {
  const theme = useTheme()
  return (
    <Paper
      elevation={0}
      sx={{
        flexShrink: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, 0.08),
        px: { xs: 1.5, md: 2 },
        py: 1.1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        bgcolor: alpha(theme.palette.background.paper, 0.94),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        <IconTile tone={ACCENT} quiet>
          <ShieldAlert size={20} />
        </IconTile>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 950, lineHeight: 1.08 }} noWrap>
            {t('exposure.issuesManager.managerTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }} noWrap>
            {t('exposure.issuesManager.managerSubtitle')}
          </Typography>
        </Box>
      </Box>
      <Chip
        size="small"
        icon={<ListChecks size={14} />}
        label={loading ? tOr('common.loading', 'Loading') : tOr('exposure.issuesManager.liveEngine', 'Live issues engine')}
        sx={{
          height: 28,
          borderRadius: 1,
          fontWeight: 850,
          bgcolor: alpha(theme.palette.text.primary, 0.05),
          color: 'text.secondary',
          '& .MuiChip-icon': { color: 'inherit' },
        }}
      />
    </Paper>
  )
}

function CommandPanel({ stats, loading }: { stats: ManagerStats; loading: boolean }) {
  const theme = useTheme()
  const urgentTone = stats.urgent > 0 ? RISK_TONE : ACCENT
  const urgentPct = stats.total > 0 ? Math.min(100, Math.round((stats.urgent / stats.total) * 100)) : 0
  const manualCount = Math.max(0, stats.total - stats.autofixable)
  const shell = theme.palette.mode === 'dark'
    ? theme.palette.background.paper
    : `linear-gradient(135deg, ${theme.palette.grey[900]} 0%, ${colors.brandDarkest} 100%)`

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(ACCENT, 0.34),
        bgcolor: theme.palette.grey[900],
        background: shell,
        overflow: 'hidden',
        minHeight: { xs: 0, xl: 318 },
        height: 'auto',
        color: '#fff',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.24,
          backgroundImage: `
            linear-gradient(${alpha('#fff', 0.07)} 1px, transparent 1px),
            linear-gradient(90deg, ${alpha('#fff', 0.06)} 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'linear-gradient(90deg, #000 0%, transparent 78%)',
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          minHeight: { xs: 0, xl: 318 },
          p: { xs: 1.5, md: 2 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(210px, 0.85fr) minmax(0, 1.15fr)' },
          gap: 1.45,
          alignItems: 'stretch',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 900, color: alpha('#fff', 0.66), textTransform: 'uppercase', letterSpacing: 0 }}>
            {tOr('exposure.issuesManager.commandTitle', 'Repair command')}
          </Typography>
          <Typography sx={{ mt: 0.45, fontSize: { xs: 42, md: 58 }, lineHeight: 0.9, fontWeight: 950, color: urgentTone }}>
            {loading ? <Skeleton width={90} /> : formatNumber(stats.urgent)}
          </Typography>
          <Typography sx={{ mt: 0.8, fontSize: 20, fontWeight: 950, color: '#fff' }}>
            {loading
              ? tOr('common.loading', 'Loading')
              : stats.urgent > 0
              ? tOr('exposure.issuesManager.commandCritical', 'Critical / High need attention')
              : tOr('exposure.issuesManager.commandStable', 'No critical or high backlog')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.65, lineHeight: 1.55, color: alpha('#fff', 0.72), maxWidth: 360 }}>
            {tOr(
              'exposure.issuesManager.commandSubtitle',
              'Lead with exploitable and high-impact issues before broad cleanup.',
            )}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gap: 1.15, minWidth: 0, alignContent: 'center' }}>
          <MetricGrid>
            <DecisionMetric dark icon={<AlertTriangle size={16} />} tone={RISK_TONE} label={t('common.critical')} value={stats.crit} loading={loading} />
            <DecisionMetric dark icon={<Flame size={16} />} tone={RISK_TONE} label={t('common.high')} value={stats.high} loading={loading} />
            <DecisionMetric dark icon={<Crosshair size={16} />} tone={stats.kevExposed > 0 ? RISK_TONE : ACCENT} label={t('exposure.issuesManager.kevExposed')} value={stats.kevExposed} loading={loading} />
            <DecisionMetric dark icon={<GitPullRequestArrow size={16} />} tone={ACCENT} label={t('exposure.issuesManager.autofixableLabel')} value={stats.autofixable} loading={loading} />
          </MetricGrid>
        </Box>

        <Box
          sx={{
            gridColumn: { xs: 'auto', md: '1 / -1' },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            gap: 0.85,
            mt: { xs: 0.2, md: 0 },
          }}
        >
          <CommandLane
            tone={RISK_TONE}
            label={tOr('exposure.issuesManager.criticalHighShare', 'Critical / High share')}
            primary={`${formatNumber(stats.urgent)} / ${formatNumber(stats.total)}`}
            value={urgentPct}
            loading={loading}
          />
          <CommandLane
            tone={ACCENT}
            label={tOr('exposure.issuesManager.fixReady', 'Fix-ready coverage')}
            primary={`${formatNumber(stats.autofixable)} / ${formatNumber(stats.total)}`}
            value={stats.autofixPct}
            loading={loading}
          />
          <CommandLane
            tone={MUTED_TONE}
            label={tOr('exposure.issuesManager.manualReview', 'Manual review')}
            primary={formatNumber(manualCount)}
            value={stats.total > 0 ? Math.min(100, Math.round((manualCount / stats.total) * 100)) : 0}
            loading={loading}
          />
        </Box>
      </Box>
    </Paper>
  )
}

function PriorityPanel({ items, loading }: { items: PriorityIssue[]; loading: boolean }) {
  const theme = useTheme()
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.08),
        bgcolor: alpha(theme.palette.background.paper, 0.97),
        minHeight: 0,
        height: 'auto',
        maxHeight: { xs: 'none', xl: 360 },
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PanelHeader
        icon={<ListChecks size={17} />}
        title={t('exposure.issuesManager.priorityQueueTitle')}
        subtitle={t('exposure.issuesManager.priorityQueueSubtitle')}
        count={items.length}
      />
      <Divider />
      <Box sx={{ minHeight: 0, overflow: 'auto', px: 1.15, py: 0.55 }}>
        {loading ? (
          <Stack spacing={1}>
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} height={48} />)}
          </Stack>
        ) : items.length ? (
          <Stack divider={<Divider flexItem />} sx={{ mx: -0.25 }}>
            {items.map((item) => <PriorityRow key={item.id} item={item} />)}
          </Stack>
        ) : (
          <EmptyState text={t('exposure.issuesManager.empty.priorityQueue')} />
        )}
      </Box>
    </Paper>
  )
}

function PriorityRow({ item }: { item: PriorityIssue }) {
  const tone = managerToneForSeverity(item.severity)
  const theme = useTheme()
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center', py: 1, px: 0.25 }}>
      <Box sx={{ minWidth: 0, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box sx={{ mt: 0.2, width: 3, height: 42, borderRadius: 99, bgcolor: tone, flexShrink: 0 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 900, lineHeight: 1.25 }} noWrap title={item.title}>
            {item.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }} noWrap>
            {item.repo}{item.meta ? ` / ${item.meta}` : ''}
          </Typography>
          {item.badges.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.45, flexWrap: 'wrap', mt: 0.55 }}>
              {item.badges.map((badge) => (
                <Chip
                  key={badge}
                  size="small"
                  label={badge}
                  sx={{
                    height: 20,
                    borderRadius: 0.8,
                    fontSize: 11,
                    fontWeight: 850,
                    bgcolor: alpha(theme.palette.text.primary, 0.045),
                    color: 'text.secondary',
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ textAlign: 'right', minWidth: 52 }}>
        <Typography sx={{ fontSize: 17, lineHeight: 1, fontWeight: 950, color: 'text.primary' }}>{item.score}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>{tOr('exposure.issuesManager.queueRisk', 'risk')}</Typography>
      </Box>
    </Box>
  )
}

function SeverityPanel({ stats, loading }: { stats: ManagerStats; loading: boolean }) {
  const values: Record<SeverityBucket, number> = {
    critical: stats.crit,
    high: stats.high,
    medium: stats.medium,
    low: stats.low,
  }
  return (
    <DataPanel icon={<ShieldAlert size={17} />} title={t('exposure.issuesManager.severityMixTitle')} subtitle={tOr('exposure.issuesManager.severityPanelSubtitle', 'Backlog by impact level')}>
      <Stack spacing={1}>
        {SEVERITIES.map((sev) => (
          <BarLine
            key={sev}
            label={severityLabel(sev)}
            value={values[sev]}
            total={Math.max(1, stats.total)}
            tone={managerToneForSeverity(sev)}
            loading={loading}
          />
        ))}
      </Stack>
    </DataPanel>
  )
}

function RepoPanel({ rows, total, loading }: { rows: RepoRisk[]; total: number; loading: boolean }) {
  return (
    <DataPanel icon={<Package size={17} />} title={tOr('exposure.issuesManager.repoConcentrationTitle', 'Repository concentration')} subtitle={tOr('exposure.issuesManager.repoConcentrationSubtitle', 'Where the open risk is sitting')}>
      {loading ? (
        <Stack spacing={1}>{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={32} />)}</Stack>
      ) : rows.length ? (
        <Stack spacing={1}>
          {rows.map((row) => (
            <BarLine
              key={row.repo}
              label={row.repo}
              value={row.total}
              total={Math.max(1, total)}
              tone={ACCENT}
              detail={`${formatNumber(row.criticalHigh)} ${tOr('exposure.issuesManager.criticalHighShort', 'crit/high')}`}
            />
          ))}
        </Stack>
      ) : (
        <EmptyState text={t('exposure.issuesManager.empty.openIssues')} compact />
      )}
    </DataPanel>
  )
}

function TypePanel({ rows, total, loading }: { rows: Array<[string, number]>; total: number; loading: boolean }) {
  return (
    <DataPanel icon={<Wand2 size={17} />} title={tOr('exposure.issuesManager.typeMixTitle', 'Issue type mix')} subtitle={tOr('exposure.issuesManager.typeMixSubtitle', 'Rollup source of the queue')}>
      {loading ? (
        <Stack spacing={1}>{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={32} />)}</Stack>
      ) : rows.length ? (
        <Stack spacing={1}>
          {rows.map(([name, value]) => (
            <BarLine
              key={name}
              label={name}
              value={value}
              total={Math.max(1, total)}
              tone={ACCENT}
            />
          ))}
        </Stack>
      ) : (
        <EmptyState text={t('exposure.issuesManager.empty.categorize')} compact />
      )}
    </DataPanel>
  )
}

function DecisionBrief({ stats, repos, loading }: { stats: ManagerStats; repos: RepoRisk[]; loading: boolean }) {
  const theme = useTheme()
  const manualCount = Math.max(0, stats.total - stats.autofixable)
  const topRepo = repos[0]
  return (
    <Paper
      elevation={0}
      sx={{
        gridColumn: { xs: 'auto', lg: '1 / -1' },
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, 0.08),
        bgcolor: alpha(theme.palette.background.paper, 0.97),
        p: 1.2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 950, lineHeight: 1.2 }} noWrap>
            {tOr('exposure.issuesManager.decisionBriefTitle', 'Decision brief')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.15 }} noWrap>
            {tOr('exposure.issuesManager.decisionBriefSubtitle', 'What needs leadership attention before broad cleanup')}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={`${formatNumber(stats.total)} ${tOr('exposure.issuesManager.totalOpen', 'Open')}`}
          sx={{ height: 24, borderRadius: 0.8, fontWeight: 850, bgcolor: alpha(theme.palette.text.primary, 0.055), color: 'text.secondary' }}
        />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          gap: 0.85,
        }}
      >
        <BriefCell
          tone={RISK_TONE}
          label={tOr('exposure.issuesManager.briefHighRisk', 'Triage focus')}
          value={loading ? '--' : formatNumber(stats.urgent)}
          detail={`${formatNumber(stats.crit)} ${t('common.critical')} / ${formatNumber(stats.high)} ${t('common.high')}`}
        />
        <BriefCell
          tone={ACCENT}
          label={tOr('exposure.issuesManager.briefTopRepo', 'Most concentrated repo')}
          value={loading ? '--' : (topRepo?.repo ?? tOr('common.none', 'None'))}
          detail={topRepo ? `${formatNumber(topRepo.total)} ${tOr('exposure.issuesManager.totalOpen', 'Open')} / ${formatNumber(topRepo.criticalHigh)} ${tOr('exposure.issuesManager.criticalHighShort', 'crit/high')}` : '--'}
        />
        <BriefCell
          tone={ACCENT}
          label={tOr('exposure.issuesManager.briefFixPath', 'Fix path')}
          value={loading ? '--' : formatNumber(stats.autofixable)}
          detail={`${formatNumber(stats.autofixPct)}% ${tOr('exposure.issuesManager.fixReady', 'Fix-ready coverage')}`}
        />
        <BriefCell
          tone={MUTED_TONE}
          label={tOr('exposure.issuesManager.manualReview', 'Manual review')}
          value={loading ? '--' : formatNumber(manualCount)}
          detail={`${formatNumber(stats.total)} ${tOr('exposure.issuesManager.totalOpen', 'Open')}`}
        />
      </Box>
    </Paper>
  )
}

function BriefCell({ tone, label, value, detail }: { tone: string; label: React.ReactNode; value: React.ReactNode; detail: React.ReactNode }) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        minWidth: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, 0.075),
        bgcolor: alpha(theme.palette.text.primary, 0.025),
        p: 1,
        boxShadow: `inset 3px 0 0 ${tone}`,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 850 }} noWrap>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.35, fontSize: 18, lineHeight: 1.15, fontWeight: 950 }} noWrap title={typeof value === 'string' ? value : undefined}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={typeof detail === 'string' ? detail : undefined}>
        {detail}
      </Typography>
    </Box>
  )
}

function DataPanel({ icon, title, subtitle, children }: { icon: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.25,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.08),
        bgcolor: alpha(theme.palette.background.paper, 0.97),
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', gap: 0.9, alignItems: 'center', mb: 1.15, minWidth: 0 }}>
        <IconTile tone={ACCENT} small quiet>{icon}</IconTile>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 950, lineHeight: 1.15 }} noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2 }} noWrap>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {children}
    </Paper>
  )
}

function PanelHeader({ icon, title, subtitle, count }: { icon: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; count?: number }) {
  const theme = useTheme()
  return (
    <Box sx={{ p: 1.35, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 0.9, minWidth: 0 }}>
        <IconTile tone={ACCENT} small quiet>{icon}</IconTile>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 950, lineHeight: 1.12 }} noWrap>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3 }} noWrap>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {count != null && (
        <Chip
          size="small"
          label={formatNumber(count)}
          sx={{
            height: 24,
            borderRadius: 0.8,
            fontWeight: 900,
            bgcolor: alpha(theme.palette.text.primary, 0.055),
            color: 'text.secondary',
          }}
        />
      )}
    </Box>
  )
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 0.75 }}>
      {children}
    </Box>
  )
}

function DecisionMetric({ icon, tone, label, value, loading, dark }: { icon: React.ReactNode; tone: string; label: React.ReactNode; value: number; loading?: boolean; dark?: boolean }) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        p: 0.85,
        borderRadius: 1,
        border: '1px solid',
        borderColor: dark ? alpha('#fff', 0.16) : alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.08),
        bgcolor: dark ? alpha('#fff', 0.07) : alpha(theme.palette.background.paper, 0.72),
        minWidth: 0,
      }}
    >
      <Box sx={{ color: tone, display: 'flex', mb: 0.5 }}>{icon}</Box>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, color: dark ? alpha('#fff', 0.66) : 'text.secondary' }} noWrap>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 24, lineHeight: 1, fontWeight: 950, color: dark ? '#fff' : 'text.primary', mt: 0.35 }}>
        {loading ? <Skeleton width={38} /> : formatNumber(value)}
      </Typography>
    </Box>
  )
}

function CommandLane({ tone, label, primary, value, loading }: { tone: string; label: React.ReactNode; primary: React.ReactNode; value: number; loading?: boolean }) {
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha('#fff', 0.13),
        bgcolor: alpha('#fff', 0.065),
        minWidth: 0,
      }}
    >
      <Box sx={{ mb: 0.75, minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: alpha('#fff', 0.66), fontWeight: 850, display: 'block' }} noWrap>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.1, color: '#fff', fontWeight: 950, lineHeight: 1.1 }} noWrap>
          {loading ? '--' : primary}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={loading ? 0 : value}
        sx={{
          height: 7,
          borderRadius: 99,
          bgcolor: alpha('#fff', 0.12),
          '& .MuiLinearProgress-bar': { bgcolor: tone, borderRadius: 99 },
        }}
      />
    </Box>
  )
}

function BarLine({ label, value, total, tone, loading, detail }: { label: React.ReactNode; value: number; total: number; tone: string; loading?: boolean; detail?: React.ReactNode }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 0.3 }}>
        <Typography variant="body2" sx={{ fontWeight: 850 }} noWrap title={typeof label === 'string' ? label : undefined}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.55, flexShrink: 0 }}>
          {detail && <Typography variant="caption" color="text.secondary" noWrap>{detail}</Typography>}
          <Typography variant="body2" sx={{ fontWeight: 950, color: tone }}>{loading ? '--' : formatNumber(value)}</Typography>
        </Box>
      </Box>
      <LinearProgress
        variant="determinate"
        value={loading ? 0 : pct}
        sx={{
          height: 8,
          borderRadius: 99,
          bgcolor: alpha(tone, tone === MUTED_TONE ? 0.16 : 0.12),
          '& .MuiLinearProgress-bar': { bgcolor: tone, borderRadius: 99 },
        }}
      />
    </Box>
  )
}

function IconTile({ tone, small, quiet, children }: { tone: string; small?: boolean; quiet?: boolean; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        width: small ? 28 : 38,
        height: small ? 28 : 38,
        borderRadius: small ? 1 : 1.4,
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: tone,
        bgcolor: alpha(tone, quiet ? 0.07 : 0.11),
        boxShadow: `inset 0 0 0 1px ${alpha(tone, quiet ? 0.18 : 0.24)}`,
      }}
    >
      {children}
    </Box>
  )
}

function EmptyState({ text, compact }: { text: React.ReactNode; compact?: boolean }) {
  return (
    <Box sx={{ minHeight: compact ? 96 : 180, display: 'grid', placeItems: 'center', color: 'text.secondary', textAlign: 'center', px: 2 }}>
      <Box>
        <ShieldCheck size={compact ? 18 : 24} />
        <Typography variant="body2" sx={{ mt: 0.75 }}>{text}</Typography>
      </Box>
    </Box>
  )
}
