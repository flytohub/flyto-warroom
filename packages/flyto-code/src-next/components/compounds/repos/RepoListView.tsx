import { useState, useEffect, useMemo } from 'react'
import { useSnackbar } from 'notistack'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import InputBase from '@mui/material/InputBase'
import {
  GitBranch, Lock, Globe, ExternalLink, Play, Loader2, RefreshCw,
  CheckCircle2, XCircle, MinusCircle, AlertTriangle, Upload,
  Search, Plus, X,
} from 'lucide-react'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { useRepoDetail } from '@hooks/useRepoDetails'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { queryResolved } from '@lib/queryState'
import { triggerScan, cancelScan, cancelOrgScans, listRepoScans, getOrgHealthSummary, type ConnectedRepo } from '@lib/engine'
import { getComputedScore, type RepoScoreResultServer } from '@lib/engine'
import { Pagination } from '@atoms/Pagination'
import { AssetTierPicker } from '@atoms/AssetTierPicker'
import { ComplianceScopePicker } from '@atoms/ComplianceScopePicker'
import { BUAssignChip } from '@atoms/BUAssignChip'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { JellyCard } from '@atoms/JellyCard'
import { GatedButton } from '@atoms/GatedButton'
import { DataBoundary } from '@atoms/DataBoundary'
import { displayScore } from '@compounds/_shared/scoring'
import { RepoPickerModal } from '@compounds/_shared/picker'
import { colors, softBg } from '@/styles/designTokens'

import { LANG_COLORS } from './colors'

const REPO_TABLE_MIN_WIDTH = 720

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}

function CIBadge({ conclusion, htmlUrl }: { conclusion: string; htmlUrl: string }) {
  const config: Record<string, { icon: typeof CheckCircle2; bg: string; color: string; label: string }> = {
    success:   { icon: CheckCircle2, bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: t('ci.pass') },
    failure:   { icon: XCircle,      bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: t('ci.fail') },
    cancelled: { icon: MinusCircle,  bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: t('ci.cancelled') },
  }
  const c = config[conclusion] ?? config.cancelled
  const Icon = c.icon
  return (
    <Box
      component="a"
      href={htmlUrl}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5,
        px: 1, py: 0.25, borderRadius: '6px',
        bgcolor: c.bg, color: c.color,
        fontSize: 13, fontWeight: 600, textDecoration: 'none',
        transition: 'all 0.15s',
        '&:hover': { bgcolor: c.color, color: '#fff' },
      }}
    >
      <Icon size={12} />
      {c.label}
    </Box>
  )
}

