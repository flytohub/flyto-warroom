/**
 * Manager-mode repository posture.
 *
 * This page is deliberately a dense workbench, not a chart waterfall:
 * managers need the repo queue, backend grades, open critical/high counts,
 * scan freshness, and a small set of real actions in the first viewport.
 */

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ExternalLink,
  Filter,
  GitBranch,
  Globe,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react'
import { useSnackbar } from 'notistack'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n'
import { colors } from '@/styles/designTokens'
import { useConnectedRepos } from '@hooks/useOrg'
import { GatedButton } from '@atoms/GatedButton'
import { RepoPickerModal } from '@compounds/_shared/picker'
import { getComputedScore } from '@lib/engine/scoring/scoring'
import {
  cancelOrgScans,
  getOrgHealthSummary,
  triggerScan,
  type ConnectedRepo,
  type RepoHealthSummary,
} from '@lib/engine/code/repos'
import { REPO_LIST_GRADE_COLORS } from './colors'

type RepoFilter = 'all' | 'atRisk' | 'critical' | 'autofix' | 'unscanned'

interface RepoManagerRow {
  id: string
  name: string
  fullName: string
  language: string
  isPrivate: boolean
  htmlUrl: string
  scanMode: ConnectedRepo['scanMode'] | undefined
  health: RepoHealthSummary | undefined
  topRiskRank: number
}

const TABLE_COLUMNS = 'minmax(180px, 1.8fr) 58px 88px 78px 84px 68px'
const EMPTY_REPOS: ConnectedRepo[] = []
const EMPTY_HEALTH_ROWS: RepoHealthSummary[] = []

function formatAge(value?: string): string {
  if (!value) return '--'
  const ts = new Date(value).getTime()
  if (!Number.isFinite(ts)) return '--'
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}

function repoDisplayName(repo: ConnectedRepo | undefined, repoId: string): string {
  return repo?.repoName || repo?.fullName || repoId
}

function repoFullName(repo: ConnectedRepo | undefined, repoId: string): string {
  return repo?.fullName || repo?.ownerName || repoId
}

function findingCount(health?: RepoHealthSummary): number {
  return health?.security_findings ?? health?.cve_total ?? 0
}

function isCritical(health?: RepoHealthSummary): boolean {
  return (health?.cve_critical ?? 0) > 0
}

function hasAutofix(health?: RepoHealthSummary): boolean {
  return (health?.autofix_eligible ?? 0) > 0
}

function isAtRisk(health: RepoHealthSummary | undefined, topRiskRank: number): boolean {
  if (topRiskRank < 9999) return true
  if (!health) return false
  return (
    (health.cve_critical ?? 0) > 0 ||
    (health.cve_high ?? 0) > 0 ||
    (health.security_findings ?? 0) > 0 ||
    health.grade === 'D' ||
    health.grade === 'F'
  )
}

function GradeBadge({ grade, score }: { grade?: string; score?: number }) {
  const tone = grade ? REPO_LIST_GRADE_COLORS[grade] : undefined
  return (
    <Chip
      size="small"
      label={grade || '--'}
      title={score != null ? `${score}` : undefined}
      sx={{
        height: 24,
        minWidth: 36,
        borderRadius: 1,
        fontSize: 12,
        fontWeight: 850,
        bgcolor: tone?.bg ?? 'action.hover',
        color: tone?.color ?? 'text.secondary',
      }}
    />
  )
}

function SeverityPill({ critical, high }: { critical: number; high: number }) {
  const dangerous = critical > 0
  const warning = !dangerous && high > 0
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
      <Typography
        variant="body2"
        sx={{
          fontSize: 12,
          fontWeight: 800,
          color: dangerous ? colors.semantic.danger : warning ? '#b45309' : 'text.secondary',
        }}
      >
        {critical}/{high}
      </Typography>
    </Box>
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
  tone: string
  loading?: boolean
}) {
  const theme = useTheme()
  return (
    <Paper
      elevation={0}
      sx={{
        minHeight: 68,
        p: 1.25,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, 0.09),
        bgcolor: alpha(theme.palette.background.paper, 0.86),
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
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
          color: tone,
          bgcolor: alpha(tone, 0.12),
          boxShadow: `inset 0 0 0 1px ${alpha(tone, 0.2)}`,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 700 }}>
          {label}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 850, lineHeight: 1.15, color: 'text.primary' }} noWrap>
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

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <Chip
      clickable
      size="small"
      label={
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <span>{label}</span>
          <Box
            component="span"
            sx={{
              minWidth: 20,
              height: 20,
              px: 0.6,
              borderRadius: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: active ? alpha('#fff', 0.22) : 'action.selected',
              fontWeight: 850,
            }}
          >
            {count}
          </Box>
        </Box>
      }
      onClick={onClick}
      sx={{
        height: 34,
        borderRadius: 1,
        fontWeight: 800,
        border: '1px solid',
        borderColor: active ? colors.brand : 'divider',
        bgcolor: active ? colors.brand : 'background.paper',
        color: active ? '#fff' : 'text.primary',
        '&:hover': {
          bgcolor: active ? colors.brand : alpha(colors.brand, 0.08),
          borderColor: alpha(colors.brand, 0.65),
        },
      }}
    />
  )
}

