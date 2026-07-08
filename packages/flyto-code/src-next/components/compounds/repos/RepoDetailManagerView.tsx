/**
 * Manager-mode repository detail.
 *
 * This view is intentionally a compact workbench. It renders backend-owned
 * posture, remediation and verification data; the frontend only formats the
 * evidence for operators.
 */

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  GitPullRequest,
  KeyRound,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Wrench,
  X,
} from 'lucide-react'
import { useSnackbar } from 'notistack'

import { GatedButton } from '@atoms/GatedButton'
import { ScanUploadDropzone } from '@compounds/_shared/ScanUploadDropzone'
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n'
import { getComputedScore } from '@lib/engine/scoring/scoring'
import {
  getFixPlan,
  getRepoProfile,
  listAIProposals,
  listRepoWorkflowExecutions,
  triggerScan,
  type AIProposal,
  type ConnectedRepo,
  type FixPlanBucket,
  type HealthDimension,
  type RepoProfile,
  type RepoWorkflowExecution,
} from '@lib/engine/code/repos'
import { REPO_LIST_GRADE_COLORS } from './colors'

type DetailTab = 'decision' | 'execution' | 'assurance'
type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'brand'

interface DimensionRow {
  key: string
  label: string
  dimension: HealthDimension
}

const EMPTY_PROPOSALS: AIProposal[] = []
const EMPTY_BUCKETS: FixPlanBucket[] = []
const EMPTY_EXECUTIONS: RepoWorkflowExecution[] = []

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${Math.round(value)}h`
}

function formatDateTime(value?: string | null): string {
  if (!value) return '--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '--'
  return date.toLocaleString()
}

function formatRelative(value?: string | null): string {
  if (!value) return '--'
  const ts = new Date(value).getTime()
  if (!Number.isFinite(ts)) return '--'
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function pct(dimension: HealthDimension): number {
  if (dimension.max <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((dimension.score / dimension.max) * 100)))
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case 'success': return colors.semantic.success
    case 'warning': return '#d97706'
    case 'danger': return colors.semantic.danger
    case 'brand': return colors.brand
    default: return '#64748b'
  }
}

function severityTone(value?: string | null): Tone {
  const s = String(value ?? '').toLowerCase()
  if (s.includes('critical')) return 'danger'
  if (s.includes('high')) return 'danger'
  if (s.includes('medium')) return 'warning'
  if (s.includes('low')) return 'neutral'
  return 'neutral'
}

function verdictTone(value?: string | null): Tone {
  const s = String(value ?? '').toLowerCase()
  if (['exploitable', 'suspected_exploitable', 'reachable', 'failed', 'error'].includes(s)) return 'danger'
  if (['sanitized', 'likely_sanitized', 'unreachable', 'passed'].includes(s)) return 'success'
  if (['running', 'queued', 'inconclusive'].includes(s)) return 'warning'
  return 'neutral'
}

function GradeBadge({ grade, score }: { grade?: string | null; score?: number | null }) {
  const tone = grade ? REPO_LIST_GRADE_COLORS[grade] : undefined
  return (
    <Chip
      size="small"
      label={grade || '--'}
      title={score != null ? `${Math.round(score)}` : undefined}
      sx={{
        height: 26,
        minWidth: 42,
        borderRadius: 1,
        fontSize: 13,
        fontWeight: 900,
        bgcolor: tone?.bg ?? 'action.hover',
        color: tone?.color ?? 'text.secondary',
      }}
    />
  )
}

function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const color = toneColor(tone)
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 24,
        borderRadius: 1,
        fontSize: 12,
        fontWeight: 850,
        bgcolor: alpha(color, 0.12),
        color,
      }}
    />
  )
}

function MetricTile({
  icon,
  label,
  value,
  sub,
  tone,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone: Tone
  loading?: boolean
}) {
  const theme = useTheme()
  const color = toneColor(tone)
  return (
    <Paper
      elevation={0}
      sx={{
        minHeight: 68,
        p: 1.15,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, 0.09),
        bgcolor: alpha(theme.palette.background.paper, 0.92),
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 1,
          flex: '0 0 auto',
          display: 'grid',
          placeItems: 'center',
          color,
          bgcolor: alpha(color, 0.12),
          boxShadow: `inset 0 0 0 1px ${alpha(color, 0.18)}`,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 750 }} noWrap>
          {label}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.08, color: 'text.primary' }} noWrap>
          {loading ? <CircularProgress size={16} /> : value}
        </Typography>
        {sub && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }} noWrap>
            {sub}
          </Typography>
        )}
      </Box>
    </Paper>
  )
}

function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <Chip
      clickable
      size="small"
      icon={<Box component="span" sx={{ display: 'inline-flex', color: 'inherit' }}>{icon}</Box>}
      label={label}
      onClick={onClick}
      sx={{
        height: 34,
        borderRadius: 1,
        px: 0.25,
        fontWeight: 850,
        border: '1px solid',
        borderColor: active ? colors.brand : 'divider',
        bgcolor: active ? colors.brand : 'background.paper',
        color: active ? '#fff' : 'text.primary',
        '& .MuiChip-icon': { color: 'inherit', ml: 0.7 },
        '&:hover': { bgcolor: active ? colors.brand : alpha(colors.brand, 0.08) },
      }}
    />
  )
}

function Panel({
  title,
  icon,
  children,
  action,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const theme = useTheme()
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, 0.1),
        bgcolor: alpha(theme.palette.background.paper, 0.96),
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          minHeight: 42,
          px: 1.35,
          py: 0.85,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.9) : '#f7f4ff',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          {icon && <Box sx={{ display: 'inline-flex', color: colors.brand }}>{icon}</Box>}
          <Typography variant="subtitle2" sx={{ fontWeight: 900 }} noWrap>
            {title}
          </Typography>
        </Box>
        {action}
      </Box>
      <Box sx={{ p: 1.35 }}>{children}</Box>
    </Paper>
  )
}

function EmptyLine({ text }: { text: string }) {
  return (
    <Box sx={{ minHeight: 90, display: 'grid', placeItems: 'center', color: 'text.secondary', textAlign: 'center' }}>
      <Typography variant="body2">{text}</Typography>
    </Box>
  )
}

function DimensionList({ rows }: { rows: DimensionRow[] }) {
  if (rows.length === 0) return <EmptyLine text="No health dimensions returned yet." />
  return (
    <Box sx={{ display: 'grid', gap: 1.2 }}>
      {rows.map((row) => {
        const value = pct(row.dimension)
        const tone: Tone = value >= 80 ? 'success' : value >= 55 ? 'warning' : 'danger'
        const color = toneColor(tone)
        return (
          <Box key={row.key}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 850 }} noWrap>{row.label}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                {formatNumber(row.dimension.score)} / {formatNumber(row.dimension.max)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={value}
              sx={{
                height: 8,
                borderRadius: 999,
                bgcolor: alpha(color, 0.12),
                '& .MuiLinearProgress-bar': { borderRadius: 999, bgcolor: color },
              }}
            />
            <Typography variant="caption" sx={{ display: 'block', mt: 0.35, color: 'text.secondary' }}>
              {row.dimension.status || `${value}%`}
              {row.dimension.finding_count != null ? ` - ${row.dimension.finding_count} findings` : ''}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

function FindingSummary({ profile }: { profile: RepoProfile | undefined }) {
  const rows = [
    { label: 'Critical CVEs', value: profile?.cve_critical ?? 0, tone: (profile?.cve_critical ?? 0) > 0 ? 'danger' : 'success' as Tone },
    { label: 'High CVEs', value: profile?.cve_high ?? 0, tone: (profile?.cve_high ?? 0) > 0 ? 'warning' : 'success' as Tone },
    { label: 'Secrets', value: profile?.secret_count ?? 0, tone: (profile?.secret_count ?? 0) > 0 ? 'danger' : 'success' as Tone },
    { label: 'SAST', value: profile?.sast_findings?.length ?? 0, tone: (profile?.sast_findings?.length ?? 0) > 0 ? 'warning' : 'success' as Tone },
    { label: 'Taint flows', value: profile?.taint_flow_count ?? 0, tone: (profile?.taint_flow_count ?? 0) > 0 ? 'warning' : 'success' as Tone },
    { label: 'Dead code', value: profile?.dead_code_count ?? 0, tone: (profile?.dead_code_count ?? 0) > 0 ? 'neutral' : 'success' as Tone },
  ]

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.85 }}>
      {rows.map((row) => {
        const color = toneColor(row.tone)
        return (
          <Box
            key={row.label}
            sx={{
              minHeight: 48,
              px: 1,
              py: 0.75,
              borderRadius: 1,
              bgcolor: alpha(color, 0.08),
              boxShadow: `inset 0 0 0 1px ${alpha(color, 0.12)}`,
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 750 }} noWrap>
              {row.label}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.1, color }} noWrap>
              {formatNumber(row.value)}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

function BucketList({ buckets }: { buckets: FixPlanBucket[] }) {
  if (buckets.length === 0) return <EmptyLine text="No remediation plan generated yet." />
  return (
    <Box sx={{ display: 'grid', gap: 0.85 }}>
      {buckets.map((bucket) => (
        <Box
          key={`${bucket.week}-${bucket.label ?? ''}`}
          sx={{
            p: 1,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.default',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
              {bucket.label ?? `Cycle ${bucket.week}`}
            </Typography>
            <StatusPill label={formatHours(bucket.effort_hours)} tone="brand" />
          </Box>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.35 }}>
            {bucket.items.length} item{bucket.items.length === 1 ? '' : 's'}
          </Typography>
          <Box sx={{ display: 'grid', gap: 0.5, mt: 0.75 }}>
            {bucket.items.slice(0, 4).map((item) => (
              <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 750 }} noWrap>{item.title}</Typography>
                <StatusPill label={item.severity || item.kind} tone={severityTone(item.severity)} />
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function ProposalList({ proposals }: { proposals: AIProposal[] }) {
  if (proposals.length === 0) return <EmptyLine text="No AI remediation proposals returned." />
  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      {proposals.slice(0, 8).map((proposal) => (
        <Box
          key={proposal.id}
          sx={{
            p: 1,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: proposal.accepted ? alpha(colors.semantic.success, 0.06) : 'background.default',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 1,
            alignItems: 'center',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 850 }} noWrap>
              {proposal.pr_title || proposal.finding}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }} noWrap>
              {[proposal.package, proposal.cve_id, proposal.fixed_version].filter(Boolean).join(' - ') || proposal.kind}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <StatusPill
              label={proposal.accepted ? 'Accepted' : proposal.actionable ? 'Ready' : 'Info'}
              tone={proposal.accepted ? 'success' : proposal.actionable ? 'brand' : 'neutral'}
            />
            {proposal.pr_url && (
              <Tooltip title="Open PR" arrow>
                <IconButton
                  size="small"
                  component="a"
                  href={proposal.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open PR"
                  sx={{ width: 28, height: 28, color: colors.brand }}
                >
                  <ExternalLink size={14} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function DecisionBrief({
  score,
  grade,
  critical,
  high,
  secrets,
  planHours,
  readyFixes,
  verifyRuns,
  latestVerdict,
  scannedAt,
}: {
  score: number | null
  grade: string | null
  critical: number
  high: number
  secrets: number
  planHours: number | null
  readyFixes: number
  verifyRuns: number
  latestVerdict?: string
  scannedAt?: string | null
}) {
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr 1fr' }, gap: 1 }}>
        <InfoItem
          label="Posture decision"
          value={`${score != null ? formatNumber(Math.round(score)) : '--'}${grade ? ` / Grade ${grade}` : ''}`}
        />
        <InfoItem label="Board-visible exposure" value={`C/H ${formatNumber(critical)} / ${formatNumber(high)}`} />
        <InfoItem label="Credential exposure" value={formatNumber(secrets)} />
        <InfoItem label="Remediation commitment" value={formatHours(planHours)} />
        <InfoItem label="Ready engineering fixes" value={formatNumber(readyFixes)} />
        <InfoItem label="Assurance evidence" value={`${formatNumber(verifyRuns)} run${verifyRuns === 1 ? '' : 's'}`} />
      </Box>
      <Box
        sx={{
          p: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
          display: 'grid',
          gap: 0.5,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 850 }}>
          Management readout
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Last scan: {formatRelative(scannedAt)}. Latest verification: {latestVerdict || 'not run'}.
          Remediation estimate and assurance status are shown from the latest backend records.
        </Typography>
      </Box>
    </Box>
  )
}

export function RepoDetailManagerView({
  repoId,
  repo,
  orgId,
}: {
  repoId: string
  repo: ConnectedRepo | null
  orgId: string | undefined
}) {
  const theme = useTheme()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [tab, setTab] = useState<DetailTab>('decision')
  const [uploadOpen, setUploadOpen] = useState(false)

  const profileQ = useQuery({
    queryKey: qk.repos.profile(repoId),
    queryFn: () => getRepoProfile(repoId),
    staleTime: 5 * 60_000,
    retry: false,
  })

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const fixPlanQ = useQuery({
    queryKey: qk.repos.fixPlan(repoId),
    queryFn: () => getFixPlan(repoId),
    staleTime: 60_000,
    retry: false,
  })

  const proposalsQ = useQuery({
    queryKey: qk.autofix.aiProposals(repoId),
    queryFn: () => listAIProposals(repoId),
    staleTime: 60_000,
    retry: false,
  })

  const execQ = useQuery({
    queryKey: qk.security.repoVerifyExecutions(repoId),
    queryFn: () => listRepoWorkflowExecutions(repoId, 25),
    staleTime: 60_000,
    retry: false,
  })

  const profile = profileQ.data
  const overall = profile?.health_dimensions?.overall
  const unifiedRepoScore = scoreQ.data?.repo_scores?.find((r) => r.repo_id === repoId)
  const displayScore = unifiedRepoScore?.display ?? overall?.score ?? null
  const grade = unifiedRepoScore?.grade ?? overall?.grade ?? null
  const repoName = repo?.repoName || repo?.fullName || profile?.summary || repoId
  const fullName = repo?.fullName || repoName
  const scannedAt = profile?.scannedAt ?? repo?.lastScannedAt ?? null
  const plan = fixPlanQ.data?.plan ?? null
  const proposals = proposalsQ.data?.entries ?? EMPTY_PROPOSALS
  const executions = execQ.data?.executions ?? EMPTY_EXECUTIONS
  const latestExecution = executions[0]
  const actionableProposals = proposals.filter((p) => p.actionable && !p.accepted).length
  const acceptedProposals = proposals.filter((p) => p.accepted).length
  const critical = profile?.cve_critical ?? 0
  const high = profile?.cve_high ?? 0
  const secrets = profile?.secret_count ?? 0
  const openRisk = critical + high + secrets
  const latestVerdict = latestExecution?.verdict ?? latestExecution?.status
  const loading = profileQ.isLoading || scoreQ.isLoading

  const dimensions = useMemo<DimensionRow[]>(() => {
    const hd = profile?.health_dimensions
    if (!hd) return []
    return [
      { key: 'security', label: 'Security', dimension: hd.security },
      { key: 'complexity', label: 'Complexity', dimension: hd.complexity },
      { key: 'dead_code', label: 'Dead code', dimension: hd.dead_code },
      { key: 'coverage', label: 'Coverage', dimension: hd.coverage },
    ].filter((row): row is DimensionRow => !!row.dimension)
  }, [profile])

  const verdictCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const execution of executions) {
      const key = execution.verdict ?? execution.status
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [executions])

  function refreshData() {
    qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) })
    qc.invalidateQueries({ queryKey: qk.repos.scans(repoId) })
    qc.invalidateQueries({ queryKey: qk.repos.healthSummary(orgId) })
    qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
    qc.invalidateQueries({ queryKey: qk.repos.fixPlan(repoId) })
    qc.invalidateQueries({ queryKey: qk.autofix.aiProposals(repoId) })
    qc.invalidateQueries({ queryKey: qk.security.repoVerifyExecutions(repoId) })
  }

  const scanMut = useMutation({
    mutationFn: () => triggerScan(repoId),
    onSuccess: () => {
      enqueueSnackbar(tOr('repoList.scanQueued', 'Repository scan queued'), { variant: 'success' })
      refreshData()
    },
    onError: () => enqueueSnackbar(t('repoList.scanFailed'), { variant: 'error' }),
  })

  return (
    <>
      <Box
        sx={{
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          p: { xs: 1.25, md: 1.75 },
          maxWidth: 1540,
          mx: 'auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.25,
            flexWrap: 'wrap',
            px: { xs: 1.25, md: 1.6 },
            py: 1.2,
            borderRadius: 1,
            border: '1px solid',
            borderColor: alpha(colors.brand, 0.28),
            borderLeft: `3px solid ${colors.brand}`,
            bgcolor: alpha(theme.palette.background.paper, 0.94),
            backgroundImage: `linear-gradient(90deg, ${alpha(colors.brand, 0.08)}, transparent 56%)`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, minWidth: 0 }}>
            <Tooltip title={tOr('common.back', 'Back')} arrow>
              <IconButton
                size="small"
                onClick={() => orgId && navigate(`/projects/${orgId}/repos?mode=manager`)}
                aria-label={tOr('common.back', 'Back')}
                sx={{ width: 36, height: 36, borderRadius: 1, border: '1px solid', borderColor: 'divider', color: colors.brand }}
              >
                <ArrowLeft size={16} />
              </IconButton>
            </Tooltip>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 1,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                color: colors.brand,
                bgcolor: alpha(colors.brand, 0.12),
                boxShadow: `inset 0 0 0 1px ${alpha(colors.brand, 0.22)}`,
              }}
            >
              <ShieldCheck size={18} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <Typography component="h1" variant="h5" sx={{ fontWeight: 950, lineHeight: 1.1 }} noWrap>
                  {repoName}
                </Typography>
                <GradeBadge grade={grade} score={displayScore} />
              </Box>
              <Typography variant="body2" color="text.secondary" noWrap>
                {fullName}
                {scannedAt ? ` - manager risk brief updated ${formatRelative(scannedAt)}` : ''}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, flexWrap: 'wrap' }}>
            {repo?.htmlUrl && (
              <Tooltip title={t('repoList.openInProvider')} arrow>
                <IconButton
                  size="small"
                  component="a"
                  href={repo.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('repoList.openInProvider')}
                  sx={{ width: 38, height: 38, borderRadius: 1, border: '1px solid', borderColor: 'divider', color: 'text.secondary' }}
                >
                  <ExternalLink size={16} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={tOr('repos.manager.refresh', 'Refresh')} arrow>
              <IconButton
                size="small"
                onClick={refreshData}
                aria-label={tOr('repos.manager.refresh', 'Refresh')}
                sx={{ width: 38, height: 38, borderRadius: 1, border: '1px solid', borderColor: 'divider', color: 'text.secondary' }}
              >
                <RefreshCw size={16} />
              </IconButton>
            </Tooltip>
            {repo?.scanMode === 'local' ? (
              <Tooltip title="Upload local scan" arrow>
                <Box component="span">
                  <GatedButton
                    action="scan:trigger"
                    size="small"
                    variant="outlined"
                    onClick={() => setUploadOpen(true)}
                    aria-label="Upload local scan"
                    sx={{ width: 38, minWidth: 38, height: 38, p: 0, borderRadius: 1, color: colors.brand, borderColor: alpha(colors.brand, 0.42) }}
                  >
                    <Upload size={16} />
                  </GatedButton>
                </Box>
              </Tooltip>
            ) : (
              <Tooltip title={scanMut.isPending ? 'Queueing scan' : tOr('repoList.scanNow', 'Scan now')} arrow>
                <Box component="span">
                  <GatedButton
                    action="scan:trigger"
                    size="small"
                    variant="outlined"
                    disabled={scanMut.isPending}
                    onClick={() => scanMut.mutate()}
                    aria-label={scanMut.isPending ? 'Queueing scan' : tOr('repoList.scanNow', 'Scan now')}
                    sx={{ width: 38, minWidth: 38, height: 38, p: 0, borderRadius: 1, color: colors.brand, borderColor: alpha(colors.brand, 0.42) }}
                  >
                    {scanMut.isPending ? <CircularProgress size={15} /> : <Play size={16} />}
                  </GatedButton>
                </Box>
              </Tooltip>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            flex: '0 0 auto',
            display: 'grid',
            gap: 1,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}
        >
          <MetricTile
            icon={<ShieldCheck size={17} />}
            label="Portfolio posture"
            value={displayScore != null ? formatNumber(Math.round(displayScore)) : '--'}
            sub={grade ? `Grade ${grade}` : tOr('repos.manager.pendingScore', 'Pending scan')}
            tone="brand"
            loading={scoreQ.isLoading}
          />
          <MetricTile
            icon={<ShieldAlert size={17} />}
            label="Board exposure"
            value={`${formatNumber(critical)} / ${formatNumber(high)}`}
            sub={openRisk > 0 ? `Critical/high/secrets ${formatNumber(openRisk)}` : 'No active exposure'}
            tone={openRisk > 0 ? 'danger' : 'success'}
            loading={profileQ.isLoading}
          />
          <MetricTile
            icon={<KeyRound size={17} />}
            label="Credential exposure"
            value={formatNumber(secrets)}
            sub={secrets > 0 ? 'Needs rotation review' : 'No exposed secrets'}
            tone={secrets > 0 ? 'danger' : 'success'}
            loading={profileQ.isLoading}
          />
          <MetricTile
            icon={<Wrench size={17} />}
            label="Committed effort"
            value={formatHours(plan?.total_effort_hours)}
            sub={plan ? `${plan.buckets.length} cycle${plan.buckets.length === 1 ? '' : 's'}` : 'No plan yet'}
            tone={plan ? 'brand' : 'neutral'}
            loading={fixPlanQ.isLoading}
          />
          <MetricTile
            icon={<GitPullRequest size={17} />}
            label="Ready fixes"
            value={formatNumber(actionableProposals)}
            sub={acceptedProposals > 0 ? `${acceptedProposals} accepted` : 'No accepted fixes'}
            tone={actionableProposals > 0 ? 'brand' : 'neutral'}
            loading={proposalsQ.isLoading}
          />
          <MetricTile
            icon={<Activity size={17} />}
            label="Assurance runs"
            value={formatNumber(execQ.data?.count ?? executions.length)}
            sub={latestVerdict ? `Latest ${latestVerdict}` : 'No verification'}
            tone={verdictTone(latestVerdict)}
            loading={execQ.isLoading}
          />
        </Box>

        <Paper
          elevation={0}
          sx={{
            flex: '0 0 auto',
            minHeight: 48,
            px: 1,
            py: 0.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.paper, 0.92),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <TabButton active={tab === 'decision'} label="Decision" icon={<Layers size={14} />} onClick={() => setTab('decision')} />
            <TabButton active={tab === 'execution'} label="Execution" icon={<Wrench size={14} />} onClick={() => setTab('execution')} />
            <TabButton active={tab === 'assurance'} label="Assurance" icon={<CheckCircle2 size={14} />} onClick={() => setTab('assurance')} />
          </Box>
          <Box />
        </Paper>

        <Paper
          elevation={0}
          sx={{
            flex: '1 1 0',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          {loading ? (
            <Box sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : profileQ.isError || scoreQ.isError ? (
            <Box sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
              <Box>
                <AlertTriangle size={30} color={colors.semantic.danger} />
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 1, fontWeight: 900 }}>
                  Could not load repository posture
                </Typography>
                <GatedButton action="repo:read" size="small" variant="outlined" onClick={refreshData} startIcon={<RefreshCw size={14} />}>
                  {tOr('repos.manager.refresh', 'Refresh')}
                </GatedButton>
              </Box>
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.25 }}>
              {tab === 'decision' && (
                <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.25fr) minmax(320px, 0.75fr)' } }}>
                  <Box sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>
                    <Panel title="Manager brief" icon={<ShieldCheck size={15} />}>
                      <DecisionBrief
                        score={displayScore}
                        grade={grade}
                        critical={critical}
                        high={high}
                        secrets={secrets}
                        planHours={plan?.total_effort_hours ?? null}
                        readyFixes={actionableProposals}
                        verifyRuns={execQ.data?.count ?? executions.length}
                        latestVerdict={latestVerdict}
                        scannedAt={scannedAt}
                      />
                    </Panel>
                    <Panel title="Score evidence" icon={<FileWarning size={15} />}>
                      <DimensionList rows={dimensions} />
                    </Panel>
                  </Box>
                  <Box sx={{ display: 'grid', gap: 1.25, minWidth: 0, alignContent: 'start' }}>
                    <Panel title="Exposure ledger" icon={<ShieldAlert size={15} />}>
                      <FindingSummary profile={profile} />
                    </Panel>
                    <Panel title="Repository context" icon={<Layers size={15} />}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
                        <InfoItem label="Project type" value={profile?.project_type || '--'} />
                        <InfoItem label="Language" value={repo?.language || '--'} />
                        <InfoItem label="Dependencies" value={formatNumber(profile?.dependency_count)} />
                        <InfoItem label="Files" value={formatNumber(profile?.file_count)} />
                        <InfoItem label="Frameworks" value={profile?.frameworks?.slice(0, 2).map((fw) => fw.name).join(', ') || '--'} />
                        <InfoItem label="License" value={profile?.project_license || '--'} />
                      </Box>
                    </Panel>
                    <Panel title="Latest assurance" icon={<Activity size={15} />}>
                      {latestExecution ? (
                        <Box sx={{ display: 'grid', gap: 0.75 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
                              {latestExecution.findingFp || latestExecution.executionId}
                            </Typography>
                            <StatusPill label={latestVerdict || 'unknown'} tone={verdictTone(latestVerdict)} />
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(latestExecution.createdAt)}
                          </Typography>
                          {latestExecution.errorMessage && (
                            <Typography variant="caption" sx={{ color: colors.semantic.danger }}>
                              {latestExecution.errorMessage}
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        <EmptyLine text="No closed-loop verification runs yet." />
                      )}
                    </Panel>
                  </Box>
                </Box>
              )}

              {tab === 'execution' && (
                <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) minmax(320px, 0.8fr)' } }}>
                  <Panel
                    title="Commitment roadmap"
                    icon={<Wrench size={15} />}
                    action={plan ? <StatusPill label={`${plan.buckets.length} cycles`} tone="brand" /> : undefined}
                  >
                    <BucketList buckets={plan?.buckets ?? EMPTY_BUCKETS} />
                  </Panel>
                  <Box sx={{ display: 'grid', gap: 1.25, alignContent: 'start', minWidth: 0 }}>
                    <Panel title="Ready fix queue" icon={<GitPullRequest size={15} />}>
                      <ProposalList proposals={proposals} />
                    </Panel>
                    <Panel title="Dependency sequence" icon={<AlertTriangle size={15} />}>
                      {plan?.critical_path.length ? (
                        <Box sx={{ display: 'grid', gap: 0.65 }}>
                          {plan.critical_path.map((step, index) => (
                            <Box key={`${step}-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <StatusPill label={`${index + 1}`} tone="brand" />
                              <Typography variant="body2" sx={{ fontWeight: 750 }} noWrap>{step}</Typography>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <EmptyLine text="No critical path returned." />
                      )}
                    </Panel>
                  </Box>
                </Box>
              )}

              {tab === 'assurance' && (
                <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.8fr) minmax(380px, 1.2fr)' } }}>
                  <Panel title="Assurance mix" icon={<CheckCircle2 size={15} />}>
                    {verdictCounts.length > 0 ? (
                      <Box sx={{ display: 'grid', gap: 0.75 }}>
                        {verdictCounts.map(([label, count]) => (
                          <Box key={label} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
                            <StatusPill label={label} tone={verdictTone(label)} />
                            <Typography variant="body2" sx={{ fontWeight: 900 }}>{count}</Typography>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <EmptyLine text="No verification outcomes returned." />
                    )}
                  </Panel>
                  <Panel title="Assurance ledger" icon={<Activity size={15} />}>
                    {executions.length > 0 ? (
                      <Box sx={{ display: 'grid', gap: 0.75 }}>
                        {executions.map((execution) => {
                          const status = execution.verdict ?? execution.status
                          return (
                            <Box
                              key={execution.id}
                              sx={{
                                p: 1,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'background.default',
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                gap: 1,
                                alignItems: 'center',
                              }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 850 }} noWrap>
                                  {execution.findingFp || execution.executionId}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }} noWrap>
                                  {formatDateTime(execution.createdAt)}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <StatusPill label={status} tone={verdictTone(status)} />
                                {execution.liveViewUrl && (
                                  <Tooltip title="Open live view" arrow>
                                    <IconButton
                                      size="small"
                                      component="a"
                                      href={execution.liveViewUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label="Open live view"
                                      sx={{ width: 28, height: 28, color: colors.brand }}
                                    >
                                      <ExternalLink size={14} />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            </Box>
                          )
                        })}
                      </Box>
                    ) : (
                      <EmptyLine text="No workflow executions returned." />
                    )}
                  </Panel>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      </Box>

      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Upload local scan</Typography>
          <IconButton size="small" onClick={() => setUploadOpen(false)} aria-label={tOr('common.close', 'Close')}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <ScanUploadDropzone
            repoId={repoId}
            compact
            onSuccess={() => {
              setUploadOpen(false)
              refreshData()
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: 52,
        p: 1,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
        minWidth: 0,
      }}
    >
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 750 }} noWrap>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
        {value}
      </Typography>
    </Box>
  )
}