// Scans run on the server in a bounded worker pool. Update model
// per CLAUDE.md "Live events (SSE)" — SSE drives refresh, no
// refetchInterval. The workspace root's useOrgEvents subscription
// invalidates qk.repos.scans(repo_id) on every scan.* event.
//
// Two reinforcements address mechanism gaps the operator surfaced
// 2026-05-23 ("進入頁面再去確認是否還在掃描"):
//
//   1. refetchOnMount: 'always' — when the operator nav's back to
//      the repo list, the query refetches even if cache is fresh,
//      so a scan that completed while they were on another tab
//      reflects immediately instead of waiting for the next SSE
//      event or staleTime tick.
//   2. Backend stalled-scan sweep — orphan "running" rows
//      (engine restart, worker crash, dropped scan.complete event)
//      are auto-transitioned to "stalled" by a worker tick. The
//      stale-Running case heals server-side, not by frontend
//      polling, which keeps the SSE-driven contract intact.
function ScanButton({ repo, onSelectRepo }: { repo: ConnectedRepo; onSelectRepo?: (id: string) => void }) {
  const isLocal = repo.scanMode === 'local'
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { data: scans } = useQuery({
    queryKey: qk.repos.scans(repo.id),
    queryFn: () => listRepoScans(repo.id, 3),
    staleTime: 2000,
    enabled: !isLocal,
    refetchOnMount: 'always',
  })
  const active = (scans?.scans ?? []).find(s => s.status === 'queued' || s.status === 'running')
  const scanning = !isLocal && !!active

  async function handleScan() {
    if (isLocal) {
      // Navigate to repo detail where the upload dropzone lives
      onSelectRepo?.(repo.id)
      return
    }
    if (scanning) return
    try {
      await triggerScan(repo.id)
      // Force-refresh scan status; also invalidate health so stale badge clears.
      qc.invalidateQueries({ queryKey: qk.repos.scans(repo.id) })
      qc.invalidateQueries({ queryKey: qk.repos.health(repo.id) })
    } catch {
      enqueueSnackbar(t('repoList.scanFailed'), { variant: 'error' })
    }
  }

  // Hard-stop a stuck scan. Backend kills the subprocess group via
  // its in-memory CancelFunc registry AND flips the DB row terminal
  // so cross-pod scans (where the goroutine lives on another engine
  // instance) also clear.
  async function handleCancel(e: React.MouseEvent) {
    e.stopPropagation()
    if (!active) return
    try {
      await cancelScan(active.id)
      qc.invalidateQueries({ queryKey: qk.repos.scans(repo.id) })
      qc.invalidateQueries({ queryKey: qk.repos.health(repo.id) })
      enqueueSnackbar(t('repoList.scanCancelled'), { variant: 'info' })
    } catch {
      enqueueSnackbar(t('repoList.scanCancelFailed'), { variant: 'error' })
    }
  }

  // When the active scan finishes, refresh health so the badge reflects the new score.
  useEffect(() => {
    if (!scanning && scans?.scans?.[0]?.status === 'complete') {
      qc.invalidateQueries({ queryKey: qk.repos.health(repo.id) })
      qc.invalidateQueries({ queryKey: qk.repos.healthSummary(repo.orgId) })
    }
  }, [scanning, scans, qc, repo.id])

  const label = isLocal
    ? t('repoList.uploadScan')
    : scanning
      ? (active?.status === 'running' ? t('repoList.scanRunning') : t('repoList.scanQueued'))
      : t('repoList.scan')

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      <Tooltip title={label} arrow>
        <span>
          <IconButton
            size="small"
            onClick={handleScan}
            disabled={scanning}
            aria-label={label}
            title={label}
            sx={{
              color: 'text.secondary',
              transition: 'all 0.2s',
              '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            {isLocal
              ? <Upload size={15} />
              : scanning ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          </IconButton>
        </span>
      </Tooltip>
      {/* Cancel button — only shown while a scan is in flight. Backend
          handler kills the subprocess and flips DB terminal so the
          spinner clears immediately. Solves "scanning... forever"
          state when a scan goroutine outlives the engine container it
          started on. */}
      {scanning && (
        <Tooltip title={t('repoList.cancelScan')} arrow>
          <IconButton
            size="small"
            onClick={handleCancel}
            aria-label={t('repoList.cancelScan')}
            sx={{
              color: 'error.main',
              transition: 'all 0.2s',
              '&:hover': { bgcolor: 'rgba(239,68,68,0.1)' },
            }}
          >
            <X size={15} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}

import { REPO_LIST_GRADE_COLORS as GRADE_COLORS } from './colors'

function ScannedAt({ scannedAt, lastScanStatus, lastScanError }: {
  scannedAt?: string
  lastScanStatus?: string
  lastScanError?: string
}) {
  // When the latest scan attempt failed, surface a warning chip with
  // the operator-actionable reason in the tooltip. Without this the
  // row reads as "never scanned" and the operator has no way to know
  // GitHub returned 403 / the App lacks repo access / clone timed out.
  if (lastScanStatus === 'failed' && lastScanError) {
    return (
      <Tooltip title={lastScanError} arrow placement="top">
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          cursor: 'help', color: 'warning.main',
        }}>
          <AlertTriangle size={11} />
          <Typography variant="caption" sx={{
            fontSize: 12, fontWeight: 700,
            textDecoration: 'underline dotted', textUnderlineOffset: 3,
          }}>
            {t('repos.scanFailed')}
          </Typography>
        </Box>
      </Tooltip>
    )
  }
  // Stalled = engine flipped the row server-side because started_at
  // went past the freshness threshold (worker pod restart, dropped
  // scan.complete SSE event, subprocess crashed without writing back).
  // Visually distinct from 'failed' because there's no upstream
  // error message — operator just needs to retry.
  if (lastScanStatus === 'stalled') {
    return (
      <Tooltip
        title={t('repos.scanStalledHint')}
        arrow placement="top"
      >
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          cursor: 'help', color: 'warning.main',
        }}>
          <AlertTriangle size={11} />
          <Typography variant="caption" sx={{
            fontSize: 12, fontWeight: 700,
            textDecoration: 'underline dotted', textUnderlineOffset: 3,
          }}>
            {t('repos.scanStalled')}
          </Typography>
        </Box>
      </Tooltip>
    )
  }
  if (!scannedAt) return <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>--</Typography>
  return <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12 }}>{timeAgo(scannedAt)}</Typography>
}