function RepoRow({
  row,
  onOpen,
}: {
  row: RepoManagerRow
  onOpen: (repoId: string) => void
}) {
  const h = row.health
  const critical = h?.cve_critical ?? 0
  const high = h?.cve_high ?? 0
  const findings = findingCount(h)
  const muted = !h?.scanned_at
  const riskColor = critical > 0 ? colors.semantic.danger : high > 0 ? '#d97706' : colors.semantic.success

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(row.id)
        }
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) 54px 40px', md: TABLE_COLUMNS },
        alignItems: 'center',
        gap: 1,
        px: { xs: 1.25, sm: 1.75 },
        py: 1,
        minHeight: 58,
        borderBottom: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        bgcolor: muted ? 'transparent' : 'background.paper',
        transition: 'background-color 120ms ease, box-shadow 120ms ease',
        '&:hover': {
          bgcolor: alpha(colors.brand, 0.055),
          boxShadow: `inset 3px 0 0 ${alpha(riskColor, 0.9)}`,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, minWidth: 0 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 1,
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
            color: colors.brand,
            bgcolor: alpha(colors.brand, 0.1),
          }}
        >
          <GitBranch size={15} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 850, color: 'text.primary' }} noWrap>
              {row.name}
            </Typography>
            {row.isPrivate ? <Lock size={11} opacity={0.5} /> : <Globe size={11} opacity={0.5} />}
          </Box>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }} noWrap>
            {row.fullName}
            {row.language ? ` · ${row.language}` : ''}
            {h ? ` · C/H ${critical}/${high} · ${findings} findings` : ''}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-end', sm: 'center' } }}>
        <GradeBadge grade={h?.grade} score={h?.display_score} />
      </Box>

      <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center' }}>
        <SeverityPill critical={critical} high={high} />
      </Box>

      <Typography
        variant="body2"
        sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'center', fontWeight: 750, color: findings > 0 ? 'text.primary' : 'text.secondary' }}
      >
        {findings}
      </Typography>

      <Typography
        variant="body2"
        sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'center', fontSize: 12, color: h?.scanned_at ? 'text.secondary' : 'warning.main', fontWeight: 700 }}
      >
        {formatAge(h?.scanned_at)}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5 }}>
        {row.htmlUrl && (
          <Tooltip title={t('repoList.openInProvider')} arrow>
            <IconButton
              size="small"
              component="a"
              href={row.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={t('repoList.openInProvider')}
              sx={{ display: { xs: 'none', md: 'inline-flex' }, color: 'text.secondary' }}
            >
              <ExternalLink size={14} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={tOr('repos.manager.openRepo', 'Open repository')} arrow>
          <IconButton size="small" aria-label={`${tOr('repos.manager.openRepo', 'Open repository')} ${row.name}`} sx={{ color: colors.brand }}>
            <ArrowRight size={15} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  )
}

export function RepoListManagerView({ orgId }: { orgId: string | undefined }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [filter, setFilter] = useState<RepoFilter>('all')
  const [search, setSearch] = useState('')

  const reposQ = useConnectedRepos(orgId)
  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const healthQ = useQuery({
    queryKey: qk.repos.healthSummary(orgId),
    queryFn: () => getOrgHealthSummary(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const repos = reposQ.data ?? EMPTY_REPOS
  const healthRows = healthQ.data?.repos ?? EMPTY_HEALTH_ROWS
  const healthByRepo = useMemo(() => new Map(healthRows.map((h) => [h.repo_id, h])), [healthRows])
  const repoById = useMemo(() => new Map(repos.map((repo) => [repo.id, repo])), [repos])
  const topRiskRank = useMemo(() => {
    const m = new Map<string, number>()
    healthQ.data?.aggregated?.top_risks?.forEach((risk, index) => m.set(risk.repo_id, index))
    return m
  }, [healthQ.data?.aggregated?.top_risks])

  const rows = useMemo<RepoManagerRow[]>(() => {
    const repoRows = repos.map((repo) => ({
      id: repo.id,
      name: repoDisplayName(repo, repo.id),
      fullName: repoFullName(repo, repo.id),
      language: repo.language ?? '',
      isPrivate: repo.isPrivate,
      htmlUrl: repo.htmlUrl,
      scanMode: repo.scanMode,
      health: healthByRepo.get(repo.id),
      topRiskRank: topRiskRank.get(repo.id) ?? 9999,
    }))

    const connected = new Set(repoRows.map((row) => row.id))
    for (const health of healthRows) {
      if (connected.has(health.repo_id)) continue
      const repo = repoById.get(health.repo_id)
      repoRows.push({
        id: health.repo_id,
        name: repoDisplayName(repo, health.repo_id),
        fullName: repoFullName(repo, health.repo_id),
        language: repo?.language ?? '',
        isPrivate: repo?.isPrivate ?? false,
        htmlUrl: repo?.htmlUrl ?? '',
        scanMode: repo?.scanMode,
        health,
        topRiskRank: topRiskRank.get(health.repo_id) ?? 9999,
      })
    }

    return repoRows.sort((a, b) => {
      if (a.topRiskRank !== b.topRiskRank) return a.topRiskRank - b.topRiskRank
      return a.name.localeCompare(b.name)
    })
  }, [healthByRepo, healthRows, repoById, repos, topRiskRank])

  const counts = useMemo(() => {
    return {
      all: rows.length,
      atRisk: rows.filter((row) => isAtRisk(row.health, row.topRiskRank)).length,
      critical: rows.filter((row) => isCritical(row.health)).length,
      autofix: rows.filter((row) => hasAutofix(row.health)).length,
      unscanned: rows.filter((row) => !row.health?.scanned_at).length,
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const h = row.health
      if (filter === 'atRisk' && !isAtRisk(h, row.topRiskRank)) return false
      if (filter === 'critical' && !isCritical(h)) return false
      if (filter === 'autofix' && !hasAutofix(h)) return false
      if (filter === 'unscanned' && h?.scanned_at) return false
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.fullName.toLowerCase().includes(q) ||
        (row.language ?? '').toLowerCase().includes(q)
      )
    })
  }, [filter, rows, search])

  const agg = healthQ.data?.aggregated
  const score = scoreQ.data
  const scoreAvailable = !!score && score.score_available !== false && score.overall_display != null
  const activeScans = healthQ.data?.active_scan_count ?? 0
  const loading = reposQ.isLoading || healthQ.isLoading || scoreQ.isLoading
  const hasError = reposQ.isError || healthQ.isError || scoreQ.isError

  function refreshData() {
    if (!orgId) return
    qc.invalidateQueries({ queryKey: qk.repos.connected(orgId) })
    qc.invalidateQueries({ queryKey: qk.repos.healthSummary(orgId) })
    qc.invalidateQueries({ queryKey: qk.computedScore(orgId) })
    qc.invalidateQueries({ queryKey: qk.repos.scansAll() })
  }

  const scanAllMut = useMutation({
    mutationFn: async () => {
      let queued = 0
      for (const repo of repos) {
        if (repo.scanMode === 'local') continue
        await triggerScan(repo.id)
        queued++
      }
      return queued
    },
    onSuccess: (queued) => {
      enqueueSnackbar(tOr('repoList.scanAllQueued', `Queued ${queued} repository scan(s)`, { n: queued }), { variant: 'success' })
      refreshData()
    },
    onError: () => enqueueSnackbar(t('repoList.scanFailed'), { variant: 'error' }),
  })

  const cancelAllMut = useMutation({
    mutationFn: () => cancelOrgScans(orgId!),
    onSuccess: (data) => {
      enqueueSnackbar(
        tOr('repoList.cancelledN', `Cancelled ${data.cancelled} scan(s)`).replace('{n}', String(data.cancelled)),
        { variant: 'success' },
      )
      refreshData()
    },
    onError: () => enqueueSnackbar(t('repoList.cancelAllFailed'), { variant: 'error' }),
  })

  function openRepo(repoId: string) {
    if (!orgId) return
    navigate(`/projects/${orgId}/repos/${repoId}?mode=manager`)
  }

  const filters: Array<{ key: RepoFilter; label: string; count: number }> = [
    { key: 'all', label: tOr('repos.manager.filterAll', 'All'), count: counts.all },
    { key: 'atRisk', label: tOr('repos.manager.filterAtRisk', 'At risk'), count: counts.atRisk },
    { key: 'critical', label: tOr('repos.manager.filterCritical', 'Critical'), count: counts.critical },
    { key: 'autofix', label: tOr('repos.manager.filterAutofix', 'Autofix'), count: counts.autofix },
    { key: 'unscanned', label: tOr('repos.manager.filterUnscanned', 'Unscanned'), count: counts.unscanned },
  ]

  return (
    <>
      <Box
        sx={{
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: { xs: 1.5, md: 2 },
          maxWidth: 1520,
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
            gap: 1.5,
            flexWrap: 'wrap',
            px: { xs: 1.5, md: 2 },
            py: 1.35,
            borderRadius: 1,
            border: '1px solid',
            borderColor: alpha(colors.brand, 0.26),
            borderLeft: `3px solid ${colors.brand}`,
            bgcolor: alpha(theme.palette.background.paper, 0.88),
            backgroundImage: `linear-gradient(90deg, ${alpha(colors.brand, 0.08)}, transparent 54%)`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
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
                boxShadow: `inset 0 0 0 1px ${alpha(colors.brand, 0.24)}`,
              }}
            >
              <Boxes size={18} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 900, lineHeight: 1.1 }} noWrap>
                {t('repos.manager.titleCodeSecurity')}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {healthQ.data
                  ? `${healthQ.data.total_count} repositories · ${healthQ.data.scanned_count} scanned · ${agg?.at_risk_count ?? 0} at risk`
                  : t('repos.manager.subtitleFleetMetrics')}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Tooltip title={tOr('repos.manager.refresh', 'Refresh')} arrow>
              <IconButton
                size="small"
                onClick={refreshData}
                aria-label={tOr('repos.manager.refresh', 'Refresh')}
                sx={{ width: 38, height: 38, border: '1px solid', borderColor: 'divider', borderRadius: 1, color: 'text.secondary' }}
              >
                <RefreshCw size={16} />
              </IconButton>
            </Tooltip>
            {activeScans > 0 ? (
              <GatedButton
                action="scan:cancel"
                size="small"
                variant="outlined"
                disabled={cancelAllMut.isPending}
                onClick={() => cancelAllMut.mutate()}
                startIcon={<X size={15} />}
                sx={{ height: 38, borderRadius: 1, textTransform: 'none', fontWeight: 800, color: colors.semantic.danger, borderColor: alpha(colors.semantic.danger, 0.45) }}
              >
                {t('repoList.cancelAllScans')}
              </GatedButton>
            ) : (
              <GatedButton
                action="scan:trigger"
                size="small"
                variant="contained"
                disabled={scanAllMut.isPending || repos.length === 0}
                onClick={() => scanAllMut.mutate()}
                startIcon={<Zap size={15} />}
                sx={{ height: 38, borderRadius: 1, textTransform: 'none', fontWeight: 850, bgcolor: colors.brand, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}
              >
                {t('repoList.scanAll')}
              </GatedButton>
            )}
            <GatedButton
              action="repo:connect"
              size="small"
              variant="outlined"
              onClick={() => setPickerOpen(true)}
              startIcon={<Plus size={15} />}
              sx={{ height: 38, borderRadius: 1, textTransform: 'none', fontWeight: 850, borderColor: alpha(colors.brand, 0.55), color: colors.brand }}
            >
              {t('repoList.connectRepos')}
            </GatedButton>
          </Box>
        </Box>

        <Box
          sx={{
            flex: '0 0 auto',
            display: 'grid',
            gap: 1,
            gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))',
          }}
        >
          <MetricTile
            icon={<ShieldCheck size={17} />}
            label={t('repos.manager.kpiOrgPosture')}
            value={scoreAvailable ? `${Math.round(score!.overall_display!)}` : '--'}
            sub={scoreAvailable ? `Grade ${score!.overall_grade ?? '--'}` : tOr('repos.manager.pendingScore', 'Pending scan')}
            tone={colors.brand}
            loading={scoreQ.isLoading}
          />
          <MetricTile
            icon={<ShieldAlert size={17} />}
            label={t('repos.manager.kpiAtRiskRepos')}
            value={agg ? agg.at_risk_count : '--'}
            sub={agg ? `${agg.critical_count} critical · ${agg.high_count} high` : undefined}
            tone={colors.semantic.danger}
            loading={healthQ.isLoading}
          />
          <MetricTile
            icon={<CheckCircle2 size={17} />}
            label={t('repos.manager.kpiSecureRepos')}
            value={agg ? agg.secure_count : '--'}
            sub={healthQ.data ? `${healthQ.data.scanned_count} scanned` : undefined}
            tone={colors.semantic.success}
            loading={healthQ.isLoading}
          />
          <MetricTile
            icon={<AlertTriangle size={17} />}
            label={t('repos.manager.kpiAutofixEligible')}
            value={rows.reduce((sum, row) => sum + (row.health?.autofix_eligible ?? 0), 0)}
            sub={activeScans > 0 ? `${activeScans} active scan(s)` : tOr('repos.manager.scanQueueIdle', 'Scan queue idle')}
            tone="#a855f7"
            loading={healthQ.isLoading}
          />
        </Box>

        <Paper
          elevation={0}
          sx={{
            flex: '0 0 auto',
            minHeight: 52,
            px: 1,
            py: 0.9,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.paper, 0.9),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mr: 0.25, color: colors.brand }}>
            <Filter size={18} />
            <Typography variant="body2" sx={{ fontWeight: 850 }}>
              {filteredRows.length} {tOr('repos.manager.repositories', 'Repositories')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', flex: '1 1 auto', minWidth: 220 }}>
            {filters.map((item) => (
              <FilterChip
                key={item.key}
                active={filter === item.key}
                label={item.label}
                count={item.count}
                onClick={() => setFilter(item.key)}
              />
            ))}
          </Box>
          <Box
            sx={{
              height: 38,
              flex: '0 1 260px',
              minWidth: { xs: '100%', sm: 220 },
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              borderRadius: 1,
              border: '1px solid',
              borderColor: alpha(theme.palette.text.primary, 0.16),
              bgcolor: alpha(theme.palette.background.default, 0.58),
              '&:focus-within': { borderColor: alpha(colors.brand, 0.8), boxShadow: `0 0 0 3px ${alpha(colors.brand, 0.1)}` },
            }}
          >
            <Search size={17} opacity={0.65} />
            <InputBase
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('repoList.searchPlaceholder')}
              inputProps={{ 'aria-label': t('repoList.searchPlaceholder') }}
              sx={{ flex: 1, fontSize: 14, minWidth: 0 }}
            />
            {search && (
              <IconButton size="small" onClick={() => setSearch('')} aria-label={tOr('common.clear', 'Clear')} sx={{ width: 24, height: 24 }}>
                <X size={13} />
              </IconButton>
            )}
          </Box>
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
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr) 54px 40px', md: TABLE_COLUMNS },
              gap: 1,
              alignItems: 'center',
              px: { xs: 1.25, sm: 1.75 },
              py: 1,
              minHeight: 42,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.98) : '#f5f3ff',
              color: 'text.secondary',
              flex: '0 0 auto',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 900 }}>{t('repoList.name')}</Typography>
            <Typography variant="caption" sx={{ textAlign: 'center', fontWeight: 900 }}>{t('repoList.health')}</Typography>
            <Typography variant="caption" sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'center', fontWeight: 900 }}>C/H</Typography>
            <Typography variant="caption" sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'center', fontWeight: 900 }}>{tOr('repos.manager.findings', 'Findings')}</Typography>
            <Typography variant="caption" sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'center', fontWeight: 900 }}>{t('repoList.lastScan')}</Typography>
            <Typography variant="caption" sx={{ textAlign: 'right', fontWeight: 900 }}>{t('repoList.actions')}</Typography>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {loading ? (
              <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={26} />
              </Box>
            ) : hasError ? (
              <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 850, mb: 0.5 }}>
                    {tOr('repos.manager.loadFailed', 'Could not load repository posture')}
                  </Typography>
                  <GatedButton action="repo:read" variant="outlined" size="small" onClick={refreshData} startIcon={<RefreshCw size={14} />}>
                    {tOr('repos.manager.refresh', 'Refresh')}
                  </GatedButton>
                </Box>
              </Box>
            ) : filteredRows.length > 0 ? (
              filteredRows.map((row) => (
                <RepoRow key={row.id} row={row} onOpen={openRepo} />
              ))
            ) : rows.length === 0 ? (
              <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
                <Box>
                  <GitBranch size={34} color={alpha(theme.palette.text.primary, 0.32)} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 850, mt: 1 }}>
                    {t('repoList.emptyTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2, maxWidth: 420 }}>
                    {t('repoList.emptyDesc')}
                  </Typography>
                  <GatedButton action="repo:connect" variant="contained" onClick={() => setPickerOpen(true)} startIcon={<Plus size={16} />}>
                    {t('repoList.connectRepos')}
                  </GatedButton>
                </Box>
              </Box>
            ) : (
              <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
                <Box>
                  <Search size={30} color={alpha(theme.palette.text.primary, 0.32)} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 850, mt: 1 }}>
                    {t('repoList.noSearchResults')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {t('repoList.tryDifferent')}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      <RepoPickerModal
        opened={pickerOpen}
        onClose={() => {
          setPickerOpen(false)
          refreshData()
        }}
      />
    </>
  )
}
