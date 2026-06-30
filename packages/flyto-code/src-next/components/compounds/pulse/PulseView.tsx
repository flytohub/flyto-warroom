/**
 * PulseView — the cross-dimension "what should I look at right now"
 * feed. Renders engine's /orgs/{id}/pulse: unified PulseItem stream
 * sorted by computed blast radius across every dimension the engine
 * collects (code alerts / container / IaC / license / DAST / pentest).
 *
 * Why this view exists (not just "another issue list"):
 *   - issue list = severity sort within ONE dimension.
 *   - pulse = blast-radius sort across ALL dimensions, with cross-dim
 *     context inline. The answer to "what to act on right now"
 *     instead of "what is most severe in dimension X".
 *
 * Defaults to "all open" so the page is never empty when scans haven't
 * fired in the last 24h — narrowing happens via the window selector.
 *
 * Layout: Bento Grid — hero card for the highest-blast item, stacked
 * cards on the right, standard 3-column grid for everything else.
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, Box as LucideBox, Check, ChevronDown, FileCode, GitPullRequest, Globe,
  Scale, ShieldAlert, Target, Sparkles, Wand2, Crown, Skull, Fingerprint, KeyRound, GitCompare, Radar, Cloud,
  Database, Settings2,
} from 'lucide-react'
import {
  Box, Button, Chip, CircularProgress, Collapse, List, Paper, Typography,
} from '@mui/material'
import { t, tOr } from '@lib/i18n';
import { useOrg } from '@hooks/useOrg'
import { useCapabilities, type CapabilityHelpers } from '@hooks/useCapabilities'
import { getOrgPulse, type PulseItem } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { ContextStrip, type PRRef } from '@atoms/ContextStrip'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { PRDialog } from '@atoms/PRDialog'
import { QueryError } from '@atoms/QueryError'
import { severityColor } from '@atoms/SeverityChip'
import { UniversalFindingPanel } from '@compounds/_shared/UniversalFindingPanel'
import { useFixQueue } from '@/contexts/FixQueueContext'

// Severity filter — operators want to scope the feed to "only
// crit / high" the same way they do on Issues. Added 2026-05-19
// per the Pulse audit. Default 'all' = no filter.
type Severity = 'all' | 'critical' | 'high' | 'medium' | 'low'
const SEV_FILTER_OPTIONS: Array<{ value: Severity; label: string; tone?: string }> = [
	  { value: 'all', label: t('common.all') },
	  { value: 'critical', label: t('hardcoded.critical.tone.089045c7'), tone: '#ef4444' },
	  { value: 'high', label: t('hardcoded.high.tone.6c0a015c'), tone: '#f97316' },
	  { value: 'medium', label: t('hardcoded.medium.tone.cf72d2f3'), tone: '#eab308' },
	  { value: 'low', label: t('hardcoded.low.tone.fc5b34cf'), tone: '#64748b' },
]

// localStorage key for the "last time the user looked at Pulse" —
// used to mark items as NEW since that visit. Per-org so a multi-
// tenant operator sees the right NEW marks per workspace.
function lastVisitKey(orgId: string | undefined): string {
  return `flyto:pulse:lastVisit:${orgId ?? 'anon'}`
}

type Window = 'all' | '24h' | '7d' | '30d'

const WINDOW_VALUES: Record<Window, string> = {
  'all': '',
  '24h': '24h',
  '7d':  '168h',
  '30d': '720h',
}

// Per-source icon + label. Per the grounded-palette rule
// ([feedback_ui_grounded_palette]) source kind ISN'T severity, so
// these chips deliberately render in a single neutral tone — only
// the severity badge and blast number carry colour. Use the
// icon shape to differentiate sources, not hue.
const SOURCE_META: Record<PulseItem['source'], { icon: typeof Activity; labelKey: string; fallback: string }> = {
  alert:     { icon: AlertTriangle, labelKey: 'pulse.sourceAlert',     fallback: 'SAST' },
  container: { icon: LucideBox,     labelKey: 'pulse.sourceContainer', fallback: 'Container' },
  iac:       { icon: FileCode,      labelKey: 'pulse.sourceIaC',       fallback: 'IaC' },
  license:   { icon: Scale,         labelKey: 'pulse.sourceLicense',   fallback: 'License' },
  dast:      { icon: Globe,         labelKey: 'pulse.sourceDAST',      fallback: 'DAST' },
  pentest:   { icon: Target,        labelKey: 'pulse.sourcePentest',   fallback: 'Pentest' },
  cspm:       { icon: Cloud,        labelKey: 'pulse.sourceCspm',       fallback: 'Cloud (CSPM)' },
  identity:   { icon: Fingerprint,  labelKey: 'pulse.sourceIdentity',   fallback: 'Identity' },
  mcp:        { icon: ShieldAlert,  labelKey: 'pulse.sourceMcp',        fallback: 'MCP Runtime' },
  leak:       { icon: KeyRound,     labelKey: 'pulse.sourceLeak',       fallback: 'Leaks' },
  divergence: { icon: GitCompare,   labelKey: 'pulse.sourceDivergence', fallback: 'Reconciliation' },
}

// Neutral fallback for any future engine source not yet in SOURCE_META — a Radar
// glyph + the raw source string, NEVER the 'alert'/SAST icon (which would
// mislabel a cloud/identity/leak row as a code finding).
const NEUTRAL_SOURCE_META = { icon: Radar, labelKey: '', fallback: '' }

// DIMENSION_META — superset of SOURCE_META that also covers the dimension
// discriminators the engine reports in active_sources[] / missing_sources[]
// but that SOURCE_META (card-icon scoped) doesn't carry yet (identity / leak
// / divergence). Used ONLY by the dimension-awareness strip below; per the
// grounded-palette rule the icon shape — never hue — differentiates a source.
const DIMENSION_META: Record<string, { icon: typeof Activity; labelKey: string; fallback: string }> = {
  alert:      { icon: AlertTriangle, labelKey: 'pulse.dimAlert',      fallback: 'Code' },
  container:  { icon: LucideBox,     labelKey: 'pulse.dimContainer',  fallback: 'Container' },
  iac:        { icon: FileCode,      labelKey: 'pulse.dimIaC',        fallback: 'IaC' },
  license:    { icon: Scale,         labelKey: 'pulse.dimLicense',    fallback: 'License' },
  dast:       { icon: Globe,         labelKey: 'pulse.dimDAST',       fallback: 'Attack surface' },
  cspm:       { icon: Cloud,         labelKey: 'pulse.dimCspm',       fallback: 'Cloud posture' },
  identity:   { icon: Fingerprint,   labelKey: 'pulse.dimIdentity',   fallback: 'Identity' },
  mcp:        { icon: ShieldAlert,   labelKey: 'pulse.dimMcp',        fallback: 'MCP runtime' },
  leak:       { icon: KeyRound,      labelKey: 'pulse.dimLeak',       fallback: 'Leaks' },
  pentest:    { icon: Target,        labelKey: 'pulse.dimPentest',    fallback: 'Pentest' },
  divergence: { icon: GitCompare,    labelKey: 'pulse.dimDivergence', fallback: 'Reconciliation' },
}

function dimensionLabel(source: string): string {
  const meta = DIMENSION_META[source]
  return meta ? tOr(meta.labelKey, meta.fallback) : source
}

function dimensionIcon(source: string): typeof Activity {
  return DIMENSION_META[source]?.icon ?? Radar
}

// SOURCE_TO_PAGE — maps a pulse dimension `source` to the capabilities
// page id (capabilities.yaml `pages:`) that gates whether THIS org is
// entitled to that dimension. Used so the dimension-presence strip only
// labels a dimension "Silent" when the org could actually receive findings
// from it. A source the org isn't entitled to is NOT silent — it's simply
// out of scope, and rendering it as "Silent" would imply misconfiguration
// of a product the customer never bought (external-only Bitsight-style org
// shouldn't see "Code — Silent"; code-only Snyk-style org shouldn't see
// "Attack surface — Silent").
//
// Mapping rationale (per Page-id table in flyto-engine CLAUDE.md):
//   alert/container/iac/license → code-tier pages (issues, code_audit feature)
//   dast                        → domains  (ctem feature)
//   pentest                     → pentest  (code_audit feature)
//   cspm                        → cspm     (cspm feature)
//   identity                    → identity (identity feature)
//   leak                        → threat_intel (ctem feature — darkweb side)
//   divergence (CAASM fusion)   → no dedicated gated page; always in-scope.
//
// A source with no entry here is treated as cross-surface and always in-scope
// once capabilities are ready, so a new engine dimension that lacks a page
// mapping is never wrongly suppressed.
const SOURCE_TO_PAGE: Record<string, string> = {
  alert:     'issues',
  container: 'issues',
  iac:       'issues',
  license:   'issues',
  dast:      'domains',
  pentest:   'pentest',
  cspm:      'cspm',
  identity:  'identity',
  mcp:       'mcp',
  leak:      'threat_intel',
}

export function sourceToPageId(source: string): string | null {
  return SOURCE_TO_PAGE[source] ?? null
}

// The /pulse response is a strict superset of PulseResponse (P1-2): it now
// carries active_sources[] / missing_sources[] so the FE can tell "this
// dimension produced findings" from "this dimension produced ZERO rows this
// request". HONESTY: missing != misconfigured — a configured-and-clean
// dimension and an unconfigured one both land in missing_sources. Declared
// locally as optional so older engine builds (no fields) degrade gracefully.
type PulseSourcePresence = {
  active_sources?: string[]
  missing_sources?: string[]
}

interface PulseViewProps {
  /** Section router — lets a Pulse row jump straight into the
   *  relevant view (`_repo:<id>` / `_autofix` / `_pentest`)
   *  instead of being a dead card. */
  onNavigate?: (section: string) => void
}

