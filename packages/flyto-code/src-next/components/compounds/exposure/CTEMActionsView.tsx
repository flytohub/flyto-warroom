import React, { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { Chip, Alert, Button, Stack, TextField, Checkbox, Tooltip, IconButton, Box } from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  FileText, ArrowUpRight, ListTree, Globe, ShieldAlert,
  Clock, CheckCircle2, RotateCcw, User, Flame, Crown, Skull,
  RefreshCw, CheckSquare, Square, ChevronDown, ChevronRight, Wand2,
} from 'lucide-react'
// ChevronDown serves the binder accordion below; the
// FindingDetailPanel + RemediationSteps now live in
// CTEMActionsDetail.tsx and import their own MUI primitives.
import { GatedButton } from '@atoms/GatedButton'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { downloadEvidenceBinder, type ComplianceFramework } from '@lib/engine'
import {
  getEnrichedOrgIssues, type SecurityIssue,
  markExternalIssueFixed, verifyExternalIssue,
  assignExternalIssue, markCodeIssueFixed, verifyCodeIssue,
  bulkMarkExternalFixed, bulkAssignExternal,
  type CTEMPriorityItem,
} from '@lib/engine'
import { getCtemPrioritiesPage } from '@lib/engine/code/posture'
import { colors, softBg } from '@/styles/designTokens'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { QueryError } from '@atoms/QueryError'
import { SignalStrip, type SignalSpec } from '@atoms/SignalStrip'
import { SkeletonRows } from '@atoms/Skeleton'
import { Pagination as SharedPagination } from '@atoms/Pagination'
import { JellyCard } from '@atoms/JellyCard'
import { Empty } from '../scanning/_shared'
import {
  CTEMFilterBar, EMPTY_FILTER,
  type CTEMFilterState, type FilterTier, type FilterSeverity, type SortKey,
} from './CTEMFilterBar'
import { consumeCTEMActionsIntent } from '@lib/warroomNav'
import { useFixQueue } from '@/contexts/FixQueueContext'
import { FindingDetailPanel } from './CTEMActionsDetail'
import { UnifiedFindingDrawer } from './UnifiedFindingDrawer'

// CTEMActionsView — the Exposure section's prioritization war-room.
//
// Bench items merge two sources:
//   • Code findings — enriched code_alerts (blast graph + AI fix
//     supported via CTEMExtrasPanel).
//   • External CTEM findings — DNS/SSL/email/supply-chain misses
//     scored by the backend priority engine (KEV/EPSS-ready, asset-
//     tier-aware, mitigation-adjusted via ctem/priorities endpoint).
//
// Why two queries instead of one merged endpoint: code_alerts have
// blast-graph wiring the external table doesn't, and the priority
// engine's code-side denormalisation lands in a follow-up change.
// Frontend merges by `priority_score`; backend treats each
// independently so the entitlement gate can flip one off without
// shoring up the other.

export interface CTEMActionsViewProps {
  orgId: string
}

const FRAMEWORKS: { value: ComplianceFramework; label: string }[] = [
  { value: 'soc2',     label: t('reports.tmpl.soc2') },
  { value: 'iso27001', label: t('hardcoded.iso.27001.a871bde8') },
  { value: 'pci',      label: t('hardcoded.pci.dss.9487fef3') },
  { value: 'nist',     label: t('hardcoded.nist.csf.5f8e7dab') },
  { value: 'owasp',    label: t('reports.tmpl.owasp') },
  { value: 'gdpr',     label: 'GDPR' },
  { value: 'hipaa',    label: 'HIPAA' },
]

// BenchItem is the unified shape the picker iterates. With the
// 2026-05-17 build the backend now decorates BOTH external and code
// findings with priority fields at read time, so we no longer
// synthesise priorities client-side. The /ctem/priorities endpoint
// returns the merged list with kind discrimination already applied.
type BenchItem = {
  kind: 'external' | 'code'
  src: CTEMPriorityItem | SecurityIssue
  priority: CTEMPriorityItem
}

// Severity numeric for ranking when priority_score collides.
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

// TODO(backend-truth, B8): the priority tie-break ladder (severity →
// KEV+EPSS heuristic → first_seen) is product logic — every client
// implementing CTEM would produce a different order today. Backend
// should accept `?sort=priority` and apply the ladder once.
// `?sort=sla` here is fine because it sorts on already-canonical
// fields (breached + sla_breach_at), no derivation needed. See
// flyto-engine/docs/FRONTEND_LOGIC_AUDIT_2026_05_24.md#B8
function sortBy<T extends { priority: CTEMPriorityItem }>(items: T[], sort: SortKey): T[] {
  const out = items.slice()
  switch (sort) {
    case 'priority':
      // 4-level tie-break so a cluster of 30 priority-24 rows still
      // surfaces the most actionable: priority desc → severity asc →
      // KEV/EPSS exploitability desc → first_seen asc (oldest =
      // more overdue). Without this every "24" row looked identical.
      out.sort((a, b) => {
        if (a.priority.priority_score !== b.priority.priority_score) {
          return b.priority.priority_score - a.priority.priority_score
        }
        const sevDelta = (SEV_RANK[a.priority.effective_severity] ?? 9) -
                         (SEV_RANK[b.priority.effective_severity] ?? 9)
        if (sevDelta !== 0) return sevDelta
        const aExploit = (a.priority.kev_listed ? 1 : 0) + a.priority.epss_score
        const bExploit = (b.priority.kev_listed ? 1 : 0) + b.priority.epss_score
        if (aExploit !== bExploit) return bExploit - aExploit
        return Date.parse(a.priority.first_seen_at) - Date.parse(b.priority.first_seen_at)
      })
      return out
    case 'sla':
      // Breached first, then by sla_breach_at ascending (soonest
      // overdue rises). Unset clocks sink to the bottom.
      out.sort((a, b) => {
        if (a.priority.breached !== b.priority.breached) return a.priority.breached ? -1 : 1
        const ax = a.priority.sla_breach_at ? Date.parse(a.priority.sla_breach_at) : Infinity
        const bx = b.priority.sla_breach_at ? Date.parse(b.priority.sla_breach_at) : Infinity
        return ax - bx
      })
      return out
    case 'severity':
      out.sort((a, b) =>
        (SEV_RANK[a.priority.effective_severity] ?? 9) - (SEV_RANK[b.priority.effective_severity] ?? 9))
      return out
    case 'recent_fix':
      // Most-recently marked-fixed first; never-marked sinks.
      out.sort((a, b) => {
        const ax = a.priority.marked_fixed_at ? Date.parse(a.priority.marked_fixed_at) : 0
        const bx = b.priority.marked_fixed_at ? Date.parse(b.priority.marked_fixed_at) : 0
        return bx - ax
      })
      return out
    case 'first_seen':
      out.sort((a, b) =>
        Date.parse(a.priority.first_seen_at) - Date.parse(b.priority.first_seen_at))
      return out
  }
  return out
}