function HealthBadge({ grade, score }: { grade?: string; score?: number }) {
  if (!grade) {
    return (
      <Chip
        label="--"
        size="small"
        variant="outlined"
        sx={{ fontSize: 12, fontWeight: 700, height: 24, minWidth: 32, color: 'text.secondary', borderColor: 'divider' }}
      />
    )
  }

  const colors = GRADE_COLORS[grade] ?? { bg: 'action.disabledBackground', color: 'text.secondary' }

  return (
    <Tooltip title={`Health: ${displayScore(score ?? 0)}`} arrow>
      <Chip
        label={grade}
        size="small"
        sx={{
          fontSize: 12,
          fontWeight: 800,
          height: 24,
          minWidth: 32,
          bgcolor: colors.bg,
          color: colors.color,
          border: 'none',
          letterSpacing: 0.5,
        }}
      />
    </Tooltip>
  )
}

function LanguageChip({ language }: { language?: string }) {
  if (!language) return <Box sx={{ height: 22 }} />
  const dotColor = LANG_COLORS[language] ?? '#888'
  return (
    <Chip
      size="small"
      label={language}
      icon={
        <Box
          component="span"
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: dotColor,
            flexShrink: 0,
            ml: '4px !important',
          }}
        />
      }
      variant="outlined"
      sx={{
        fontSize: 12,
        height: 22,
        borderColor: 'divider',
        color: 'text.secondary',
        '& .MuiChip-icon': { mr: 0 },
      }}
    />
  )
}

import type { RepoHealthSummary } from '@lib/engine'