export function PulseView({ onNavigate }: PulseViewProps = {}) {
  const { org } = useOrg()
  const caps = useCapabilities(org?.id)
  const fixQueue = useFixQueue()
  const [window, setWindow] = useState<Window>('all')
  const [severity, setSeverity] = useState<Severity>('all')
  const [selectedFp, setSelectedFp] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(50)
  const handleFindingClick = useCallback((fp: string) => setSelectedFp(fp), [])

  // Capture the "last visit" timestamp ONCE on mount, then update
  // localStorage on unmount. This gives a stable "NEW since you
  // last looked" reference for the whole session — flipping after
  // every render would defeat the purpose.
  const [lastVisitAt] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(lastVisitKey(org?.id))
      return raw ? Number(raw) : 0
    } catch { return 0 }
  })
  useEffect(() => {
    return () => {
      try { localStorage.setItem(lastVisitKey(org?.id), String(Date.now())) } catch { /* quota / private mode */ }
    }
  }, [org?.id])

  const { data, isLoading, isError, error, refetch } = useQuery({
    // qk.pulse.org → qk.pulse.feed(…) so the useOrgEvents qk.pulse.feed(orgId)
    // invalidation (scan/autofix) prefix-matches it. Was ['org-pulse', …],
    // which nothing invalidated → the feed never refreshed (cache bug M2).
    queryKey: qk.pulse.org(org?.id, window, pageSize),
    queryFn: () => getOrgPulse(org!.id, WINDOW_VALUES[window], pageSize),
    enabled: !!org?.id,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  })

  const allItems: PulseItem[] = data?.items ?? []

  // Dimension awareness (P1-2). The engine reports which known sources
  // produced ≥1 row this request (active) vs zero rows (missing). We read
  // them off the response (strict superset) defensively — older engine
  // builds omit the fields, in which case we render no dimension strip
  // rather than guessing. missing != misconfigured: see PulseSourcePresence.
  const presence = data as (typeof data & PulseSourcePresence) | undefined
  const activeSources = useMemo<string[]>(() => presence?.active_sources ?? [], [presence])
  const missingSources = useMemo<string[]>(() => presence?.missing_sources ?? [], [presence])
  // Entitlement-filtered missing set — drives the top compact-strip gate so it
  // only appears when there is a dimension the org could actually receive
  // findings from but didn't this scan. Mirrors the filter DimensionPresence
  // applies internally; we recompute here only to decide whether the strip
  // renders at all (avoids a strip that says "Reporting" with no "Silent" half).
  const visibleMissing = useMemo<string[]>(() => visibleMissingSources(missingSources, caps), [missingSources, caps])
  const hasPresenceData = activeSources.length > 0 || missingSources.length > 0

  // TODO(backend-truth, M5): severity filter should be a query
  // param so the server can re-rank inside the filtered set
  // (different cross-dim signals can dominate within "high only"
  // vs the full list). See FRONTEND_LOGIC_AUDIT_2026_05_24.md#M5
  const items = useMemo<PulseItem[]>(() => {
    if (severity === 'all') return allItems
    return allItems.filter(i => (i.severity ?? '').toLowerCase() === severity)
  }, [allItems, severity])

  // TODO(backend-truth, M6): NEW-badge derived from localStorage
  // lastVisitAt is browser-local and lost on device swap. Backend
  // should accept `?since=<ts>` and ship `is_new` per item, then
  // record the visit server-side. See FRONTEND_LOGIC_AUDIT_2026_05_24.md#M6
  //
  // Per-item NEW flag — true when the finding was created AFTER
  // the operator's previous Pulse visit. A first-time visitor
  // (lastVisitAt === 0) sees nothing as NEW, which is correct —
  // everything is new to them and the badge would be noise.
  const newItemIds = useMemo<Set<string>>(() => {
    if (lastVisitAt === 0) return new Set()
    const out = new Set<string>()
    for (const item of allItems) {
      const t = Date.parse(item.created_at ?? '')
      if (!Number.isNaN(t) && t > lastVisitAt) out.add(item.id)
    }
    return out
  }, [allItems, lastVisitAt])
  const newCount = newItemIds.size

  const stats = useMemo(() => {
    let prOverlap = 0
    let draftOverlap = 0
    let taintHits = 0
    let pentestCrit = 0
    let blastHigh = 0
    const bySource: Record<string, number> = {}
    for (const item of items) {
      if (!item) continue
      const prs = item.open_prs_touching ?? []
      if (prs.length > 0) {
        prOverlap++
        if (prs.some(p => p?.is_draft)) draftOverlap++
      }
      if (item.taint_adjacency) taintHits++
      if (item.pentest_verdict?.critical_count && item.pentest_verdict.critical_count > 0) pentestCrit++
      if ((item.blast_radius ?? 0) >= 60) blastHigh++
      bySource[item.source] = (bySource[item.source] ?? 0) + 1
    }
    return { open: items.length, prOverlap, draftOverlap, taintHits, pentestCrit, blastHigh, bySource }
  }, [items])

  // Action chip counts
  const autofixCount = useMemo(() => items.filter(i => i.autofix_eligible).length, [items])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* HEADER — Fuse pattern. Count + NEW-since-last-visit badge
          render inside the title; severity filter + time-window are
          the action slot. The previous per-source chip row is gone:
          source counts conceptually duplicated the stats row below,
          and source identity already lives in each bento card's
          source-icon chip — repeating it at the page level was noise. */}
      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 3 }, pt: { xs: 1.5, md: 2 }, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <FlytoPageHeader
          title={t('pulse.title')}
          subtitle={t('pulse.subtitle')}
          bottomGap={4}
          count={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={items.length}
                size="small"
                sx={{
                  fontWeight: 700,
                  bgcolor: items.length > 0 ? '#ef444418' : '#4ade8018',
                  color: items.length > 0 ? '#ef4444' : '#22c55e',
                }}
              />
              {newCount > 0 && (
                <Chip
                  icon={<Sparkles size={12} />}
                  label={t('pulse.newSince').replace('{n}', String(newCount))}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    bgcolor: '#7c3aed18',
                    color: '#7c3aed',
                    '& .MuiChip-icon': { color: '#7c3aed' },
                  }}
                />
              )}
            </Box>
          }
          action={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
              {/* Severity filter — small chip group. Defaults to "All"
                  so the page renders the same data on first load as
                  the pre-filter version. */}
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
                {SEV_FILTER_OPTIONS.map(opt => {
                  const active = severity === opt.value
                  return (
                    <Chip
                      key={opt.value}
                      label={tOr(`pulse.sev.${opt.value}`, opt.label)}
                      size="small"
                      onClick={() => setSeverity(opt.value)}
                      sx={{
                        height: 26, fontWeight: 600, fontSize: 12,
                        cursor: 'pointer',
                        bgcolor: active && opt.tone ? `${opt.tone}1a` : active ? 'action.selected' : 'transparent',
                        color: active && opt.tone ? opt.tone : active ? 'text.primary' : 'text.secondary',
                        border: '1px solid',
                        borderColor: active && opt.tone ? `${opt.tone}60` : active ? 'primary.main' : 'divider',
                        '&:hover': { bgcolor: active && opt.tone ? `${opt.tone}26` : 'action.hover' },
                      }}
                    />
                  )
                })}
              </Box>
              <FlytoSelect value={window} onChange={v => setWindow(v as Window)}
                options={[
                  { value: 'all', label: t('pulse.windowAll') },
                  { value: '24h', label: t('pulse.window24h') },
                  { value: '7d',  label: t('pulse.window7d') },
                  { value: '30d', label: t('pulse.window30d') },
                ]}
                minWidth={130} maxWidth={160} aria-label={t('pulse.window')} />
            </Box>
          }
        />
      </Box>

      {/* DIMENSION PRESENCE STRIP (P1-2) — when the feed has items, keep a
          quiet one-line "which dimensions are reporting vs silent" so an
          external-only (or code-only) org can see WHY a whole dimension is
          absent from the feed without us implying it's misconfigured. The
          empty-state renders its own richer copy, so this top strip is for
          the has-items case only, and only when a dimension is actually
          silent (otherwise it'd be noise). */}
      {!isLoading && !isError && items.length > 0 && hasPresenceData && visibleMissing.length > 0 && (
        <Box sx={{ px: 2, pt: 1, pb: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <DimensionPresence active={activeSources} missing={missingSources} compact caps={caps} />
        </Box>
      )}

      {/* ROW 2: STATS + ACTION CHIPS — fixed, no scroll */}
      {!isLoading && !isError && items.length > 0 && (
        <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {/* Colour rule (per feedback_ui_grounded_palette):
                only severity-bearing stats wear red — Blast / Taint /
                Pentest critical. PR counters are workflow metadata,
                not findings, so they render neutral. AutoFix is the
                one "positive" exception (green = ready to act). */}
            <MiniStat icon={AlertTriangle} color="#ef4444" label={t('pulse.statHighBlast')} value={stats.blastHigh} />
            <MiniStat icon={GitPullRequest} label={t('pulse.statPROverlap')} value={stats.prOverlap} />
            <MiniStat icon={ShieldAlert} color="#ef4444" label={t('pulse.statTaint')} value={stats.taintHits} />
            <MiniStat icon={GitPullRequest} label={t('pulse.statDraftOverlap')} value={stats.draftOverlap} />
            <MiniStat icon={Target} color="#ef4444" label={t('pulse.statPentest')} value={stats.pentestCrit} />
            <MiniStat icon={Check} color="#22c55e" label={t('item.autofix')} value={autofixCount} />

            {/* Action chips — all three now open the Fix Queue
                scoped to the relevant filter instead of bouncing
                to a section. Matches the dashboard's Cross-Dim
                cells so the operator's mental model is "every
                CTA opens the same drawer". */}
            <Box sx={{ display: 'flex', gap: 1, ml: 'auto', flexWrap: 'wrap' }}>
              {stats.prOverlap > 0 && (
                <Chip
                  icon={<GitPullRequest size={14} />}
                  label={t('pulse.chipQueuePR').replace('{n}', String(stats.prOverlap))}
                  size="small"
                  variant="outlined"
                  onClick={() => fixQueue.open({ filter: 'pr' })}
                  sx={{
                    height: 28, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    color: 'text.secondary', borderColor: 'divider',
                    '& .MuiChip-icon': { color: 'text.secondary' },
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                />
              )}
              {stats.taintHits > 0 && (
                <Chip
                  icon={<ShieldAlert size={14} />}
                  label={t('pulse.chipQueueTaint').replace('{n}', String(stats.taintHits))}
                  size="small"
                  onClick={() => fixQueue.open({ filter: 'taint' })}
                  sx={{
                    height: 28, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    bgcolor: '#ef444418', color: '#ef4444', '& .MuiChip-icon': { color: '#ef4444' },
                    '&:hover': { bgcolor: '#ef444430' },
                  }}
                />
              )}
              {autofixCount > 0 && (
                <Chip
                  icon={<Sparkles size={14} />}
                  label={t('pulse.chipQueueAutofix').replace('{n}', String(autofixCount))}
                  size="small"
                  onClick={() => fixQueue.open({ filter: 'autofix' })}
                  sx={{
                    height: 28, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    bgcolor: '#7c3aed18', color: '#7c3aed', '& .MuiChip-icon': { color: '#7c3aed' },
                    '&:hover': { bgcolor: '#7c3aed30' },
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* SCROLLABLE BODY — bento grid, vertical only. Takes the
          remaining flex space; outer overflow:hidden keeps the
          header + stats rows fixed at the top. */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', p: 2, minHeight: 0 }}>
        {isLoading && (
          <Box className="flex items-center justify-center" sx={{ height: '100%' }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {isError && (
          <Box sx={{ pt: 4 }}>
            <QueryError error={error} onRetry={refetch} label={t('pulse.label')} />
          </Box>
        )}
        {!isLoading && !isError && items.length === 0 && (
          (() => {
            // Three honest empty states, in priority order:
            //   1. Filter-empty — severity narrowed the feed to nothing.
            //      Muted; it's not an accomplishment, just a filter.
            //   2. Evidence-reporting/no-ranked-item — some dimensions ARE producing data
            //      (active_sources non-empty) but no row is open right now.
            //      This is the external-only-org case the P1-2 fix targets:
            //      we must NOT render a blank feed, and must NOT imply the
            //      silent dimensions are misconfigured.
            //   3. No-evidence-yet — no dimension produced anything AND we have no
            //      presence signal to be more specific. This is not "all clear".
            const isFiltered = severity !== 'all'
            const nothingToActOn = !isFiltered && hasPresenceData && activeSources.length > 0
            return (
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1.15fr 0.85fr' },
                gap: 2,
                maxWidth: 1080,
                mx: 'auto',
                py: { xs: 1, md: 2 },
              }}>
                <Paper elevation={0} sx={{ p: { xs: 2, md: 2.5 }, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 1.75,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'action.hover',
                      flexShrink: 0,
                    }}>
                      {isFiltered ? <Check size={20} /> : nothingToActOn ? <Radar size={20} /> : <Database size={20} />}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" fontWeight={800}>
                        {isFiltered
                          ? t('pulse.emptyFilteredTitle')
                          : nothingToActOn
                            ? t('pulse.emptyNothingTitle')
                            : t('pulse.emptyNoEvidenceTitle')}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 620 }}>
                        {isFiltered
                          ? t('pulse.emptyFilteredDesc')
                          : nothingToActOn
                            ? t('pulse.emptyNothingDesc')
                            : t('pulse.emptyNoEvidenceDesc')}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2.25 }}>
                    {isFiltered ? (
                      <Button size="small" variant="contained" onClick={() => setSeverity('all')}
                        sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                        {t('pulse.clearFilter')}
                      </Button>
                    ) : (
                      <>
                        <Button size="small" variant="contained" startIcon={<FileCode size={15} />}
                          disabled={!onNavigate} onClick={() => onNavigate?.('_repos')}
                          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                          {t('pulse.emptyOpenRepos')}
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<Settings2 size={15} />}
                          disabled={!onNavigate} onClick={() => onNavigate?.('_settings?mode=engineer&tab=data-sources')}
                          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                          {t('pulse.emptyOpenDataSources')}
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<Globe size={15} />}
                          disabled={!onNavigate} onClick={() => onNavigate?.('_domains?mode=engineer')}
                          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                          {t('pulse.emptyOpenDomains')}
                        </Button>
                      </>
                    )}
                  </Box>
                </Paper>

                <Paper elevation={0} sx={{ p: { xs: 2, md: 2.5 }, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <Typography variant="body2" fontWeight={800}>
                    {t('pulse.coverageTitle')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.45 }}>
                    {hasPresenceData
                      ? t('pulse.coverageDesc')
                      : t('pulse.coverageNoDataDesc')}
                  </Typography>
                  {!isFiltered && hasPresenceData ? (
                    <DimensionPresence active={activeSources} missing={missingSources} caps={caps} />
                  ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 2 }}>
                      {[
                        { icon: FileCode, label: t('pulse.rankCode') },
                        { icon: Globe, label: t('pulse.rankExternal') },
                        { icon: KeyRound, label: t('pulse.rankLeaks') },
                        { icon: Target, label: t('pulse.rankPentest') },
                      ].map(({ icon: Icon, label }) => (
                        <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, color: 'text.secondary' }}>
                          <Icon size={13} />
                          <Typography variant="caption" sx={{ minWidth: 0 }}>{label}</Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Paper>
              </Box>
            )
          })()
        )}
        {!isLoading && !isError && items.length > 0 && (
          <>
            {/* Bento Grid */}
            <GroupedPulseList
              items={items}
              newItemIds={newItemIds}
              onNavigate={onNavigate}
              onFindingClick={handleFindingClick}
            />
            {items.length >= pageSize && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Button
                  size="small"
                  onClick={() => setPageSize(s => s + 50)}
                  sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
                >
                  {t('pulse.loadMore')}
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>

      <UniversalFindingPanel fingerprint={selectedFp} onClose={() => setSelectedFp(null)}
        onNavigateRepo={onNavigate ? (repoId) => { setSelectedFp(null); onNavigate(`_repo:${repoId}`) } : undefined} />
    </Box>
  )
}

// visibleMissingSources — filter the engine's raw missing_sources[] down to
// the dimensions THIS org is actually entitled to. The backend reports every
// known source that produced zero rows regardless of subscription tier (one
// source of truth for "no findings from X"); entitlement is a display-time FE
// concern. A dimension the org isn't entitled to (e.g. `dast` on a code-only
// Snyk-style org) is not "Silent" — it's simply not part of this org's
// product, so we drop it rather than imply misconfiguration of an unbought
// surface. While caps are loading (or absent), fail closed and show no missing
// dimensions; otherwise a code-only or external-only org can briefly see
// unpurchased surfaces labelled "Silent" during hydration.
export function visibleMissingSources(missing: string[], caps?: CapabilityHelpers): string[] {
  if (!caps || !caps.ready) return []
  return missing.filter(source => {
    const pageId = sourceToPageId(source)
    // No page mapping ⇒ always in scope (e.g. CAASM divergence has no gated
    // page). With a mapping, defer to the server-authored visible_pages set.
    return pageId ? caps.canSeePage(pageId) : true
  })
}

// DimensionPresence — honest per-dimension status row (P1-2). Renders the
// engine's active_sources[] (≥1 finding this request) as solid neutral chips
// and missing_sources[] (zero rows this request) as quiet outlined chips.
//
// HONESTY: a missing dimension is NOT asserted to be misconfigured — it
// produced no rows this request, which covers both "configured & clean" and
// "not set up". The copy + tooltip deliberately say "no findings this scan",
// never "not configured". Entitlement-filtered (P1-FE mode-awareness): a
// dimension the org can't see at all (caps.canSeePage === false) is dropped
// entirely so a code-only / external-only org isn't told an unbought surface
// is "Silent". Colour is grounded: neutral text only, icon shape differentiates
// the dimension (per feedback_ui_grounded_palette). Dual-mode safe — uses
// semantic palette tokens, no hardcoded light/dark hexes.
function DimensionPresence({ active, missing, compact, caps }: {
  active: string[]; missing: string[]; compact?: boolean; caps?: CapabilityHelpers
}) {
  const visibleMissing = useMemo(() => visibleMissingSources(missing, caps), [missing, caps])
  const activeTip = t('pulse.dimActiveTip')
  const missingTip = t('pulse.dimSilentTip')

  const renderChip = (source: string, isActive: boolean) => {
    const Icon = dimensionIcon(source)
    return (
      <Chip
        key={`${isActive ? 'a' : 'm'}:${source}`}
        icon={<Icon size={12} />}
        label={dimensionLabel(source)}
        size="small"
        variant="outlined"
        title={isActive ? activeTip : missingTip}
        sx={{
          height: 22, fontWeight: 600, fontSize: 12,
          color: isActive ? 'text.primary' : 'text.disabled',
          borderColor: isActive ? 'divider' : 'transparent',
          bgcolor: isActive ? 'action.hover' : 'transparent',
          opacity: isActive ? 1 : 0.7,
          '& .MuiChip-icon': { color: isActive ? 'text.secondary' : 'text.disabled' },
        }}
      />
    )
  }

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: compact ? 1 : 1.5,
      flexWrap: 'wrap', ...(compact ? {} : { justifyContent: 'center', mt: 1 }),
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        {active.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('pulse.dimReporting')}
          </Typography>
        )}
        {active.map(s => renderChip(s, true))}
      </Box>
      {visibleMissing.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.7 }}>
            {t('pulse.dimSilent')}
          </Typography>
          {visibleMissing.map(s => renderChip(s, false))}
        </Box>
      )}
    </Box>
  )
}

function MiniStat({ icon: Icon, color, label, value }: {
  icon: typeof AlertTriangle; color?: string; label: string; value: number
}) {
  const active = value > 0
  // Neutral stat: no left accent stripe, count in standard text colour.
  // Coloured stat: severity-bearing only — left stripe + hue on the count.
  const isColoured = !!color && active
  return (
    <Paper elevation={0} sx={{
      p: 1, display: 'flex', alignItems: 'center', gap: 1,
      bgcolor: 'background.paper', border: 1, borderColor: 'divider',
      borderLeft: isColoured ? `3px solid ${color}` : '1px solid',
      borderLeftColor: isColoured ? color : 'divider',
      borderRadius: 1.5,
    }}>
      <Icon size={14} style={{
        color: isColoured ? color : 'currentColor',
        opacity: active ? (isColoured ? 0.9 : 0.65) : 0.3,
        flexShrink: 0,
      }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontSize: 15, fontWeight: 800, lineHeight: 1,
          color: isColoured ? color : (active ? 'text.primary' : 'text.secondary'),
        }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 12 }}>
          {label}
        </Typography>
      </Box>
    </Paper>
  )
}