// friendlyError maps common engine error shapes to operator-readable
// copy. Falls back to the raw message when we don't recognise it
// (better than nothing — the alternative was String(error) which
// looked like internal debug output).
function friendlyError(err: unknown): string {
  if (err == null) return ''
  const raw = err instanceof Error ? err.message : String(err)
  const msg = raw.toLowerCase()
  if (msg.includes('unauthorized') || msg.includes('401')) {
    return t('ctem.errSession')
  }
  if (msg.includes('forbidden') || msg.includes('403')) {
    return t('ctem.errForbidden')
  }
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return t('ctem.errNetwork')
  }
  if (msg.includes('illegal verify transition')) {
    return t('ctem.errVerifyTransition')
  }
  return raw
}

export function CTEMActionsView({ orgId }: CTEMActionsViewProps) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const fixQueue = useFixQueue()
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  // Cross-source unified drawer — opens GET /findings/{fingerprint}
  // (locations, autofix, verdicts, open PRs, blast force-graph).
  const [drawerFp, setDrawerFp] = useState<string | null>(null)
  const [drawerAlertId, setDrawerAlertId] = useState<string | null>(null)
  const [drawerTitle, setDrawerTitle] = useState<string>('')
  const [filters, setFilters] = useState<CTEMFilterState>(EMPTY_FILTER)
  const [selectedFps, setSelectedFps] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 30
  // P1-10 (Wave 1): server-side windowing. The priority list can ship
  // up to ~15k rows; downloading all of them to page client-side does
  // not scale. We fetch a bounded window from /ctem/priorities (which
  // now honours ?limit/?offset) and let the operator pull more via
  // "Load more". The client-side filter/sort/dedup join still runs over
  // the loaded window. WINDOW_STEP is the increment per "Load more".
  const WINDOW_STEP = 500
  const [fetchLimit, setFetchLimit] = useState(WINDOW_STEP)
  const [bulkAssigneeOpen, setBulkAssigneeOpen] = useState(false)
  const [bulkAssigneeDraft, setBulkAssigneeDraft] = useState('')
  // Compliance binder defaults collapsed — operator complaint:
  // takes too much vertical real estate and pushes the triage
  // bench down. Click the chevron when ready to download.
  const [binderOpen, setBinderOpen] = useState(false)
  const [downloadingBinder, setDownloadingBinder] = useState<ComplianceFramework | null>(null)
  const [binderError, setBinderError] = useState<string | null>(null)

  // View mode — toggles how the picker groups findings. The
  // existing flat list is "priority"; grouping options came from
  // folding the retired Domain Intel page into CTEM Actions.
  const [viewMode, setViewMode] = useState<'priority' | 'domain' | 'tier'>('priority')

  // Consume a cross-page navigation intent if one is pending —
  // PostureOverview's KPI click → CTEM Actions with breachedOnly,
  // Attack Paths chain click → CTEM Actions with selectFingerprint,
  // etc. Runs once on mount + clears the stash.
  useEffect(() => {
    const intent = consumeCTEMActionsIntent()
    if (!intent) return
    setFilters(prev => ({
      ...prev,
      search: intent.search ?? prev.search,
      tiers: intent.tiers ?? prev.tiers,
      severities: intent.severities ?? prev.severities,
      breachedOnly: intent.breachedOnly ?? prev.breachedOnly,
      verifyingOnly: intent.verifyingOnly ?? prev.verifyingOnly,
      hasThreatActor: intent.hasThreatActor ?? prev.hasThreatActor,
      unassignedOnly: intent.unassignedOnly ?? prev.unassignedOnly,
    }))
    if (intent.selectFingerprint) {
      setSelectedAlertId(intent.selectFingerprint)
    }
  }, [])
  // a11y — aria-live region announces verification-state changes
  // so screen readers know when Mark Fixed succeeded etc.
  const [liveMsg, setLiveMsg] = useState('')

  // /ctem/priorities now merges code + external on the backend, with
  // the priority engine running over both. We still fetch /issues
  // so the existing enrichment (PR overlap, taint, etc.) is
  // available for the right-side detail panel — but the picker
  // reads exclusively from the merged priorities endpoint.
  const issuesQ = useQuery({
    queryKey: qk.ctem.enrichedIssues(orgId, 'ctem'),
    queryFn: () => getEnrichedOrgIssues(orgId, { severity: 'critical,high' }),
    staleTime: 30_000,
  })

  const ctemQ = useQuery({
    // Scope the key by the active window so "Load more" refetches a
    // wider page. Events lane invalidates `['ctem-priorities', orgId]`
    // (prefix) on issue.status_changed / external_issue.updated, which
    // still matches this longer key.
    queryKey: qk.ctem.priorities(orgId, `dedup:${fetchLimit}`),
    queryFn: () => getCtemPrioritiesPage(orgId, { dedup: true, limit: fetchLimit, offset: 0 }),
    staleTime: 30_000,
  })

  // True server total (across all pages), independent of the loaded
  // window. Drives the honest "of N" copy + gates "Load more".
  const ctemTotal = ctemQ.data?.total ?? (ctemQ.data?.items?.length ?? 0)
  const ctemHasMore = ctemQ.data?.has_more ?? false
  // P1-10 honesty: a contributing feed FAILED to produce rows for this
  // request. An empty / short queue must NOT read as "all clear".
  const ctemStale = ctemQ.data?.stale ?? false
  const ctemStaleReason = ctemQ.data?.stale_reason ?? ''

  // B9: /ctem/priorities?dedup=true is now the canonical merged +
  // deduped picker feed. The backend owns the collapse signature,
  // survivor tie-break, and affected_count. Keep only the UI-specific
  // low/no-signal suppression and code issue enrichment join here.
  const benchItems = useMemo<BenchItem[]>(() => {
    const out: BenchItem[] = []
    const codeByFp = new Map<string, SecurityIssue>()
    for (const i of (issuesQ.data?.issues ?? []) as SecurityIssue[]) {
      codeByFp.set(i.fingerprint, i)
    }
    for (const p of (ctemQ.data?.items ?? []) as CTEMPriorityItem[]) {
      const lowAndQuiet = p.effective_severity === 'low' && !p.breached && !p.threat_actor && !p.kev_listed
      if (lowAndQuiet) continue
      out.push(p.kind === 'code'
        ? { kind: 'code', src: codeByFp.get(p.fingerprint) ?? (p as unknown as SecurityIssue), priority: p }
        : { kind: 'external', src: p, priority: p })
    }
    // Sort by priority_score desc, then severity rank as tie-breaker.
    out.sort((a, b) => {
      if (a.priority.priority_score !== b.priority.priority_score) {
        return b.priority.priority_score - a.priority.priority_score
      }
      return (SEV_RANK[a.priority.effective_severity] ?? 9) - (SEV_RANK[b.priority.effective_severity] ?? 9)
    })
    return out
  }, [issuesQ.data, ctemQ.data])

  // Filter + search + sort applied AFTER the base bench is built.
  // Kept separate so the underlying bench list re-computes only
  // when source data changes, while the filtered list re-computes
  // on every filter tweak (cheap — ≤ 30 typical).
  const filteredItems = useMemo(() => {
    const search = filters.search.toLowerCase().trim()
    let out = benchItems
    if (search) {
      out = out.filter(item => {
        const p = item.priority
        return (
          (p.title ?? '').toLowerCase().includes(search) ||
          (p.description ?? '').toLowerCase().includes(search) ||
          (p.domain ?? '').toLowerCase().includes(search) ||
          (p.category ?? '').toLowerCase().includes(search) ||
          (p.threat_actor ?? '').toLowerCase().includes(search) ||
          (p.threat_campaign ?? '').toLowerCase().includes(search) ||
          (p.assigned_to ?? '').toLowerCase().includes(search)
        )
      })
    }
    if (filters.tiers.length) {
      const set = new Set<FilterTier>(filters.tiers)
      out = out.filter(item => set.has((item.priority.asset_tier ?? 'internal') as FilterTier))
    }
    if (filters.severities.length) {
      const set = new Set<FilterSeverity>(filters.severities)
      out = out.filter(item => set.has(item.priority.effective_severity as FilterSeverity))
    }
    if (filters.breachedOnly) out = out.filter(item => item.priority.breached)
    if (filters.verifyingOnly) out = out.filter(item => item.priority.verification_state === 'pending_verify')
    if (filters.hasThreatActor) out = out.filter(item => !!item.priority.threat_actor)
    if (filters.unassignedOnly) out = out.filter(item => !item.priority.assigned_to)

    // Apply explicit sort if not the default (default already done above).
    out = sortBy(out, filters.sort)

    // View-mode grouping — re-sort by the grouping key first so
    // cluster headers naturally collapse "all on api.acme.com" or
    // "all crown_jewel" together. Priority sort stays as the
    // secondary key within each group.
    if (viewMode === 'domain') {
      out = out.slice().sort((a, b) => {
        const ad = a.priority.domain ?? a.priority.repo_id ?? ''
        const bd = b.priority.domain ?? b.priority.repo_id ?? ''
        if (ad !== bd) return ad.localeCompare(bd)
        return b.priority.priority_score - a.priority.priority_score
      })
    } else if (viewMode === 'tier') {
      const tierOrder: Record<string, number> = {
        crown_jewel: 0, customer_facing: 1, internal: 2, sandbox: 3,
      }
      out = out.slice().sort((a, b) => {
        const at = tierOrder[a.priority.asset_tier ?? 'internal'] ?? 9
        const bt = tierOrder[b.priority.asset_tier ?? 'internal'] ?? 9
        if (at !== bt) return at - bt
        return b.priority.priority_score - a.priority.priority_score
      })
    }
    return out
  }, [benchItems, filters, viewMode])

  // Reset page on filter / data change so the operator doesn't get
  // stranded on page 4 of nothing after a filter narrows the set.
  useEffect(() => { setPage(0) }, [filters, benchItems.length])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const pagedItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const allOnPageSelected = pagedItems.length > 0 &&
    pagedItems.every(item => selectedFps.has(item.priority.fingerprint))

  function togglePageSelect() {
    setSelectedFps(prev => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        pagedItems.forEach(item => next.delete(item.priority.fingerprint))
      } else {
        pagedItems.forEach(item => next.add(item.priority.fingerprint))
      }
      return next
    })
  }
  function toggleSelect(fp: string) {
    setSelectedFps(prev => {
      const next = new Set(prev)
      if (next.has(fp)) next.delete(fp); else next.add(fp)
      return next
    })
  }

  const selected = useMemo(() => {
    if (!selectedAlertId) return null
    return benchItems.find(b => b.priority.id === selectedAlertId) ?? null
  }, [benchItems, selectedAlertId])

  async function downloadBinder(framework: ComplianceFramework) {
    setDownloadingBinder(framework)
    setBinderError(null)
    try {
      await downloadEvidenceBinder(orgId, framework)
    } catch (err) {
      setBinderError(err instanceof Error ? err.message : String(err))
    } finally {
      setDownloadingBinder(null)
    }
  }

  // ── Mark fixed / false-positive mutations ────────────────────────

  // Kind-aware mark-fixed — route through the right endpoint based
  // on whether the finding lives in external_issue_tracker (engine
  // owns the fingerprint) or issue_status (the on-the-fly /issues
  // shape — fingerprint is computed from scan results).
  const markFixedMut = useMutation({
    mutationFn: ({ fp, kind }: { fp: string; kind: 'external' | 'code' }) =>
      kind === 'code'
        ? markCodeIssueFixed(orgId, fp)
        : markExternalIssueFixed(orgId, { fingerprint: fp }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      setLiveMsg(t('ctem.liveMarkedFixed'))
      enqueueSnackbar(t('ctem.toastMarkedFixed'),
        { variant: 'success' })
    },
    onError: (err) => enqueueSnackbar(friendlyError(err), { variant: 'error' }),
  })
  const falsePosMut = useMutation({
    mutationFn: ({ fp, kind }: { fp: string; kind: 'external' | 'code' }) =>
      kind === 'code'
        ? verifyCodeIssue(orgId, fp, 'false_positive')
        : verifyExternalIssue(orgId, fp, 'false_positive'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      setSelectedAlertId(null)
      setLiveMsg(t('ctem.liveFalsePositive'))
      enqueueSnackbar(t('ctem.toastFalsePositive'),
        { variant: 'info' })
    },
    onError: (err) => enqueueSnackbar(friendlyError(err), { variant: 'error' }),
  })
  const assignMut = useMutation({
    mutationFn: ({ fp, assignee }: { fp: string; assignee: string }) =>
      assignExternalIssue(orgId, fp, assignee),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      // Inline templates for dynamic interpolation — tOr() doesn't
      // do {placeholder} interpolation, so anything with a runtime
      // value gets assembled in JS with the static prefix translated.
      const assignedPrefix = t('ctem.assignedToPrefix')
      setLiveMsg(vars.assignee
        ? `${assignedPrefix} ${vars.assignee}`
        : t('ctem.toastUnassigned'))
      enqueueSnackbar(vars.assignee
        ? `${assignedPrefix} ${vars.assignee}`
        : t('ctem.toastUnassigned'),
        { variant: 'success' })
    },
    onError: (err) => enqueueSnackbar(friendlyError(err), { variant: 'error' }),
  })
  const bulkMarkFixedMut = useMutation({
    mutationFn: (fps: string[]) => bulkMarkExternalFixed(orgId, fps),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      setSelectedFps(new Set())
      setLiveMsg(`Marked ${res.succeeded.length} findings as fixed (${res.failed.length} failed)`)
    },
    // Keep the selection intact on failure so the operator can retry.
    onError: (err) => enqueueSnackbar(friendlyError(err), { variant: 'error' }),
  })
  const bulkAssignMut = useMutation({
    mutationFn: ({ fps, assignee }: { fps: string[]; assignee: string }) =>
      bulkAssignExternal(orgId, fps, assignee),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      setBulkAssigneeOpen(false)
      setBulkAssigneeDraft('')
      setSelectedFps(new Set())
      setLiveMsg(`Assigned ${res.succeeded.length} findings to ${vars.assignee} (${res.failed.length} failed)`)
    },
    // Do NOT clear the draft/selection on error — preserve the operator's input.
    onError: (err) => enqueueSnackbar(friendlyError(err), { variant: 'error' }),
  })

  // signalsFor builds the row's signal strip. Centralised here so
  // the visual treatment is one decision (not 7 inline <Chip>s) and
  // the urgency rank in SignalStrip picks the right 2 to show.
  function signalsFor(p: CTEMPriorityItem): SignalSpec[] {
    const out: SignalSpec[] = []
    if (p.kev_listed) {
      out.push({ tone: 'critical', label: 'KEV', icon: <Flame size={10} />,
                 tooltip: t('ctem.tipKev'),
                 pulse: true })
    }
    if (p.breached) {
      const prefix = t('ctem.tipSlaBreachedPrefix')
      const suffix = t('ctem.tipSlaBreachedSuffix')
      out.push({ tone: 'critical', label: 'SLA', icon: <Clock size={10} />,
                 tooltip: `${prefix} ${p.sla_hours}h ${suffix}`,
                 pulse: true })
    }
    if (p.threat_actor) {
      const prefix = t('ctem.tipThreatActorPrefix')
      out.push({ tone: 'threat', label: p.threat_campaign || p.threat_actor, icon: <Skull size={10} />,
                 tooltip: `${prefix}: ${p.threat_actor}${p.threat_campaign ? ` / ${p.threat_campaign}` : ''}` })
    }
    if (p.epss_score > 0.1) {
      const suffix = t('ctem.tipEpssSuffix')
      out.push({ tone: 'high', label: `EPSS ${Math.round(p.epss_score * 100)}%`,
                 tooltip: `EPSS ${Math.round(p.epss_score * 100)}% — ${suffix}` })
    }
    if (p.asset_tier === 'crown_jewel') {
      out.push({ tone: 'brand', label: 'CROWN', icon: <Crown size={10} />,
                 tooltip: t('ctem.tipCrownJewel') })
    } else if (p.asset_tier === 'customer_facing') {
      out.push({ tone: 'tech', label: 'CF', icon: <ShieldAlert size={10} />,
                 tooltip: t('ctem.tipCustomerFacing') })
    }
    if (p.verification_state === 'pending_verify') {
      out.push({ tone: 'tech', label: 'VERIFYING', icon: <RotateCcw size={10} />,
                 tooltip: t('ctem.tipVerifying') })
    }
    if (p.assigned_to) {
      out.push({ tone: 'brand', label: (p.assigned_to.split('@')[0] || p.assigned_to).slice(0, 10),
                 icon: <User size={10} />,
                 tooltip: `${t('ctem.assignedToPrefix')} ${p.assigned_to}` })
    }
    // verification_method (Phase A migration 018) — 4-tier trust
    // ladder. We surface only the higher tiers; passive findings
    // don't get a chip (would clutter without adding info — every
    // finding starts passive).
    if (p.verification_method === 'authenticated_verified') {
      out.push({ tone: 'critical', label: t('hardcoded.auth.verified.afd97509'), icon: <ShieldAlert size={10} />,
                 tooltip: t('ctem.tipAuthVerified') })
    } else if (p.verification_method === 'active_verified') {
      out.push({ tone: 'high', label: 'VERIFIED', icon: <ShieldAlert size={10} />,
                 tooltip: t('ctem.tipActiveVerified') })
    } else if (p.verification_method === 'manual_confirmed') {
      out.push({ tone: 'critical', label: 'CONFIRMED', icon: <ShieldAlert size={10} />,
                 tooltip: t('ctem.tipManualConfirmed') })
    }
    // Impact monetary range (Phase A) — surface "Potential
    // financial exposure" chip on critical / high severities so
    // operators see CFO-facing context inline.
    if (p.impact && (p.severity === 'critical' || p.severity === 'high')) {
      const mid = formatUSDCompact(p.impact.mid_usd)
      const low = formatUSDCompact(p.impact.low_usd)
      const high = formatUSDCompact(p.impact.high_usd)
      out.push({
        tone: 'brand',
        label: `${low}–${high}`,
        tooltip: `${p.impact.label}: ${mid} (range ${low}–${high}, ${p.impact.confidence} confidence). Source: ${p.impact.benchmark_source}.`,
      })
    }
    return out
  }

  // CTEM bench item count drives the "Open Fix Queue" CTA — no
  // findings means no work to walk through, so the button hides.
  const ctemItemCount = (ctemQ.data?.items ?? []).length

  return (
    <div
      className="exp-root ctem-actions-root"
      style={{
        '--exp-accent': colors.section.exposure,
        '--exp-accent-end': colors.techDeep,
        background: 'linear-gradient(180deg, rgba(6,182,212,0.08) 0%, rgba(139,92,246,0.035) 42%, transparent 100%)',
      } as React.CSSProperties}
    >
      {/* ── 1. Compliance evidence export — collapsible.
            Auditors fetch the binder once per session, so it
            doesn't earn permanent vertical space at the top of
            the page. Click the header to expand. Closed by
            default; click-to-expand reveals the 7-framework grid. */}
      <Box
        sx={{
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) auto' },
          gap: 1.5,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            borderRadius: 2,
            border: '1px solid',
            borderColor: (theme) => alpha(colors.section.exposure, theme.palette.mode === 'dark' ? 0.35 : 0.22),
            bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.62 : 0.9),
            backgroundImage: (theme) => [
              `linear-gradient(120deg, ${alpha(colors.section.exposure, theme.palette.mode === 'dark' ? 0.18 : 0.1)}, transparent 48%)`,
              `linear-gradient(90deg, ${alpha(colors.brand, theme.palette.mode === 'dark' ? 0.1 : 0.06)}, transparent 70%)`,
            ].join(','),
            boxShadow: (theme) => theme.palette.mode === 'dark'
              ? `0 18px 42px ${alpha('#000', 0.26)}`
              : `0 14px 34px ${alpha('#334155', 0.12)}`,
            px: { xs: 1.5, md: 2 },
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1.75,
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              color: colors.section.exposure,
              bgcolor: softBg(colors.section.exposure, 0.14),
              boxShadow: `inset 0 0 0 1px ${softBg(colors.section.exposure, 0.32)}`,
            }}
          >
            <ShieldAlert size={21} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              <Box component="h1" sx={{ m: 0, fontSize: { xs: 22, md: 26 }, lineHeight: 1.05, fontWeight: 850 }}>
                {t('ctem.actionsTitle')}
              </Box>
              <Chip
                size="small"
                icon={<ListTree size={13} />}
                label={viewMode === 'priority' ? t('ctem.viewByPriority') : viewMode === 'domain' ? t('ctem.viewByDomain') : t('ctem.viewByTier')}
                sx={{
                  height: 24,
                  fontSize: 12,
                  fontWeight: 800,
                  color: colors.section.exposure,
                  bgcolor: softBg(colors.section.exposure, 0.13),
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            </Stack>
            <Box sx={{ mt: 0.5, color: 'text.secondary', fontSize: 13, maxWidth: 820 }}>
              {t('ctem.actionsLede')}
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(3, 112px)' },
            gap: 1,
          }}
        >
          <OpsMetric label={t('ctem.open')} value={benchItems.length} tone={colors.section.exposure} />
          <OpsMetric label={t('ctem.showingOf')} value={filteredItems.length} tone={colors.brand} />
          <OpsMetric label={t('ctem.bulkSelected')} value={selectedFps.size} tone={selectedFps.size > 0 ? colors.semantic.warning : colors.semantic.neutral} />
        </Box>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshCw size={14} />}
          disabled={ctemQ.isFetching || issuesQ.isFetching}
          onClick={() => {
            void ctemQ.refetch()
            void issuesQ.refetch()
          }}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
        >
          {tOr('common.refresh', 'Refresh')}
        </Button>
        {ctemItemCount > 0 && (
          <Button
            size="small"
            variant="contained"
            color="inherit"
            disableElevation
            startIcon={<Wand2 size={14} />}
            onClick={() => fixQueue.open({ filter: 'all' })}
            sx={{
              textTransform: 'none',
              fontWeight: 800,
              bgcolor: colors.section.exposure,
              color: '#00111a',
              boxShadow: 'none',
              '&:hover': { bgcolor: colors.techDeep, boxShadow: 'none' },
            }}
          >
            {t('ctem.openFixQueue')}
          </Button>
        )}
        {ctemStale && (
          <Chip
            size="small"
            icon={<Clock size={13} />}
            label={t('ctem.staleTitle')}
            sx={{
              height: 30,
              fontSize: 12,
              fontWeight: 800,
              color: colors.semantic.warning,
              bgcolor: softBg(colors.semantic.warning, 0.13),
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
        )}
      </Stack>

      <JellyCard delay={0} noHover>
      <div className="exp-card">
        <button
          type="button"
          onClick={() => setBinderOpen(o => !o)}
          aria-expanded={binderOpen}
          style={{
            all: 'unset', display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px', cursor: 'pointer', width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {binderOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <FileText size={16} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            {t('ctem.complianceExport')}
          </span>
          <Chip
            size="small"
            label={t('ctem.auditReady')}
            sx={{ ml: 'auto', height: 20, fontSize: 12,
                  bgcolor: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}
          />
        </button>
        {binderOpen && (
          <>
            <p className="exp-card-desc">
              {t('ctem.complianceExportDesc')}
            </p>
            <div className="exp-framework-grid">
              {FRAMEWORKS.map((f) => (
                <div key={f.value} className="exp-framework-row">
                  <span className="exp-framework-label">{f.label}</span>
                  <div className="exp-framework-actions">
                    {/* PDF link removed per operator feedback —
                        it pointed at the HTML view (browser →
                        Save-as-PDF), which felt like a dead-end.
                        The md download is the canonical evidence
                        format anyway. */}
                    <button
                      className="exp-link"
                      type="button"
                      onClick={() => void downloadBinder(f.value)}
                      disabled={downloadingBinder !== null}
                    >
                      {downloadingBinder === f.value
                        ? t('common.working')
                        : t('ctem.downloadEvidence')}
                      <ArrowUpRight size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {binderError && (
              <Box sx={{ mt: 1 }}>
                <InlineErrorNotice error={binderError} />
              </Box>
            )}
          </>
        )}
      </div>
      </JellyCard>

      {/* View-mode toggle — folds the retired Domain Intel page in
          as a grouping option (sorts by domain so the cluster
          headers group by domain), plus a tier view. Pure sort
          change; existing filters + bulk + cluster rendering
          stay unchanged. */}
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        {(['priority', 'domain', 'tier'] as const).map(mode => (
          <Button
            key={mode}
            size="small"
            variant={viewMode === mode ? 'contained' : 'outlined'}
            onClick={() => setViewMode(mode)}
            sx={{
              textTransform: 'none', fontSize: 13, py: 0.25, px: 1.5,
              minWidth: 0,
              bgcolor: viewMode === mode ? colors.brand : undefined,
              borderColor: 'var(--mui-palette-divider, rgba(148,163,184,0.25))',
              color: viewMode === mode ? '#fff' : 'var(--mui-palette-text-secondary)',
              '&:hover': {
                bgcolor: viewMode === mode ? colors.brandDeep : undefined,
              },
            }}
          >
            {mode === 'priority' && t('ctem.viewByPriority')}
            {mode === 'domain' && t('ctem.viewByDomain')}
            {mode === 'tier' && t('ctem.viewByTier')}
          </Button>
        ))}
      </Stack>

      {/* ── 2. Main grid — picker (3fr left) + detail (2fr right).
            Stretches to fill remaining viewport so the bench gets
            real estate instead of being squeezed into 220px. Each
            column is a flex column that lets the inner card take
            flex:1 and the pagination (left column only) sit outside
            the card below it. */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gridTemplateRows: 'minmax(0, 1fr)',
        gap: 14,
        alignItems: 'stretch',
      }}>
      <div style={{
        display: 'flex', flexDirection: 'column',
        gap: 10, minHeight: 0,
      }}>
      <JellyCard delay={0.04} noHover style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div className="exp-card" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: 0, overflow: 'hidden',
      }}>
        <div className="exp-card-head">
          <ListTree size={16} />
          <span>{t('ctem.prioritiesTitle')}</span>
          {benchItems.length > 0 && (
            <Chip
              size="small"
              // Honest total — show the loaded count, and when the
              // server has more rows than the current window, disclose
              // the true total so the operator never reads a windowed
              // list as the whole queue.
              label={ctemTotal > benchItems.length
                ? `${benchItems.length} ${t('ctem.ofTotal')} ${ctemTotal} ${t('ctem.open')}`
                : `${benchItems.length} ${t('ctem.open')}`}
              sx={{
                ml: 'auto', height: 20, fontSize: 13, fontWeight: 700,
                bgcolor: 'rgba(139,92,246,0.18)', color: '#a78bfa',
              }}
            />
          )}
        </div>
        <p className="exp-card-desc">
          {t('ctem.prioritiesDesc')}
        </p>

        {(issuesQ.isLoading || ctemQ.isLoading) && <SkeletonRows rows={6} />}
        {ctemQ.isError && (
          <Box sx={{ mt: 1 }}>
            <QueryError compact error={ctemQ.error} onRetry={() => { void ctemQ.refetch() }} label={t('ctem.prioritiesTitle')} />
          </Box>
        )}
        {/* P1-10: non-blocking staleness banner. When a contributing
            feed failed, the queue may be incomplete — so a short or
            empty list must never be read as "all clear". Renders above
            both the populated list and the empty state. */}
        {!ctemQ.isLoading && ctemStale && (
          <Alert
            severity="warning"
            variant="outlined"
            sx={{ mt: 1, mb: 1, fontSize: 13 }}
          >
            <strong>{t('ctem.staleTitle')}</strong>
            {' — '}
            {ctemStaleReason
              ? t('ctem.staleReason') + `: ${ctemStaleReason}`
              : t('ctem.staleGeneric')}
          </Alert>
        )}

        {!issuesQ.isLoading && !ctemQ.isLoading && benchItems.length === 0 && (
          <Empty
            icon={CheckCircle2}
            text={ctemStale
              ? t('ctem.noAlertsStaleTitle')
              : t('ctem.noAlertsTitle')}
            description={ctemStale
              ? t('ctem.noAlertsStale')
              : t('ctem.noAlerts')}
          />
        )}

        {benchItems.length > 0 && (
          <>
            <CTEMFilterBar
              state={filters}
              onChange={setFilters}
              total={benchItems.length}
              shown={filteredItems.length}
            />

            {/* Bulk action bar — only visible when ≥1 selected.
                aria-live announces selection count to screen readers. */}
            {selectedFps.size > 0 && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{
                  mb: 1, px: 1.5, py: 1, borderRadius: 1.5,
                  bgcolor: softBg(colors.brand, 0.10),
                  border: `1px solid ${softBg(colors.brand, 0.28)}`,
                }}
                role="region"
                aria-label={t('ctem.bulkBarAria')}
              >
                <Tooltip title={t('ctem.clearSelection')}>
                  <Button
                    size="small"
                    onClick={() => setSelectedFps(new Set())}
                    sx={{ minWidth: 0, color: colors.brand, textTransform: 'none', fontSize: 12, fontWeight: 700 }}
                    aria-live="polite"
                  >
                    {selectedFps.size} {t('ctem.bulkSelected')}
                  </Button>
                </Tooltip>
                <Box sx={{ flex: 1 }} />
                <GatedButton
                  action="finding:update"
                  size="small"
                  variant="contained"
                  startIcon={<CheckCircle2 size={12} />}
                  disabled={bulkMarkFixedMut.isPending}
                  onClick={() => bulkMarkFixedMut.mutate(Array.from(selectedFps))}
                  sx={{
                    bgcolor: colors.semantic.success,
                    boxShadow: 'none',
                    '&:hover': { bgcolor: '#16a34a', boxShadow: 'none' },
                    textTransform: 'none', fontWeight: 600, fontSize: 12,
                  }}
                >
                  {t('ctem.bulkMarkFixed')}
                </GatedButton>
                <GatedButton
                  action="finding:update"
                  size="small"
                  variant="outlined"
                  startIcon={<User size={12} />}
                  onClick={() => setBulkAssigneeOpen(o => !o)}
                  sx={{ textTransform: 'none', fontSize: 12 }}
                >
                  {t('ctem.bulkAssign')}
                </GatedButton>
              </Stack>
            )}
            {bulkAssigneeOpen && (
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  placeholder={t('ctem.bulkAssignPlaceholder')}
                  value={bulkAssigneeDraft}
                  onChange={(e) => setBulkAssigneeDraft(e.target.value)}
                  disabled={bulkAssignMut.isPending}
                />
                <GatedButton
                  action="finding:update"
                  size="small"
                  variant="contained"
                  disabled={!bulkAssigneeDraft.trim() || bulkAssignMut.isPending}
                  onClick={() => bulkAssignMut.mutate({
                    fps: Array.from(selectedFps),
                    assignee: bulkAssigneeDraft.trim(),
                  })}
                  sx={{ textTransform: 'none', fontSize: 12 }}
                >
                  {bulkAssignMut.isPending
                    ? t('ctem.bulkAssigning')
                    : t('ctem.bulkAssignConfirm')}
                </GatedButton>
              </Stack>
            )}

            <div
              className="exp-alert-list"
              role="list"
              aria-label={t('ctem.benchAria')}
              // Override the legacy CSS's 220px max-height — the
              // bench now lives in a flex column that fills the
              // available viewport, so we set flex:1 + min-height:0
              // (essential for scrolling to engage inside flex)
              // and clear the legacy cap. padding-right gives the
              // scrollbar breathing room so it doesn't kiss the
              // card border.
              style={{ flex: 1, maxHeight: 'none', paddingRight: 6, minHeight: 0 }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                const target = e.target as HTMLElement
                const row = target.closest('[role="listitem"]')
                if (!row) return
                e.preventDefault()
                const next = e.key === 'ArrowDown'
                  ? row.nextElementSibling
                  : row.previousElementSibling
                const btn = next?.querySelector<HTMLButtonElement>('button.exp-alert-row')
                btn?.focus()
              }}
            >
              {/* Header row — select-all + count. */}
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.5,
                fontSize: 13, color: 'var(--mui-palette-text-secondary)',
                borderBottom: '1px solid var(--mui-palette-divider, rgba(148,163,184,0.16))',
              }}>
                <Tooltip title={t('ctem.selectAllOnPage')}>
                  <IconButton
                    size="small"
                    onClick={togglePageSelect}
                    sx={{ p: 0.25 }}
                    aria-label={t('ctem.selectAllAria')}
                  >
                    {allOnPageSelected
                      ? <CheckSquare size={14} color={colors.brand} />
                      : <Square size={14} />}
                  </IconButton>
                </Tooltip>
                <span>
                  {t('ctem.showingPrefix')}{' '}{pagedItems.length}{' '}
                  {t('ctem.showingOf')}{' '}{filteredItems.length}
                </span>
              </Box>
              {pagedItems.map((item, idx) => {
                const p = item.priority
                const prev = idx > 0 ? pagedItems[idx - 1].priority : null
                // A "cluster header" appears at the FIRST row of every
                // distinct priority_score group. Lets operators see
                // at-a-glance "these 30 rows are all priority 24" and
                // scan within the cluster by secondary signal.
                const isClusterStart = !prev || prev.priority_score !== p.priority_score
                const clusterSize = isClusterStart
                  ? pagedItems.filter(x => x.priority.priority_score === p.priority_score).length
                  : 0
                const active = selectedAlertId === p.id
                const checked = selectedFps.has(p.fingerprint)
                const sevColor = colors.severity[p.effective_severity as keyof typeof colors.severity] ?? colors.semantic.neutral
                return (
                  <React.Fragment key={`${item.kind}:${p.id}`}>
                    {isClusterStart && clusterSize > 1 && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px 4px',
                        fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))',
                        borderTop: idx === 0 ? 'none' : `1px dashed ${softBg(colors.semantic.neutral, 0.18)}`,
                      }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 24, height: 16, borderRadius: 4,
                          background: softBg(sevColor, 0.16), color: sevColor,
                          fontSize: 12, fontWeight: 800, fontFamily: 'ui-monospace, monospace',
                        }}>{p.priority_score}</span>
                        <span>
                          {clusterSize} {t('ctem.clusterSuffix')}
                        </span>
                      </div>
                    )}
                  <div
                    role="listitem"
                    style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                  >
                    {/* Per-row checkbox — outside the button so toggling
                        doesn't also open the detail panel. */}
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleSelect(p.fingerprint)}
                      size="small"
                      sx={{ p: 0.25, ml: 0.5, color: colors.semantic.neutral }}
                      inputProps={{ 'aria-label': tOr('ctem.rowCheckboxAria',
                        `Select finding ${p.title}`) }}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedAlertId(active ? null : p.id)}
                      className={`exp-alert-row${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      style={{ position: 'relative', flex: 1 }}
                    >
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 38, height: 26, marginRight: 8,
                          borderRadius: 6, fontSize: 12, fontWeight: 800,
                          background: softBg(sevColor, 0.14),
                          color: sevColor,
                          fontFamily: 'ui-monospace, monospace',
                        }}
                        title={t('ctem.priorityScore')}
                        aria-label={tOr('ctem.priorityScoreAria',
                          `Priority ${p.priority_score} of 100`)}
                      >
                        {p.priority_score}
                      </span>

                      {item.kind === 'external' && p.domain && (
                        <Chip
                          size="small"
                          icon={<Globe size={10} />}
                          label={p.domain}
                          sx={{
                            height: 20, mr: 0.75, fontSize: 12, fontWeight: 600,
                            maxWidth: 180,
                            bgcolor: softBg(colors.tech),
                            color: colors.tech,
                            '& .MuiChip-icon': { ml: 0.5, color: colors.tech },
                          }}
                        />
                      )}

                      <span className="exp-alert-title">{p.title || p.description}</span>

                      {/* Affected count — if the dedup collapsed N
                          rows into this one (same CVE across
                          packages/repos), show ×N so the operator
                          knows the breadth without the row clutter. */}
                      {p.affected_count && p.affected_count > 1 && (
                        <Tooltip title={t('ctem.tipAffected')}>
                          <Chip
                            size="small"
                            label={`×${p.affected_count}`}
                            sx={{
                              ml: 0.5, height: 18, fontSize: 12, fontWeight: 700,
                              bgcolor: softBg(colors.semantic.neutral, 0.18),
                              color: colors.semantic.neutral,
                            }}
                          />
                        </Tooltip>
                      )}

                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                        <SignalStrip signals={signalsFor(p)} visible={2} />
                      </span>
                    </button>
                  </div>
                  </React.Fragment>
                )
              })}
              {filteredItems.length === 0 && (
                <Empty
                  icon={ListTree}
                  text={t('ctem.noFilterMatch')}
                  description={t('ctem.noFilterMatchDesc')}
                />
              )}
            </div>

          </>
        )}

        {/* aria-live region — screen readers announce mutation
            successes (Mark Fixed → "Finding marked as fixed…"). */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute', left: -10000, top: 'auto',
            width: 1, height: 1, overflow: 'hidden',
          }}
        >
          {liveMsg}
        </div>
      </div>
      </JellyCard>

      {/* Pagination — OUTSIDE the picker card (sits in the left
          flex column directly below it). Same component as the
          Issues page so the two pages share visual treatment. */}
      {totalPages > 1 && (
        <Box sx={{ px: 0.5 }}>
          <SharedPagination
            page={page + 1}
            totalPages={totalPages}
            total={filteredItems.length}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => setPage(p - 1)}
          />
        </Box>
      )}

      {/* P1-10: windowed "Load more". Only the first WINDOW_STEP rows
          are fetched initially; when the server reports more, the
          operator pulls the next window instead of the page downloading
          the full ~15k-row list up front. */}
      {ctemHasMore && (
        <Box sx={{ px: 0.5, display: 'flex', justifyContent: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            disabled={ctemQ.isFetching}
            startIcon={<RefreshCw size={13} />}
            onClick={() => setFetchLimit((n) => n + WINDOW_STEP)}
            sx={{ textTransform: 'none', fontSize: 13 }}
          >
            {ctemQ.isFetching
              ? t('ctem.loadingMore')
              : `${t('ctem.loadMore')} (${benchItems.length} / ${ctemTotal})`}
          </Button>
        </Box>
      )}
      </div>

      {/* Right column — kind-aware detail panel when a finding is
          selected, otherwise an empty-state CTA telling the operator
          to pick something on the left. Same layout slot either way
          so the page doesn't reflow on selection. */}
      {selected ? (
        <JellyCard delay={0.08} noEnter style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <FindingDetailPanel
          issue={selected.priority}
          kind={selected.kind}
          onViewUnified={() => {
            setDrawerFp(selected.priority.fingerprint)
            setDrawerAlertId(selected.kind === 'code' ? selected.priority.id : null)
            setDrawerTitle(selected.priority.title || selected.priority.description || '')
          }}
          onMarkFixed={() => markFixedMut.mutate({ fp: selected.priority.fingerprint, kind: selected.kind })}
          onFalsePositive={() => falsePosMut.mutate({ fp: selected.priority.fingerprint, kind: selected.kind })}
          onAssign={(assignee) => assignMut.mutate({ fp: selected.priority.fingerprint, assignee })}
          markFixedPending={markFixedMut.isPending}
          falsePosPending={falsePosMut.isPending}
          assignPending={assignMut.isPending}
          actionError={markFixedMut.error ?? falsePosMut.error ?? assignMut.error}
        />
        </JellyCard>
      ) : (
        <JellyCard delay={0.08} noHover style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          className="exp-card"
          style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: 320, padding: 32, textAlign: 'center',
            gap: 12,
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: softBg(colors.brand, 0.10),
            color: colors.brand,
          }}>
            <ListTree size={28} />
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: 'var(--mui-palette-text-primary, var(--color-text-primary))',
          }}>
            {t('ctem.detailEmptyTitle')}
          </div>
          <div style={{
            fontSize: 12, lineHeight: 1.6, maxWidth: 280,
            color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))',
          }}>
            {t('ctem.detailEmptyDesc')}
          </div>
        </div>
        </JellyCard>
      )}
      </div>

      {/* Cross-source unified finding drawer — first caller of
          GET /findings/{fingerprint}. Renders cross-repo locations,
          autofix status, verification verdicts, open PRs, and the
          per-alert blast force-graph. */}
      <UnifiedFindingDrawer
        open={!!drawerFp}
        onClose={() => { setDrawerFp(null); setDrawerAlertId(null) }}
        orgId={orgId}
        fingerprint={drawerFp}
        alertId={drawerAlertId}
        title={drawerTitle}
      />
    </div>
  )
}


// ── FindingDetailPanel + RemediationSteps + DetailField live in
//    CTEMActionsDetail.tsx (sibling). 2026-05-17 audit split this
//    1323-LOC file into orchestrator + detail to reduce cognitive
//    load and let the panel re-render independently.

function OpsMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        borderRadius: 2,
        border: '1px solid',
        borderColor: (theme) => alpha(tone, theme.palette.mode === 'dark' ? 0.3 : 0.2),
        bgcolor: (theme) => alpha(tone, theme.palette.mode === 'dark' ? 0.12 : 0.075),
        px: 1.25,
        py: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          color: 'text.secondary',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Box>
      <Box sx={{ color: tone, fontSize: 22, fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Box>
    </Box>
  )
}

// formatUSDCompact compacts a dollar amount for the impact chip:
// 1_247_892 → "$1.2M", 850_000 → "$850K". No localization yet;
// CISO/CFO defaults to USD in the breach-benchmark dataset.
function formatUSDCompact(usd: number): string {
  if (!usd || usd <= 0) return '$0'
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`
  return `$${usd}`
}