function RepoRow({ repo, health, repoScoreMap, onSelect }: { repo: ConnectedRepo; health?: RepoHealthSummary; repoScoreMap: Map<string, RepoScoreResultServer>; onSelect?: (id: string) => void }) {
  const { data: detail } = useRepoDetail(repo.ownerName, repo.repoName)

  const initials = (repo.repoName?.[0] ?? '?').toUpperCase()

  return (
    <Box
      onClick={() => onSelect?.(repo.id)}
      onKeyDown={e => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(repo.id) } }}
      role="button"
      tabIndex={onSelect ? 0 : -1}
      aria-label={repo.fullName ?? repo.repoName}
      sx={{
        display: 'flex',
        alignItems: 'center',
        minWidth: REPO_TABLE_MIN_WIDTH,
        px: 2.5,
        py: 1.5,
        cursor: onSelect ? 'pointer' : 'default',
        borderBottom: 1,
        borderColor: 'divider',
        transition: 'background 0.15s',
        '&:hover': { bgcolor: 'action.hover' },
        '&:last-child': { borderBottom: 0 },
      }}
    >
      {/* Fixed grid: avatar+name | lang | tier | health | CI | scanned | actions */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 90px 130px 70px 90px 70px 80px', alignItems: 'center', gap: 1.25, width: '100%', minWidth: 0 }}>
        {/* Avatar + Name + fullName */}
        <Box className="flex items-center gap-3 min-w-0">
          {/* Repo icon */}
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              bgcolor: 'action.selected',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.secondary' }}>{initials}</Typography>
          </Box>
          <Box className="min-w-0">
            <Box className="flex items-center gap-1.5">
              <Typography variant="body2" fontWeight={700} noWrap sx={{ color: 'text.primary', fontSize: 13 }}>
                {repo.repoName}
              </Typography>
              {repo.isPrivate
                ? <Lock size={11} style={{ opacity: 0.35, flexShrink: 0 }} />
                : <Globe size={11} style={{ opacity: 0.35, flexShrink: 0 }} />}
            </Box>
            <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary', fontSize: 12 }}>
              {repo.fullName ?? repo.ownerName}
            </Typography>
          </Box>
        </Box>

        {/* Language */}
        <Box className="flex items-center">
          <LanguageChip language={repo.language} />
        </Box>

        {/* Asset tier + Compliance scope + Business unit — drive
            the CTEM priority multiplier + per-team scoping when a
            finding lands on this repo. Compact scope cluster is
            read-only; click the tier / BU chip to change. Stops
            propagation so neither also fires the row's onClick. */}
        <Box className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <AssetTierPicker target="repo" orgId={repo.orgId} id={repo.id} tier={repo.assetTier} />
          <ComplianceScopePicker
            target="repo"
            orgId={repo.orgId}
            id={repo.id}
            value={repo.complianceScope}
            readonly
            compact
          />
          <BUAssignChip
            orgId={repo.orgId}
            assetId={repo.id}
            assetKind="repo"
            currentBUID={repo.businessUnitId}
            invalidateOnChange={['connected-repos', repo.orgId]}
          />
        </Box>

        {/* Health */}
        <Box className="flex justify-center">
          <HealthBadge
            grade={repoScoreMap.get(repo.id)?.grade}
            score={repoScoreMap.get(repo.id)?.raw}
          />
        </Box>

        {/* CI */}
        <Box className="flex justify-center">
          {detail?.ci
            ? <CIBadge conclusion={detail.ci.conclusion} htmlUrl={detail.ci.htmlUrl} />
            : <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>--</Typography>}
        </Box>

        {/* Last scanned */}
        <Box className="flex justify-center">
          <ScannedAt
            scannedAt={health?.scanned_at}
            lastScanStatus={repo.lastScanStatus}
            lastScanError={repo.lastScanError}
          />
        </Box>

        {/* Actions */}
        <Box className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <ScanButton repo={repo} onSelectRepo={onSelect} />
          <IconButton
            size="small"
            component="a"
            href={repo.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('repoList.openInProvider')}
            title={t('repoList.openInProvider')}
            sx={{
              color: 'text.secondary',
              transition: 'all 0.2s',
              '&:hover': { color: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            <ExternalLink size={15} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}

export function RepoListView({ onSelectRepo }: { onSelectRepo?: (id: string) => void }) {
  const { org, loading: orgLoading, ready: orgReady, error: orgError } = useOrg()
  const reposQ = useConnectedRepos(org?.id)
  const { data: repos } = reposQ
  const workspaceUnavailable = orgReady && !org
  const reposLoading = (orgLoading && !org) || !orgReady || !queryResolved(reposQ, !!org?.id)
  const reposError = !!orgError || reposQ.isError
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const PAGE_SIZE = 7

  // Fetch health for all repos in one request. SSE (useOrgEvents at the
  // workspace root) invalidates this query whenever scan state changes
  // server-side, so we don't need a refetchInterval fallback — the button
  // state is driven by live events.
  const { data: healthSummary } = useQuery({
    queryKey: qk.repos.healthSummary(org?.id),
    queryFn: () => getOrgHealthSummary(org!.id),
    enabled: !!org?.id && !!repos && repos.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const scanningAll = (healthSummary?.active_scan_count ?? 0) > 0

  // Unified per-repo grades from computed-score (single source of truth)
  const { data: computedScore } = useQuery({
    queryKey: qk.computedScore(org?.id),
    queryFn: () => getComputedScore(org!.id),
    enabled: !!org?.id && !!repos && repos.length > 0,
    staleTime: 60_000,
  })
  const repoScoreMap = useMemo(() => {
    const m = new Map<string, RepoScoreResultServer>()
    for (const rs of computedScore?.repo_scores ?? []) {
      m.set(rs.repo_id, rs)
    }
    return m
  }, [computedScore])

  // Build a map for quick lookup (legacy health data for KPIs)
  const healthMap = new Map(
    (healthSummary?.repos ?? []).map(h => [h.repo_id, h])
  )

  // Filter repos by search query
  const filtered = useMemo(() => {
    if (!repos) return []
    if (!searchQuery.trim()) return repos
    const q = searchQuery.toLowerCase()
    return repos.filter(r =>
      r.repoName.toLowerCase().includes(q) ||
      r.fullName?.toLowerCase().includes(q) ||
      r.ownerName?.toLowerCase().includes(q) ||
      r.language?.toLowerCase().includes(q)
    )
  }, [repos, searchQuery])

  // Reset page when search changes
  useEffect(() => { setPage(1) }, [searchQuery])

  async function scanAll() {
    if (!repos) return
    // Fire all triggers — the server is idempotent if a scan is already
    // queued/running for a repo, so no duplicate work. After dispatch SSE
    // invalidates healthSummary on every scan event; the button stays
    // disabled while active_scan_count > 0 without any polling loop.
    // Skip local-mode repos — they require manual upload.
    let failed = 0
    for (const repo of repos) {
      if (repo.scanMode === 'local') continue
      try { await triggerScan(repo.id) } catch { failed++ }
    }
    if (failed > 0) {
      enqueueSnackbar(tOr('repoList.scanAllPartialFail', `${failed} repo(s) failed to start. Please retry.`), { variant: 'warning' })
    }
    qc.invalidateQueries({ queryKey: qk.repos.healthSummary(org?.id) })
    qc.invalidateQueries({ queryKey: qk.repos.scansAll() })
  }

  // Bulk-cancel every queued/running scan in the org. Wired to the
  // "Cancel All" pill (header replaces the Scan-All button while
  // scanningAll). Solves "Scanning… forever" — one click and the
  // backend flips every row terminal AND SIGKILLs whichever
  // subprocesses are still alive on this engine pod.
  const cancelAllMut = useMutation({
    mutationFn: () => cancelOrgScans(org!.id),
    onSuccess: (data) => {
      enqueueSnackbar(
        tOr('repoList.cancelledN', `Cancelled ${data.cancelled} scan(s)`).replace('{n}', String(data.cancelled)),
        { variant: 'success' },
      )
      qc.invalidateQueries({ queryKey: qk.repos.healthSummary(org?.id) })
      qc.invalidateQueries({ queryKey: qk.repos.scansAll() })
    },
    onError: () => {
      enqueueSnackbar(t('repoList.cancelAllFailed'), { variant: 'error' })
    },
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 3 }}>
      <Box
        sx={{
          // Thin section-accent rail so the engineer header carries the
          // same brand accent the manager view shows — toggling modes
          // reads as the same page. Hue-only; surface stays theme palette.
          borderLeft: `3px solid ${colors.brand}`,
          pl: 2,
          mb: 2.5,
          borderRadius: '2px',
          background: `linear-gradient(90deg, ${softBg(colors.brand, 0.06)}, transparent 40%)`,
        }}
      >
      <FlytoPageHeader
        title={t('nav.repos')}
        subtitle={t('repoList.subtitle')}
        bottomGap={0}
        count={repos ? (
          <Chip label={repos.length} size="small" sx={{ fontWeight: 700, bgcolor: colors.brand, color: '#fff' }} />
        ) : undefined}
        action={
          <>
            <GatedButton
              action="repo:connect"
              variant="outlined"
              size="medium"
              onClick={() => setPickerOpen(true)}
              startIcon={<Plus size={16} />}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3, borderColor: 'primary.main', color: 'primary.main' }}
            >
              {t('repoList.connectRepos')}
            </GatedButton>
            {repos && repos.length > 0 && (
              // Single button with two modes:
              //   idle      → "Scan All" (purple gradient, triggers scanAll)
              //   scanning  → "Cancel All" (red, fires bulk cancel)
              // Solves the "Scanning…" stuck-pill problem the user hit
              // in production — there was no way to escape the spinner.
              scanningAll ? (
                <GatedButton
                  action="scan:cancel"
                  variant="contained"
                  size="medium"
                  disabled={cancelAllMut.isPending}
                  onClick={() => cancelAllMut.mutate()}
                  startIcon={cancelAllMut.isPending
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Loader2 size={14} className="animate-spin" />}
                  endIcon={<X size={14} />}
                  sx={{
                    textTransform: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 2,
                    px: 3,
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#fff',
                    boxShadow: 'none',
                    '&:hover': { background: 'linear-gradient(135deg, #dc2626, #b91c1c)', boxShadow: 'none' },
                  }}
                  title={t('repoList.cancelAllScansTip')}
                >
                  {cancelAllMut.isPending
                    ? t('repoList.cancelling')
                    : t('repoList.cancelAllScans')}
                </GatedButton>
              ) : (
                <GatedButton
                  action="scan:trigger"
                  variant="contained"
                  size="medium"
                  onClick={scanAll}
                  startIcon={<RefreshCw size={14} />}
                  sx={{
                    textTransform: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 2,
                    px: 3,
                    background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                    color: '#fff',
                    boxShadow: 'none',
                    '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #2563eb)', boxShadow: 'none' },
                  }}
                >
                  {t('repoList.scanAll')}
                </GatedButton>
              )
            )}
          </>
        }
      />
      </Box>

      {/* Summary stats */}
      {repos && repos.length > 0 && (() => {
        const privateCount = repos.filter((r) => r.isPrivate).length
        const publicCount = repos.length - privateCount
        const langs = new Set(repos.map((r) => r.language).filter(Boolean))
        return (
          <Box className="flex items-center gap-2 mb-4 flex-wrap">
            <Chip
              icon={<Lock size={11} />}
              label={`${privateCount} ${t('dashboard.private')}`}
              size="small"
              variant="outlined"
              sx={{ fontSize: 12, height: 24, borderColor: 'divider', color: 'text.secondary' }}
            />
            <Chip
              icon={<Globe size={11} />}
              label={`${publicCount} ${t('dashboard.public')}`}
              size="small"
              variant="outlined"
              sx={{ fontSize: 12, height: 24, borderColor: 'divider', color: 'text.secondary' }}
            />
            <Chip
              label={`${langs.size} ${t('repoList.languages')}`}
              size="small"
              variant="outlined"
              sx={{ fontSize: 12, height: 24, borderColor: 'divider', color: 'text.secondary' }}
            />
          </Box>
        )
      })()}

      {/* Search bar */}
      {repos && repos.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 0.75,
            mb: 2,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '10px',
            transition: 'border-color 0.2s',
            '&:focus-within': { borderColor: 'primary.main' },
          }}
        >
          <Search size={16} style={{ opacity: 0.4, flexShrink: 0 }} />
          <InputBase
            placeholder={t('repoList.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            sx={{
              fontSize: 13,
              color: 'text.primary',
              '& input::placeholder': { color: 'text.secondary', opacity: 1 },
            }}
          />
          {searchQuery && (
            <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontSize: 12 }}>
              {filtered.length} {t('repoList.results')}
            </Typography>
          )}
        </Paper>
      )}

      {/* Table */}
      <JellyCard delay={0} noHover style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <Paper
        elevation={1}
        className="rounded-xl"
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <DataBoundary
          isLoading={reposLoading}
          isError={reposError}
          error={orgError ?? reposQ.error}
          onRetry={() => { void reposQ.refetch() }}
          hasData={!!repos && !workspaceUnavailable}
          empty={workspaceUnavailable}
          label="repositories"
          emptyTitle={t('repoList.workspaceUnavailable')}
          emptyDescription={t('repoList.workspaceUnavailableDesc')}
          loadingVariant="spinner"
        >
        {paged.length > 0 ? (
          <>
            {/* Table header */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '2fr 90px 130px 70px 90px 70px 80px',
                alignItems: 'center',
                gap: 1.25,
                minWidth: REPO_TABLE_MIN_WIDTH,
                px: 2.5,
                py: 1.25,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('repoList.name')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('repoList.language')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('repoList.assetTier')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{t('repoList.health')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>CI</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{t('repoList.lastScan')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{t('repoList.actions')}</Typography>
            </Box>
            {paged.map((repo) => <RepoRow key={repo.id} repo={repo} health={healthMap.get(repo.id)} repoScoreMap={repoScoreMap} onSelect={onSelectRepo} />)}
          </>
        ) : searchQuery ? (
          /* No search results */
          <Box className="flex flex-col items-center justify-center py-16 gap-2">
            <Search size={36} style={{ opacity: 0.1 }} />
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              {t('repoList.noSearchResults')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('repoList.tryDifferent')}
            </Typography>
          </Box>
        ) : (
          /* Empty state — no repos connected */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12 }}>
            <Box sx={{
              width: 80, height: 80, borderRadius: '50%', mb: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'action.hover',
            }}>
              <GitBranch size={36} style={{ opacity: 0.3 }} />
            </Box>
            <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ mb: 1 }}>
              {t('repoList.emptyTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 400, mb: 3 }}>
              {t('repoList.emptyDesc')}
            </Typography>
            <GatedButton
              action="repo:connect"
              variant="contained"
              size="medium"
              onClick={() => setPickerOpen(true)}
              startIcon={<Plus size={16} />}
              sx={{
                textTransform: 'none',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: '10px',
                px: 3,
                py: 1,
                background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                color: '#fff',
                boxShadow: 'none',
                '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #2563eb)', boxShadow: 'none' },
              }}
            >
              {t('repoList.connectRepos')}
            </GatedButton>
          </Box>
        )}
        </DataBoundary>
      </Paper>
      </JellyCard>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </Box>

      {/* Repo picker modal */}
      <RepoPickerModal
        opened={pickerOpen}
        onClose={() => {
          setPickerOpen(false)
          // Refresh repo list after picker closes
          qc.invalidateQueries({ queryKey: qk.repos.connected(org?.id) })
        }}
      />
    </Box>
  )
}