// resolvePulseTarget picks where a pulse card should jump to when
// the user clicks it. Priority order is "most actionable first":
//
//   1. Open PR touching the file -> in-app PRDialog.
//   2. Pentest source -> pentest section.
//   3. Repo-anchored finding -> repo detail.
//   4. DAST without a linked repo -> external target URL.
//   5. Otherwise -> null (card stays inert).
type PulseTarget =
  | { kind: 'pr-dialog'; prs: PRRef[] }
  | { kind: 'section'; section: string }
  | { kind: 'href'; href: string }

function resolvePulseTarget(item: PulseItem): PulseTarget | null {
  const prs = (item.open_prs_touching ?? []).filter(Boolean)
  if (prs.length > 0) return { kind: 'pr-dialog', prs }
  if (item.source === 'pentest') return { kind: 'section', section: '_pentest' }
  if (item.source === 'mcp') return { kind: 'section', section: '_mcp' }
  if (item.repo_id) return { kind: 'section', section: `_repo:${item.repo_id}` }
  if (item.source === 'dast' && item.extra?.target_url) {
    return { kind: 'href', href: item.extra.target_url }
  }
  return null
}

// blastTone — colour band for the blast radius circle. Matches the
// "act now / review carefully / worth attention / backlog" levels.
function blastTone(blast: number): string {
  if (blast >= 80) return '#ef4444'
  if (blast >= 60) return '#f97316'
  if (blast >= 40) return '#eab308'
  return '#64748b'
}

/* ── Bento Card ─── */

interface BentoCardProps {
  item: PulseItem
  isHero?: boolean
  isNew?: boolean
  onNavigate?: (section: string) => void
  onFindingClick?: (fingerprint: string) => void
}

// whySignals — concrete cross-dim signal list for the hero card.
// Replaces the generic "Highest blast radius across all dimensions"
// sentence with the actual reasons this item ranks #1. Each signal
// reads as a single-line declaration ("KEV listed · CISA exploit
// catalogue") so the operator can see WHICH joins fired.
function whySignals(item: PulseItem): Array<{ icon: typeof AlertTriangle; label: string; tone: string }> {
  const out: Array<{ icon: typeof AlertTriangle; label: string; tone: string }> = []
  if (item.taint_adjacency) {
    out.push({ icon: Target, label: t('pulse.whyReachable'), tone: '#ef4444' })
  }
  const prs = item.open_prs_touching ?? []
  if (prs.length > 0) {
    const prList = prs.slice(0, 2).map(p => `#${p?.number}`).join(', ')
    const more = prs.length > 2 ? ` +${prs.length - 2}` : ''
    out.push({ icon: GitPullRequest, label: `${t('pulse.whyPR')}: ${prList}${more}`, tone: '#3b82f6' })
  }
  if (item.pentest_verdict) {
    out.push({ icon: ShieldAlert, label: t('pulse.whyPentest'), tone: '#f97316' })
  }
  if (item.autofix_eligible) {
    out.push({ icon: Wand2, label: t('pulse.whyAutofix'), tone: '#7c3aed' })
  }
  // External-source signals — KEV / threat-actor / crown-jewel come
  // from extra fields that the engine populates for dast / pentest
  // items. Defensive about extra being undefined (e.g. pure code
  // alerts without these enrichments).
  const extra = item.extra ?? {}
  if (extra.kev_listed === 'true' || extra.kev === 'true') {
    out.push({ icon: Skull, label: t('pulse.whyKEV'), tone: '#dc2626' })
  }
  if (extra.threat_actor) {
    out.push({ icon: AlertTriangle, label: `${t('pulse.whyActor')}: ${extra.threat_actor}`, tone: '#dc2626' })
  }
  if (extra.asset_tier === 'crown_jewel') {
    out.push({ icon: Crown, label: t('pulse.whyCrown'), tone: '#f97316' })
  }
  if (item.extra?.cve_id && out.length === 0) {
    // Fallback when no cross-dim signal fired but it's still a
    // known CVE — at least name it so the operator isn't reading
    // an unattributed title.
    out.push({ icon: AlertTriangle, label: `CVE: ${item.extra.cve_id}`, tone: '#f97316' })
  }
  return out
}

function BentoCard({ item, isHero, isNew }: BentoCardProps) {
  const sevColor = severityColor(item.severity)
  const meta = SOURCE_META[item.source] ?? { ...NEUTRAL_SOURCE_META, fallback: item.source }
  const SourceIcon = meta.icon
  const blast = item.blast_radius ?? 0
  const blastColor = blastTone(blast)
  const [prDialogOpen, setPrDialogOpen] = useState(false)
  const fixQueue = useFixQueue()

  const meta_label = item.file_path
    ? `${item.file_path}${item.line_number ? `:${item.line_number}` : ''}`
    : (item.extra?.target_url ?? item.extra?.image_ref ?? item.extra?.package_name ?? '')

  const repoName = item.extra?.repo_name ?? item.repo_id ?? ''

  const target = resolvePulseTarget(item)
  const openPRs = item.open_prs_touching ?? []

  const handleCardClick = () => {
    // Unified action: every card click opens the Fix Queue
    // drawer scrolled to this finding. Operator's mental model
    // becomes "click a card = act on it" — matching the dashboard
    // Pulse Top 5 + Asset City building flows, instead of three
    // different navigation behaviours per source.
    fixQueue.open({ filter: 'all', initialItemId: item.id })
  }

  const handleSegmentClick = (kind: 'pr' | 'taint' | 'autofix' | 'pentest') => {
    // PR pills still open the in-app PR dialog because that's the
    // tightest workflow ("show me the PRs touching this file" → 1
    // click → list). Other segments funnel into the Fix Queue at
    // this finding so the operator never bounces away from the
    // card to figure out the next action.
    if (kind === 'pr') { setPrDialogOpen(true); return }
    fixQueue.open({ filter: 'all', initialItemId: item.id })
  }

  const isClickable = target !== null || !!item.fingerprint

  return (
    <>
      <Paper
        elevation={0}
        onClick={isClickable ? handleCardClick : undefined}
        sx={{
          p: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          cursor: isClickable ? 'pointer' : 'default',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          borderLeft: isHero ? `4px solid ${blastColor}` : `1px solid`,
          borderLeftColor: isHero ? blastColor : 'divider',
          bgcolor: 'background.paper',
          transition: 'box-shadow 0.2s, border-color 0.2s',
          '&:hover': isClickable ? {
            elevation: 4,
            boxShadow: 3,
            borderColor: blastColor,
          } : {},
        }}
      >
        {/* Top: blast number + chips + NEW badge */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
          <Typography
            title={t('pulse.blastRadiusScore').replace('{blast}', String(blast))}
            sx={{
              fontSize: isHero ? 32 : 24,
              fontWeight: 900,
              lineHeight: 1,
              color: blastColor,
              flexShrink: 0,
            }}
          >
            {blast}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            <Chip
              label={(item.severity ?? '').toUpperCase() || '--'}
              size="small"
              sx={{ bgcolor: sevColor + '22', color: sevColor, fontWeight: 700, fontSize: 13, height: 20 }}
            />
            <Chip
              icon={<SourceIcon size={10} />}
              label={tOr(meta.labelKey, meta.fallback)}
              size="small"
              variant="outlined"
              sx={{
                fontWeight: 600, fontSize: 13, height: 20,
                color: 'text.secondary', borderColor: 'divider',
                '& .MuiChip-icon': { color: 'text.secondary' },
              }}
            />
            {isNew && (
              <Chip
                icon={<Sparkles size={10} />}
                label="NEW"
                size="small"
                sx={{
                  fontWeight: 700, fontSize: 13, height: 20,
                  bgcolor: '#7c3aed',
                  color: '#fff',
                  '& .MuiChip-icon': { color: '#fff' },
                }}
              />
            )}
          </Box>
        </Box>

        {/* Title */}
        <Typography
          variant="body2"
          color="text.primary"
          sx={{
            fontWeight: 600,
            mb: 0.5,
            ...(isHero ? {} : {
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }),
          }}
        >
          {item.title}
        </Typography>

        {/* Hero: full description + concrete "why ranked #1" signal list */}
        {isHero && item.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, lineHeight: 1.6, fontSize: 13 }}>
            {item.description}
          </Typography>
        )}
        {isHero && (() => {
          const signals = whySignals(item)
          if (signals.length === 0) {
            // No cross-dim signal fired — fall back to the previous
            // generic sentence so the hero card never feels empty.
            return (
              <Typography variant="caption" sx={{ color: blastColor, fontWeight: 700, mb: 1, fontStyle: 'italic' }}>
                {t('pulse.whyFirst')}
              </Typography>
            )
          }
          return (
            <Box sx={{
              mb: 1.5, py: 1.25, px: 1.5, borderRadius: 1,
              bgcolor: `${blastColor}0d`,
              border: '1px solid', borderColor: `${blastColor}40`,
              display: 'flex', flexDirection: 'column', gap: 0.75,
            }}>
              <Typography variant="caption" sx={{ color: blastColor, fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('pulse.whyRanked')}
              </Typography>
              {signals.map((sig, i) => {
                const Icon = sig.icon
                return (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ color: sig.tone, display: 'flex' }}>
                      <Icon size={13} />
                    </Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
                      {sig.label}
                    </Typography>
                  </Box>
                )
              })}
              {/* Primary CTA — opens the right-side fix queue
                  scrolled to this item. The drawer surfaces the
                  recommended action (AutoFix preview / PR review /
                  finding details) and lets the operator advance
                  through the queue without leaving the page. */}
              {/* color="inherit" + disableElevation kills the MUI
                  primary-palette purple that bleeds through as a
                  shadow and active-state tint on a custom-coloured
                  contained Button. We then paint bg + text colour
                  explicitly via sx so the button reads as the
                  blast-tone CTA we actually want. */}
              <Button
                fullWidth
                variant="contained"
                color="inherit"
                disableElevation
                size="small"
                startIcon={<Sparkles size={14} />}
                onClick={(e) => {
                  e.stopPropagation()
                  fixQueue.open({ filter: 'all', initialItemId: item.id })
                }}
                sx={{
                  textTransform: 'none', fontWeight: 700, mt: 1,
                  bgcolor: blastColor,
                  color: '#fff',
                  boxShadow: 'none',
                  '&:hover': { bgcolor: blastColor, filter: 'brightness(0.92)', boxShadow: 'none' },
                  '&:active': { bgcolor: blastColor, boxShadow: 'none' },
                  '&:focus': { bgcolor: blastColor, boxShadow: 'none' },
                  '&.Mui-focusVisible': { bgcolor: blastColor, boxShadow: `0 0 0 3px ${blastColor}33` },
                }}
              >
                {t('pulse.walkMeThrough')}
              </Button>
            </Box>
          )
        })()}

        {/* File path */}
        {meta_label && (
          <Typography
            component="code"
            variant="body2"
            color="text.secondary"
            title={meta_label}
            noWrap
            sx={{ display: 'block', fontSize: 12, fontFamily: 'monospace', mb: 0.5 }}
          >
            {meta_label}
          </Typography>
        )}

        {/* Context strip */}
        <Box onClick={(e) => e.stopPropagation()} sx={{ mb: 'auto' }}>
          <ContextStrip
            signals={{
              open_prs_touching: item.open_prs_touching ?? [],
              taint_adjacency:   item.taint_adjacency,
              autofix_eligible:  item.autofix_eligible,
              pentest_verdict:   item.pentest_verdict,
              blast_radius:      undefined,
              last_seen:         item.created_at,
            }}
            onSegmentClick={handleSegmentClick}
          />
        </Box>

        {/* Repo name at bottom */}
        {repoName && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ mt: 1, fontSize: 13, opacity: 0.7 }}>
            {repoName}
          </Typography>
        )}
      </Paper>
      {prDialogOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <PRDialog
            prs={openPRs}
            contextLabel={item.title}
            onClose={() => setPrDialogOpen(false)}
          />
        </div>
      )}
    </>
  )
}

/* ── Grouped list with collapsible duplicates, now rendered as Bento Grid ─── */

interface DisplayRow {
  kind: 'single'
  item: PulseItem
}
interface DisplayGroup {
  kind: 'group'
  label: string
  sublabel: string
  severity: string
  blast: number
  children: PulseItem[]
}
type DisplayEntry = DisplayRow | DisplayGroup

function buildDisplayEntries(items: PulseItem[]): DisplayEntry[] {
  // 1. Group container items by image_ref
  const containerByImage: Record<string, PulseItem[]> = {}
  const nonContainer: PulseItem[] = []
  for (const item of items) {
    if (item.source === 'container' && item.extra?.image_ref) {
      const key = item.extra.image_ref
      if (!containerByImage[key]) containerByImage[key] = []
      containerByImage[key].push(item)
    } else {
      nonContainer.push(item)
    }
  }

  // 2. Group same CVE across repos (non-container alert items with same cve_id)
  const cveGroups: Record<string, PulseItem[]> = {}
  const singles: PulseItem[] = []
  for (const item of nonContainer) {
    const cveId = item.extra?.cve_id
    if (cveId && item.source === 'alert' && item.category === 'dependencies') {
      if (!cveGroups[cveId]) cveGroups[cveId] = []
      cveGroups[cveId].push(item)
    } else {
      singles.push(item)
    }
  }

  const entries: DisplayEntry[] = []

  for (const item of singles) {
    entries.push({ kind: 'single', item })
  }

  for (const [cveId, group] of Object.entries(cveGroups)) {
    if (group.length === 1) {
      entries.push({ kind: 'single', item: group[0] })
    } else {
      const first = group[0]
      entries.push({
        kind: 'group',
        label: `${first.extra?.package ?? cveId} — ${first.title}`,
        sublabel: `${group.length} repos affected`,
        severity: first.severity,
        blast: Math.max(...group.map(g => g.blast_radius ?? 0)),
        children: group,
      })
    }
  }

  for (const [imageRef, group] of Object.entries(containerByImage)) {
    entries.push({
      kind: 'group',
      label: `${imageRef}`,
      sublabel: `${group.length} vulnerabilities in base image`,
      severity: group.some(g => (g.severity ?? '').toLowerCase() === 'critical') ? 'critical' : 'high',
      blast: Math.max(...group.map(g => g.blast_radius ?? 0)),
      children: group,
    })
  }

  // Sort by blast desc
  entries.sort((a, b) => {
    const ba = a.kind === 'single' ? (a.item.blast_radius ?? 0) : a.blast
    const bb = b.kind === 'single' ? (b.item.blast_radius ?? 0) : b.blast
    return bb - ba
  })

  return entries
}

function GroupedPulseList({ items, newItemIds, onNavigate, onFindingClick }: {
  items: PulseItem[]
  newItemIds?: Set<string>
  onNavigate?: (section: string) => void
  onFindingClick?: (fp: string) => void
}) {
  const entries = useMemo(() => buildDisplayEntries(items), [items])

  if (entries.length === 0) return null

  // Separate hero (first entry), secondary (entries 1-2), and rest (3+)
  const heroEntry = entries[0]
  const secondaryEntries = entries.slice(1, 3)
  const restEntries = entries.slice(3)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gridAutoRows: 'minmax(140px, auto)',
        gap: 2,
        minWidth: 0,
      }}>
        <Box sx={{ gridColumn: 'span 2', gridRow: 'span 2', minWidth: 0 }}>
          {heroEntry.kind === 'single' ? (
            <BentoCard item={heroEntry.item} isHero isNew={newItemIds?.has(heroEntry.item.id)} onNavigate={onNavigate} onFindingClick={onFindingClick} />
          ) : (
            <CollapsibleGroup group={heroEntry} index={0} isHero onNavigate={onNavigate} onFindingClick={onFindingClick} />
          )}
        </Box>

        {secondaryEntries.map((entry, i) => (
          <Box key={entry.kind === 'single' ? entry.item.id : entry.label} sx={{ gridColumn: 'span 1', gridRow: 'span 1', minWidth: 0 }}>
            {entry.kind === 'single' ? (
              <BentoCard item={entry.item} isNew={newItemIds?.has(entry.item.id)} onNavigate={onNavigate} onFindingClick={onFindingClick} />
            ) : (
              <CollapsibleGroup group={entry} index={i + 1} onNavigate={onNavigate} onFindingClick={onFindingClick} />
            )}
          </Box>
        ))}
      </Box>

      {restEntries.length > 0 && (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 2,
          minWidth: 0,
        }}>
          {restEntries.map((entry, i) => (
            <Box key={entry.kind === 'single' ? entry.item.id : entry.label} sx={{ minWidth: 0 }}>
              {entry.kind === 'single' ? (
                <BentoCard item={entry.item} isNew={newItemIds?.has(entry.item.id)} onNavigate={onNavigate} onFindingClick={onFindingClick} />
              ) : (
                <CollapsibleGroup group={entry} index={i + 3} onNavigate={onNavigate} onFindingClick={onFindingClick} />
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function CollapsibleGroup({ group, index: _, isHero, onNavigate, onFindingClick }: {
  group: DisplayGroup; index: number; isHero?: boolean
  onNavigate?: (section: string) => void
  onFindingClick?: (fp: string) => void
}) {
  const [open, setOpen] = useState(false)
  const blastColor = blastTone(group.blast)
  const sevColor = severityColor(group.severity)
  const meta = SOURCE_META[group.children[0]?.source] ?? { ...NEUTRAL_SOURCE_META, fallback: group.children[0]?.source ?? '' }
  const SourceIcon = meta.icon

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        borderLeft: isHero ? `4px solid ${blastColor}` : `1px solid`,
        borderLeftColor: isHero ? blastColor : 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': {
          boxShadow: 3,
          borderColor: blastColor,
        },
      }}
    >
      <Box
        onClick={() => setOpen(!open)}
        sx={{ p: 2, cursor: 'pointer', display: 'flex', flexDirection: 'column', flex: open ? undefined : 1 }}
      >
        {/* Top: blast + chips */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
          <Typography sx={{
            fontSize: isHero ? 32 : 24,
            fontWeight: 900,
            lineHeight: 1,
            color: blastColor,
            flexShrink: 0,
          }}>
            {group.blast}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            <Chip
              label={(group.severity ?? '').toUpperCase()}
              size="small"
              sx={{ bgcolor: sevColor + '22', color: sevColor, fontWeight: 700, fontSize: 13, height: 20 }}
            />
            <Chip
              icon={<SourceIcon size={10} />}
              label={meta.fallback}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: 13, height: 20, color: 'text.secondary', borderColor: 'divider', '& .MuiChip-icon': { color: 'text.secondary' } }}
            />
            <Chip
              label={`${group.children.length} items`}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: 13, height: 20 }}
            />
          </Box>
          <Box sx={{ ml: 'auto', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', color: 'text.secondary' }}>
            <ChevronDown size={16} />
          </Box>
        </Box>

        <Typography variant="body2" color="text.primary" noWrap={!isHero} sx={{ fontWeight: 600, mb: 0.5 }}>
          {group.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {group.sublabel}
        </Typography>

        {isHero && (
          <Typography variant="caption" sx={{ color: blastColor, fontWeight: 700, mt: 1, fontStyle: 'italic' }}>
            {t('pulse.whyFirst')}
          </Typography>
        )}
      </Box>

      <Collapse in={open}>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <List disablePadding>
            {group.children.map((item) => (
              <Box key={item.id} sx={{ mb: 1 }}>
                <BentoCard item={item} onNavigate={onNavigate} onFindingClick={onFindingClick} />
              </Box>
            ))}
          </List>
        </Box>
      </Collapse>
    </Paper>
  )
}
