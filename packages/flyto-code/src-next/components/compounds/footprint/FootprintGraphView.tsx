/**
 * FootprintGraphView — 3D visualisation of the org's Footprint Graph.
 *
 * Backend lives in `flyto-engine/internal/footprint/`. This view
 * renders the entities + relationships returned by
 * `GET /orgs/{id}/footprint/graph`, layered by `depth` (seed at the
 * origin, depth=1 on the first shell, ...). Per-entity glow comes
 * from the timeseries signals (`newly_exposed` / `recently_changed`
 * / `stale`). Selecting an entity triggers a lazy fetch of its
 * path score (`/footprint/path/{entityId}`) which then renders in
 * the side panel.
 *
 * Architectural note: we deliberately do NOT add react-force-graph-3d
 * here. The project already ships @react-three/fiber + drei + three,
 * and a deterministic layered layout is enough for the v1 use case
 * (operator looking for "did the expander reach the right places").
 * Add force layout in Phase 2 only if the operator feedback says the
 * shell layout hides relationships.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Stack, Typography, Chip, IconButton, Tooltip, LinearProgress, Paper, Button, Divider, Alert, ToggleButtonGroup, ToggleButton, useTheme } from '@mui/material'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useNavigate } from 'react-router'

// 3D scene module — extracted Phase 5. Scene / NodeMesh / EdgeLine
// + palettes + layout math now live in ./scene/*. Re-import only
// what the orchestrator still uses (most of TIER_PALETTE /
// SIGNAL_GLOW use was internal to NodeMesh + Scene).
import {
  Scene,
  DARK_PALETTE,
  LIGHT_PALETTE,
} from './scene'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, Boxes, Cpu, FileText, List as ListIcon, Loader2, Play, RefreshCw, SlidersHorizontal } from 'lucide-react'

import { RuleTuningModal } from './RuleTuningModal'
import { RunDialog } from './RunDialog'
import { ResearchFootprintDrawer } from './ResearchFootprintDrawer'
import { SelectedDetail } from './SelectedDetail'
import { FootprintListView } from './FootprintListView'
import { TimelineScrubber, RunProgressCard } from './TimelinePanels'
import { ReconBriefView } from './ReconBriefView'
import {
  ACTIONABILITY_VISUAL, ACTIONABILITY_BADGE,
  actionabilityKey, tierLabel, MAX_ROUNDS,
} from './shared'
import { listFindingsOverlay, type DomainFindingSummary } from '@lib/engine'
import {
  invalidateFootprintClosure,
  invalidateFootprintProgress,
} from '@lib/footprintLoop'
import { isFootprintRunActive } from '@lib/footprintRunState'
import { qk } from '@lib/queryKeys'
import {
  getFootprintActionable,
  getFootprintGraph,
  getFootprintLatestRun,
  getFootprintNarrative,
  getFootprintTimeseries,
  runFootprintExpansion,
  runPlatformPipeline,
  getFootprintDelta,
  getPostureDistribution,  type PlatformPipelineResponse,
  type ActionabilityTier,
  type FootprintEntity,
  type FootprintRunRow,
  type FootprintSignalKind,
  type FootprintTimeseriesSignal,
} from '@lib/engine/code/footprintGraph'
import {
  getBOYAttackPathCandidates,
  getBOYBreakthroughPaths,
  type ResearchFootprintSelector,
} from '@lib/engine/code/footprintSurface'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { useDiscoveryStatus, useDiscoverySeed } from '@hooks/useDiscoveryStatus'
import { GatedButton } from '@atoms/GatedButton'
import { DataBoundary } from '@atoms/DataBoundary'
import { t } from '@lib/i18n';
import { footprintText } from '@/styles/footprintVisual'

type GraphScope = 'focused' | 'expanded' | 'all'

const GRAPH_SCOPE_DEPTHS: Record<GraphScope, number[]> = {
  focused: [0, 1, 2],
  expanded: [0, 1, 2, 3],
  all: [0, 1, 2, 3, 4],
}

interface FootprintGraphViewProps {
  orgId: string
}


// ─── Side panel ───────────────────────────────────────────────────


// SignalSummary kept for legacy / fallback paths; the side panel
// now uses ActionabilityStatsPanel (richer). Marked _exported for

// isInconclusiveDocument is exported by ./scene now — re-imported above.

// ActionabilityStatsPanel — the side-panel summary card that pairs
// raw collection metrics (entities / relationships / signals) with
// the decision-oriented counts (red-team-actionable / needs-more /
// informational / rejected). Mirrors the mockup's "統計摘要"
// card; click a row to filter the list to that tier — currently
// just a visual surface (filter integration is on the table side
// already via the bucket cards).
interface ActionabilityStatsPanelProps {
  entities: FootprintEntity[]
  totalRelationships: number
  signals: FootprintTimeseriesSignal[]
}

// TopAttackPathsPanel — slim CTA card that defers the actual
// attack-path hypotheses to the standalone /attack-paths view.
//
// Operator 2026-05-23 architectural call: footprint = "what we have"
// (full inventory), attack-paths = "how would an attacker get in"
// (top 5 hypotheses). The old inline TopAttackPathsPanel was a
// pre-kernel shortcut — Footprint cherry-picked actionable entities
// and showed them as paths because there was no shared kernel feed.
// Now /attack-paths page is the single source for the attacker
// perspective; Footprint drops back to a single "→ View attack
// paths" link plus the actionable count so the operator sees the
// summary without two pages displaying the same data.
interface TopAttackPathsPanelProps {
  orgId: string
  selectedId: string | null
  onSelect: (id: string) => void
  refreshKey: number
}

export function TopAttackPathsPanel({ orgId, refreshKey }: TopAttackPathsPanelProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: qk.footprint.actionable(orgId, 'red_team_actionable', refreshKey),
    queryFn: () => getFootprintActionable(orgId, 'red_team_actionable', 5),
    staleTime: 30_000,
  })
  const count = data?.findings.length ?? 0
  const go = () => navigate(`/projects/${orgId}/attack-paths`)
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={footprintText.panelTitle}>
            {t('footprint.panel.topPaths')}
          </Typography>
          <Typography sx={{ ...footprintText.panelSubtitle, mt: 0.25 }}>
            {isLoading
              ? t('footprint.panel.topPaths.loading')
              : count > 0
                ? t('footprint.panel.topPaths.summary')
                    .replace('{n}', String(count))
                : t('footprint.panel.topPaths.empty')}
          </Typography>
        </Box>
        <Button
          variant={count > 0 ? 'contained' : 'outlined'}
          size="small"
          onClick={go}
          sx={{ ...footprintText.panelButton, whiteSpace: 'nowrap' }}
        >
          {t('footprint.panel.topPaths.viewFull')}
        </Button>
      </Stack>
    </Paper>
  )
}

function BreakthroughSummaryPanel({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.footprint.breakthroughCandidates(orgId, 20),
    queryFn: () => getBOYAttackPathCandidates(orgId, 20),
    staleTime: 30_000,
  })
  const pathsQ = useQuery({
    queryKey: qk.footprint.breakthroughPaths(orgId, 20),
    queryFn: () => getBOYBreakthroughPaths(orgId, 20),
    staleTime: 30_000,
  })
  const candidates = data?.candidates ?? []
  const paths = pathsQ.data?.paths ?? []
  const topPath = paths[0]
  const top = topPath ?? candidates[0]
  const needsValidation = (paths.length > 0 ? paths : candidates).filter(c => c.state === 'needs_validation').length
  const validated = (paths.length > 0 ? paths : candidates).filter(c => c.state === 'validated').length
  const missingEvidence = paths.reduce((sum, p) => sum + (p.missing_evidence ?? 0), 0)
  if ((isLoading || pathsQ.isLoading) && candidates.length === 0 && paths.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Activity size={16} />
            <Typography sx={footprintText.panelTitle}>
              {t('footprint.panel.breakthroughs')}
            </Typography>
          </Stack>
          <LinearProgress />
          <Typography sx={footprintText.smallMuted}>
            {t('footprint.panel.breakthroughs.loading')}
          </Typography>
        </Stack>
      </Paper>
    )
  }
  if (!top) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Activity size={16} />
          <Typography sx={footprintText.panelTitle}>
            {t('footprint.panel.breakthroughs')}
          </Typography>
        </Stack>
        <Typography sx={footprintText.smallMuted}>
          {t('footprint.panel.breakthroughs.empty')}
        </Typography>
      </Paper>
    )
  }
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Activity size={16} />
        <Typography sx={footprintText.panelTitle}>
          {t('footprint.panel.breakthroughs')}
        </Typography>
        <Chip size="small" label={paths.length || candidates.length} />
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Chip size="small" color="warning" variant="outlined" label={`${needsValidation} ${t('footprint.state.needsValidation')}`} />
        <Chip size="small" color="success" variant="outlined" label={`${validated} ${t('footprint.state.validated')}`} />
        {paths.length > 0 && <Chip size="small" color="info" variant="outlined" label={`${missingEvidence} missing evidence`} />}
      </Stack>
      {top && (
        <Box>
          <Typography sx={{ ...footprintText.panelButton, overflowWrap: 'anywhere' }}>
            {top.subject_value}
          </Typography>
          <Typography sx={footprintText.smallMuted}>
            {top.kind.replace(/_/g, ' ')} · {top.priority_score}/100 · {top.recommended_verifier.replace(/_/g, ' ')}
          </Typography>
        </Box>
      )}
    </Paper>
  )
}


function ActionabilityStatsPanel({ entities, totalRelationships, signals }: ActionabilityStatsPanelProps) {
  const aBuckets = useMemo(() => {
    const out: Record<ActionabilityTier | 'none', number> = {
      red_team_actionable: 0, needs_more_evidence: 0, informational: 0, rejected: 0, none: 0,
    }
    for (const e of entities) {
      out[actionabilityKey(e)]++
    }
    return out
  }, [entities])
  const signalCount = signals.length
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ ...footprintText.metricValue, lineHeight: 1.1 }}>{entities.length}</Typography>
          <Typography sx={footprintText.panelSubtitle}>{t('footprint.field.entities')}</Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ ...footprintText.metricValue, lineHeight: 1.1 }}>{totalRelationships}</Typography>
          <Typography sx={footprintText.panelSubtitle}>{t('footprint.field.edges')}</Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ ...footprintText.metricValue, lineHeight: 1.1 }}>{signalCount}</Typography>
          <Typography sx={footprintText.panelSubtitle}>{t('footprint.field.signals')}</Typography>
        </Box>
      </Stack>
      <Divider sx={{ mb: 1.25 }} />
      <Stack spacing={0.75}>
        {(['red_team_actionable', 'needs_more_evidence', 'informational', 'rejected'] as const).map(tier => {
          const row = { tier, label: tierLabel(tier) }
          const cfg = ACTIONABILITY_BADGE[row.tier]
          const n = aBuckets[row.tier]
          return (
            <Stack key={row.tier} direction="row" alignItems="center" spacing={1.25}>
              <Box sx={{
                width: 22, textAlign: 'center',
                ...footprintText.panelButton,
                color: cfg.ring,
              }}>
                {n}
              </Box>
              <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: 'action.hover', overflow: 'hidden' }}>
                <Box sx={{
                  width: `${entities.length > 0 ? (n / entities.length) * 100 : 0}%`,
                  height: '100%',
                  bgcolor: cfg.ring,
                  transition: 'width 240ms ease',
                }} />
              </Box>
              <Typography sx={{ ...footprintText.panelButton, minWidth: 130, textAlign: 'right' }}>
                {row.label}
              </Typography>
            </Stack>
          )
        })}
      </Stack>
    </Paper>
  )
}

// ─── Narrative Panel ──────────────────────────────────────────────
// PostureDistributionPanel — surfaces BOTH healthy and at-risk
// posture in a horizontal stacked bar. User's complaint:
// 「資安不能都只有壞的也有好的」.
//
// Visualisation is intentionally NOT a 4x4 criticality × severity
// grid — that's Bitsight's patented shape. We use Flyto's own
// tier taxonomy (healthy / watching / acting) and a single
// horizontal bar.
function PostureDistributionPanel({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.footprint.postureDistribution(orgId),
    queryFn: () => getPostureDistribution(orgId),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })
  if (isLoading || !data || data.total === 0) {
    return null
  }
  const healthy = data.buckets.find(b => b.bucket === 'healthy')?.count ?? 0
  const watching = data.buckets.find(b => b.bucket === 'watching')?.count ?? 0
  const acting = data.buckets.find(b => b.bucket === 'acting')?.count ?? 0
  const total = healthy + watching + acting || 1
  const pctHealthy = (healthy / total) * 100
  const pctWatching = (watching / total) * 100
  const pctActing = (acting / total) * 100
  return (
    <Paper sx={{ p: 1.75, borderRadius: 2 }} elevation={0}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
        <Typography sx={{ ...footprintText.smallMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t('footprint.posture.title')}
        </Typography>
        <Box sx={{ ml: 'auto' }}>
          <Typography component="span" sx={{ ...footprintText.metricValueSmall, color: 'success.main' }}>
            {data.health_ratio}%
          </Typography>
          <Typography component="span" sx={{ ...footprintText.smallMuted, ml: 0.5 }}>
            {t('footprint.posture.healthy')}
          </Typography>
        </Box>
      </Stack>
      {/* Single horizontal stacked bar — distinct shape from any
          4x4 grid. Colour semantics: green = healthy, amber =
          watching, red = acting. */}
      <Box sx={{
        display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden',
        bgcolor: 'action.hover', mb: 1,
      }}>
        {healthy > 0 && <Box sx={{ width: `${pctHealthy}%`, bgcolor: 'success.main' }} />}
        {watching > 0 && <Box sx={{ width: `${pctWatching}%`, bgcolor: 'warning.main' }} />}
        {acting > 0 && <Box sx={{ width: `${pctActing}%`, bgcolor: 'error.main' }} />}
      </Box>
      <Stack direction="row" spacing={1.5}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
          <Typography sx={footprintText.smallMuted}>
            {t('footprint.posture.healthy')}
          </Typography>
          <Typography sx={footprintText.smallStrong}>{healthy}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main' }} />
          <Typography sx={footprintText.smallMuted}>
            {t('footprint.posture.watching')}
          </Typography>
          <Typography sx={footprintText.smallStrong}>{watching}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main' }} />
          <Typography sx={footprintText.smallMuted}>
            {t('footprint.posture.acting')}
          </Typography>
          <Typography sx={footprintText.smallStrong}>{acting}</Typography>
        </Stack>
      </Stack>
    </Paper>
  )
}

// PlatformPipelinePanel — single-click trigger for the 3-phase
// orchestrator (Phase 1 discovery → Phase 2 Footprint → Phase 3
// pentest suggestions). The panel surfaces the cross-phase
// data flow that the user articulated as 環環相扣.
//
// Coupling discipline: this component ONLY hits the platform-
// pipeline endpoint. It doesn't know about phase internals;
// the engine sequences + emits SSE events; useOrgEvents picks
// those up + invalidates queries on its own.
function PlatformPipelinePanel({ orgId }: { orgId: string }) {
  const [lastResult, setLastResult] = useState<PlatformPipelineResponse | null>(null)
  // Phase 1 of the pipeline IS discovery, so an in-flight discovery means
  // the pipeline (or an equivalent scan) is already running — guard on the
  // shared server-reported state, not just the ~200ms HTTP window, so two
  // tabs / a refresh can't double-fire it.
  const { scanningCount } = useDiscoveryStatus()
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => runPlatformPipeline(orgId),
    onSuccess: (data) => {
      setLastResult(data)
      invalidateFootprintClosure(qc, orgId)
    },
    onError: (err) => { if (import.meta.env.DEV) console.error('pipeline run failed:', err) },
  })
  const busy = mut.isPending || scanningCount > 0
  return (
    <Paper sx={{ p: 1.75, borderRadius: 2 }} elevation={0}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{
          width: 28, height: 28, borderRadius: 1,
          bgcolor: 'primary.main', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Play size={14} />
        </Box>
        <Typography sx={footprintText.panelTitle}>
          {t('footprint.pipeline.title')}
        </Typography>
      </Stack>
      <Typography sx={{ ...footprintText.smallMuted, mb: 1.25, lineHeight: 1.45 }}>
        {t('footprint.pipeline.subtitle')}
      </Typography>
      <GatedButton
        action="scan:trigger"
        size="small" variant="contained" fullWidth
        startIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        disabled={busy}
        onClick={() => mut.mutate()}
        title={!mut.isPending && scanningCount > 0
          ? t('footprint.pipeline.alreadyRunning')
          : undefined}
        sx={footprintText.panelButton}
      >
        {busy
          ? t('footprint.pipeline.running')
          : t('footprint.pipeline.run')}
      </GatedButton>
      {lastResult && (
        <Stack spacing={0.5} sx={{ mt: 1.25 }}>
          {lastResult.phases.map(p => (
            <Box key={p.phase} sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              ...footprintText.smallMuted,
            }}>
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%',
                bgcolor: p.status === 'error' ? 'error.main'
                       : p.status === 'skipped' ? 'text.disabled'
                       : 'success.main',
              }} />
              <Typography sx={footprintText.smallStrong}>
                {p.phase.replace('phase', 'Phase ').replace('.', ' · ')}
              </Typography>
              <Typography sx={{ ...footprintText.smallMuted, ml: 'auto' }}>
                {p.status}{p.count ? ` (${p.count})` : ''}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  )
}

// FootprintDeltaPanel — concrete answer to "Phase 2 補了 Phase 1
// 漏掉的什麼". Shows phase1_count / phase2_count headline; on
// expand reveals the actual added rows. Read-only; data comes
// from /footprint/delta which compares attack_surface metadata.
function FootprintDeltaPanel({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.footprint.delta(orgId),
    queryFn: () => getFootprintDelta(orgId),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })
  if (isLoading || !data) {
    return null
  }
  const { phase1_count, phase2_count } = data.summary
  if (phase1_count === 0 && phase2_count === 0) {
    return null
  }
  return (
    <Paper sx={{ p: 1.75, borderRadius: 2 }} elevation={0}>
      <Typography sx={{ ...footprintText.smallMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
        {t('footprint.delta.title')}
      </Typography>
      <Stack direction="row" spacing={2} alignItems="baseline">
        <Box>
          <Typography sx={{ ...footprintText.metricValue, color: 'success.main', lineHeight: 1 }}>
            +{phase2_count}
          </Typography>
          <Typography sx={footprintText.smallMuted}>
            {t('footprint.delta.added')}
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto', textAlign: 'right' }}>
          <Typography sx={{ ...footprintText.metricValueSmall, color: 'text.secondary' }}>
            {phase1_count}
          </Typography>
          <Typography sx={footprintText.smallMuted}>
            {t('footprint.delta.phase1')}
          </Typography>
        </Box>
      </Stack>
      {data.phase2_added.length > 0 && (
        <Box sx={{ mt: 1.25, pt: 1.25, borderTop: 1, borderColor: 'divider' }}>
          <Stack spacing={0.5}>
            {data.phase2_added.slice(0, 5).map((row, i) => (
              <Typography key={i} sx={{ ...footprintText.mono, color: 'text.primary' }}>
                <span style={{ opacity: 0.6 }}>{row.asset_type} ·</span> {row.value}
              </Typography>
            ))}
            {data.phase2_added.length > 5 && (
              <Typography sx={footprintText.smallMuted}>
                {t('footprint.delta.more').replace('{n}', String(data.phase2_added.length - 5))}
              </Typography>
            )}
          </Stack>
        </Box>
      )}
    </Paper>
  )
}

// LLM-generated attacker-perspective summary. Sits at the TOP of
// the side panel because operators / sales / customers reading the
// page should see prose first, not bullets. Cache TTL is 30 min on
// the backend; force-refresh button bypasses.
interface NarrativePanelProps {
  orgId: string
  entityCount: number
  refreshKey: number
}

// MarkdownNarrative — minimal inline markdown renderer for the
// LLM narrative output. The LLM emits plain prose with the
// occasional **bold**, numbered/bulleted list, and double-newline
// paragraph breaks. We don't pull in react-markdown (+remark
// transitive deps) for this; a 40-line regex pass covers the
// 4 things the prompt actually produces:
//   - paragraph splits on \n\n
//   - "1. ..." / "2. ..." numbered list rows
//   - "- ..." / "* ..." bullet list rows
//   - **bold** spans
// Anything else passes through as plain text. Safe because the
// LLM output is server-side cached + we never embed raw HTML.
export function MarkdownNarrative({ text, sx }: { text: string; sx?: object }) {
  const blocks = useMemo(() => {
    const out: Array<{ kind: 'p' | 'ol' | 'ul'; items: string[] }> = []
    for (const raw of text.split(/\n{2,}/)) {
      const block = raw.trim()
      if (!block) continue
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
      const numbered = lines.every(l => /^\d+\.\s/.test(l))
      const bulleted = lines.every(l => /^[-*]\s/.test(l))
      if (numbered) {
        out.push({ kind: 'ol', items: lines.map(l => l.replace(/^\d+\.\s+/, '')) })
      } else if (bulleted) {
        out.push({ kind: 'ul', items: lines.map(l => l.replace(/^[-*]\s+/, '')) })
      } else {
        out.push({ kind: 'p', items: [lines.join(' ')] })
      }
    }
    return out
  }, [text])

  const renderInline = (s: string) => {
    // Bold: **xxx** → <strong>xxx</strong>. Use a simple split
    // approach so we don't have to ship dangerouslySetInnerHTML.
    const parts: React.ReactNode[] = []
    let i = 0
    const re = /\*\*([^*]+)\*\*/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      if (m.index > i) parts.push(s.slice(i, m.index))
      parts.push(<Box key={m.index} component="strong" sx={{ fontWeight: 700 }}>{m[1]}</Box>)
      i = m.index + m[0].length
    }
    if (i < s.length) parts.push(s.slice(i))
    return parts
  }

  return (
    <Box sx={sx}>
      {blocks.map((b, idx) => {
        if (b.kind === 'p') {
          return (
            <Typography key={idx} sx={{
              ...footprintText.narrativeBody,
              mb: idx < blocks.length - 1 ? 1.25 : 0,
            }}>
              {renderInline(b.items[0])}
            </Typography>
          )
        }
        const Tag = b.kind === 'ol' ? 'ol' : 'ul'
        return (
          <Box key={idx} component={Tag} sx={{
            pl: 2.5, my: idx < blocks.length - 1 ? 1.25 : 0,
            '& li': { ...footprintText.narrativeBody, mb: 0.5 },
          }}>
            {b.items.map((item, i2) => (
              <li key={i2}>{renderInline(item)}</li>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

export function NarrativePanel({ orgId, entityCount, refreshKey }: NarrativePanelProps) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: qk.footprint.narrative(orgId, refreshKey),
    queryFn: () => getFootprintNarrative(orgId),
    staleTime: 30 * 60_000,
    enabled: entityCount > 0,
  })

  if (entityCount === 0) return null
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Box sx={{
            width: 20, height: 20, borderRadius: 0.75,
            bgcolor: 'primary.main', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={12} />
          </Box>
          <Typography sx={footprintText.panelTitle}>
            {t('footprint.panel.narrative')}
          </Typography>
        </Stack>
        <Tooltip title={t('footprint.panel.narrative.refresh')}>
          <span>
	            <IconButton
	              size="small"
	              onClick={() => refetch()}
	              disabled={isFetching}
	              aria-label={t('footprint.panel.narrative.refresh')}
	            >
	              <RefreshCw size={12} />
	            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      {isLoading && <LinearProgress sx={{ mb: 1 }} />}
      {data?.narrative ? (
        <MarkdownNarrative text={data.narrative} sx={{ '& > *:first-of-type': { mt: 0 } }} />
      ) : !isLoading && (
        <Typography sx={footprintText.panelSubtitle}>
          {t('footprint.panel.narrative.empty')}
        </Typography>
      )}
      {data?.provider === 'fallback' && (
        <Typography sx={{ ...footprintText.smallMuted, color: 'warning.main', mt: 0.75, fontStyle: 'italic' }}>
          {t('footprint.panel.narrative.fallback')}
        </Typography>
      )}
    </Paper>
  )
}

// ─── Technology Fingerprint Panel ─────────────────────────────────
// Pulls Technology entities OUT of the main bucket list. The
// classifier marks tech_stack rows as "rejected" because they're
// not your assets — but that's wrong UX. Technology IS valuable
// intel (the attacker wants to know your WAF, your CDN, your
// framework). Surface them as positive intelligence here.
interface TechnologyFingerprintPanelProps {
  entities: FootprintEntity[]
}

function TechnologyFingerprintPanel({ entities }: TechnologyFingerprintPanelProps) {
  const tech = useMemo(() => entities.filter(e =>
    e.type === 'technology' || e.type === 'vendor'
  ), [entities])
  if (tech.length === 0) return null

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderLeft: `3px solid #f59e0b` }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
        <Cpu size={14} color="#f59e0b" />
        <Typography sx={footprintText.panelTitle}>
          {t('footprint.panel.techFingerprint')}
        </Typography>
        <Chip size="small" label={tech.length}
          sx={{ ...footprintText.badge, height: 18, bgcolor: '#f59e0b', color: '#fff' }} />
      </Stack>
      <Typography sx={{ ...footprintText.panelSubtitle, mb: 1.25 }}>
        {t('footprint.panel.techFingerprint.subtitle')}
      </Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {tech.map(t => (
          <Chip
            key={t.id}
            size="small"
            label={`${t.canonical_name}${t.type === 'vendor' ? ' · vendor' : ''}`}
            sx={{
              ...footprintText.mono,
              bgcolor: t.type === 'vendor' ? '#fef3c7' : '#fffbeb',
              color: '#92400e',
              border: `1px solid #fbbf24`,
            }}
          />
        ))}
      </Stack>
    </Paper>
  )
}

// ─── Connector Activity Panel ─────────────────────────────────────
// Per-connector hit count derived from entity.source field. Tells
// the operator WHICH connector produced data + WHICH returned 0
// (with a hint on how to fix the empty ones — usually candidate
// aliases or missing API key).
interface ConnectorActivityPanelProps {
  entities: FootprintEntity[]
}

interface ConnectorRow {
  id: string
  count: number
  hint?: string
}

// Connectors we know about + hint text when they return 0.
const CONNECTOR_HINTS: Record<string, string> = {
  github_org_search: 'Fill candidate_aliases (e.g. flytohub) in Advanced',
  github_repo_extract: 'Requires GitHub org to be discovered first',
  github_commit_authors: 'Requires repos to be found',
  paste_darkweb_adapter: 'HIBP API key required for breach evidence',
  hibp_adapter: 'Set HIBP_API_KEY environment variable',
  wayback_cdx: 'Target may have no historical CDX entries',
  lookalike_domain: 'No DNS-resolving permutations of the seed',
  app_store: 'Brand may not have a published iTunes app',
  sec_edgar: 'Not a US-listed company',
  social_handle: 'No matching public profiles found',
  whois_rdap: 'RDAP lookup may be rate-limited',
  tech_stack: 'Site may be behind CDN that hides server fingerprints',
}

function ConnectorActivityPanel({ entities }: ConnectorActivityPanelProps) {
  const rows = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of entities) {
      if (!e.source) continue
      counts[e.source] = (counts[e.source] ?? 0) + 1
    }
    const all = new Set([...Object.keys(counts), ...Object.keys(CONNECTOR_HINTS)])
    const out: ConnectorRow[] = []
    for (const id of all) {
      const c = counts[id] ?? 0
      out.push({ id, count: c, hint: c === 0 ? CONNECTOR_HINTS[id] : undefined })
    }
    // Sort: non-zero first by count desc, then zero entries.
    out.sort((a, b) => {
      if (a.count === 0 && b.count > 0) return 1
      if (a.count > 0 && b.count === 0) return -1
      return b.count - a.count
    })
    return out
  }, [entities])

  if (rows.length === 0) return null

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
        <Activity size={14} color="#a78bfa" />
        <Typography sx={footprintText.panelTitle}>
          {t('footprint.panel.connectorActivity')}
        </Typography>
      </Stack>
      <Typography sx={{ ...footprintText.panelSubtitle, mb: 1 }}>
        {t('footprint.panel.connectorActivity.subtitle')}
      </Typography>
      <Stack spacing={0.5}>
        {rows.map(row => (
          <Stack key={row.id} direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{
              width: 14, textAlign: 'center', ...footprintText.panelSubtitle,
              color: row.count > 0 ? 'success.main' : 'text.secondary',
            }}>
              {row.count > 0 ? '✓' : '·'}
            </Box>
            <Typography sx={{
              ...footprintText.mono,
              color: row.count > 0 ? 'text.primary' : 'text.secondary',
              flex: 1,
            }}>
              {row.id}
            </Typography>
            <Typography sx={{
              ...footprintText.panelButton,
              color: row.count > 0 ? 'text.primary' : 'text.secondary',
              minWidth: 24, textAlign: 'right',
            }}>
              {row.count}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {rows.some(r => r.count === 0 && r.hint) && (
        <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Typography sx={{ ...footprintText.smallStrong, color: 'text.secondary', mb: 0.5 }}>
            {t('footprint.panel.connectorActivity.fixHint')}
          </Typography>
          <Stack spacing={0.25}>
            {rows.filter(r => r.count === 0 && r.hint).slice(0, 3).map(r => (
              <Typography key={r.id} sx={{ ...footprintText.smallMuted, lineHeight: 1.4 }}>
                <Box component="span" sx={{ ...footprintText.mono, color: 'text.secondary' }}>{r.id}</Box>
                {' — '}{r.hint}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}
    </Paper>
  )
}


// FeedbackButtons — three-way operator vote (👍 / 👎 / unsure)
// with single-click submission. Optimistic state so the operator
// gets immediate "thanks" feedback without a round trip.

// ─── 2D list view ─────────────────────────────────────────────────
//
// The default view. Operators don't need a 3D scene to answer
// "what did the expander find?" — they need a sortable list with
// entity-type buckets at the top and the discovery signal inline.


// EntityKind / ENTITY_KIND / TYPE_META / entityKind / typeMeta
// extracted to ./scene/types.ts Phase 5. Re-imported above.

// Mini horizontal gauge — 0..100 with a tier-colored fill.



// ─── Run-progress card ────────────────────────────────────────────
//
// While auto-expansion is in flight, the operator should see what's
// happening — not a blank screen. Lists the connector layers so the
// page feels alive even before the first entity lands.




// ─── Run-expansion dialog ─────────────────────────────────────────



// ─── Main view ────────────────────────────────────────────────────

export function FootprintGraphView({ orgId }: FootprintGraphViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [runOpen, setRunOpen] = useState(false)
  const [tuningOpen, setTuningOpen] = useState(false)
  const [researchSelector, setResearchSelector] = useState<ResearchFootprintSelector | null>(null)
  // Three view modes — Brief is the new default (Recon Brief
  // vertical scroll). List and Graph remain for operators who
  // want raw data shape.
  const [viewMode, setViewMode] = useState<'brief' | 'list' | 'graph'>('brief')
  const [actionableOnly, setActionableOnly] = useState(false)
  const [graphScope, setGraphScope] = useState<GraphScope>('focused')
  // Set of depth values to RENDER. Default keeps the 3D map legible:
  // seed + direct + pivot. Expand/All presets open the long tail.
  const [enabledDepths, setEnabledDepths] = useState<Set<number>>(() => new Set([0, 1, 2]))
  // Labels-always-on toggle. When off, only seed + selected + hover.
  const [showAllLabels, setShowAllLabels] = useState(false)
  // Legend collapsed by default — operator can expand when needed.
  // Keeps the canvas bottom-left clear so the timeline scrubber
  // doesn't fight for the same pixels.
  const [legendOpen, setLegendOpen] = useState(false)
  // Timeline cursor — null means "no filter, show everything";
  // when set, hide entities first_seen_at > cursor.
  const [timelineCursor, setTimelineCursor] = useState<number | null>(null)
  // Bumped by Reset Camera button so Canvas key changes → camera
  // and OrbitControls re-mount at the default position.
  const [cameraResetKey, setCameraResetKey] = useState(0)
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const scenePalette = isDark ? DARK_PALETTE : LIGHT_PALETTE
  const qc = useQueryClient()
  const { org } = useOrg()
  // Seed the shared discovery in-flight state (/discoveries/active + 30s
  // poll fallback) so the pipeline panel's guard reflects scans started
  // elsewhere, not just SSE events seen on this page.
  useDiscoverySeed(orgId)
  const { data: repos } = useConnectedRepos(orgId)

  // SSE-first — useOrgEvents (mounted once at WorkspacePage root)
  // invalidates these queries on footprint.* events as they fire.
  // refetchInterval is the safety net for SSE drops + worker-driven
  // background runs. 10s while running, 30s when idle. Plus
  // refetchOnWindowFocus so user navigating away + back picks up
  // the latest state immediately (real bug operator hit:
  // "navigate to another page, come back, no scan shown but
  // backend is still running" — the brief between-round window).
  // 2026-05-23 — polling state-machine:
  //   running → poll every 5s (operator wants live progress)
  //   anything else → 0 polling (stop bothering the backend)
  // refetchOnMount + refetchOnWindowFocus handle the "user comes
  // back to the page" case — they fire ONCE, then the running-
  // status check decides whether to keep polling.
  // SSE invalidates the same query on footprint.* events as they
  // fire, so polling is purely a safety net.
  const latestRunQ = useQuery({
    queryKey: qk.footprint.latestRun(orgId),
    queryFn: () => getFootprintLatestRun(orgId),
    refetchInterval: (q) => {
      const data = q.state.data as FootprintRunRow | null | undefined
      return isFootprintRunActive(data) ? 5_000 : false
    },
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
  })
  const isRunning = isFootprintRunActive(latestRunQ.data)

  const graphQ = useQuery({
    queryKey: qk.footprint.graph(orgId),
    queryFn: () => getFootprintGraph(orgId),
    staleTime: 15_000,
    refetchInterval: isRunning ? 15_000 : false,
  })

  // Findings overlay — every domain with ≥1 open finding gets a
  // rollup {total, severity buckets, worst_grade, has_threat_insight}.
  // Graph nodes look themselves up by canonical_name to render the
  // halo + count badge. Standalone query (not gated on graph) so it
  // can repopulate independently after a bitsight-import run.
  const findingsOverlayQ = useQuery({
    queryKey: qk.footprint.findingsOverlay(orgId),
    queryFn: () => listFindingsOverlay(orgId),
    staleTime: 60_000,
  })
  const overlayByDomain = useMemo(() => {
    const m = new Map<string, DomainFindingSummary>()
    for (const d of findingsOverlayQ.data?.domains ?? []) {
      m.set(d.domain.toLowerCase(), d)
    }
    return m
  }, [findingsOverlayQ.data])

  const tsQ = useQuery({
    queryKey: qk.footprint.timeseries(orgId),
    queryFn: () => getFootprintTimeseries(orgId),
    staleTime: 15_000,
    refetchInterval: isRunning ? 15_000 : false,
  })

  // Default seed: org's display name + first connected repo's homepage
  // (the same convention pentest auto-create uses on repo connect).
  const defaultOrgName = org?.name ?? ''
  const defaultDomain = useMemo(() => {
    if (!repos) return ''
    for (const r of repos) {
      const homepage = (r as { homepage?: string }).homepage
      if (homepage) {
        try {
          const u = new URL(homepage.startsWith('http') ? homepage : 'https://' + homepage)
          return u.hostname.replace(/^www\./, '')
        } catch {
          // ignore malformed homepage
        }
      }
    }
    return ''
  }, [repos])

  interface RichProfile {
    orgName: string
    domain: string
    candidateAliases?: string[]
    negativeKeywords?: string[]
    brandNames?: string[]
    englishName?: string
    industry?: string
  }
  const runMutation = useMutation({
    mutationFn: async (p: RichProfile) => {
      try {
        return await runFootprintExpansion(orgId, {
          org_name: p.orgName,
          domain: p.domain,
          candidate_aliases: p.candidateAliases,
          negative_keywords: p.negativeKeywords,
          brand_names: p.brandNames,
          english_name: p.englishName,
          industry: p.industry,
        })
      } catch (err) {
        // 2026-05-23 — backend returns 409 expansion_already_running
        // when an operator double-clicks or another tab fired one.
        // Treat as success: the in-flight run IS the user's intent;
        // just refresh polling to catch up with it.
        if ((err as Error).message === 'expansion_already_running') {
          return { status: 'running', message: t('footprint.alreadyRunning') }
        }
        throw err
      }
    },
    onSuccess: () => {
      invalidateFootprintProgress(qc, orgId)
    },
  })

  // Fire-and-forget — dialog closes immediately so the operator
  // can keep working / navigate away. The actual HTTP POST stays
  // in flight in the background; latest-run polling + graph
  // refetch surface progress via the running banner +
  // RunProgressCard. User can leave the page and the run keeps
  // going; coming back picks up live state from polling.
  const startExpansion = (p: RichProfile) => {
    setRunOpen(false)
    // Pre-stage a "running" sentinel into the latest-run cache so
    // the UI flips into running state instantly, without waiting
    // for the next 4s poll tick to land.
    qc.setQueryData(qk.footprint.latestRun(orgId), (prev: FootprintRunRow | null | undefined) => {
      // Defensive: prev SHOULD be FootprintRunRow but a stale
      // cache entry from a different shape could spread weirdly.
      // Require it to look like an object before spreading.
      const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : {
        id: 'pending', org_id: orgId, started_at: new Date().toISOString(),
        max_depth: 6, entities_created: 0, relationships_created: 0,
        connectors_called: 0, cost_used_usd: 0, depth_reached: 0,
        rounds_completed: 0, tokens_harvested: 0, stop_reason: '',
      }
      return { ...base, status: 'running' }
    })
    runMutation.mutate(p)
  }

  // Auto-fire: first visit to an org with no expansion yet AND a
  // derivable seed (org name OR a primary domain from connected
  // repos) → trigger a run without making the operator click. Guard
  // with a ref so the effect only fires once per mount; subsequent
  // empty results (e.g. failed run) leave the manual Start button
  // visible.
  const autoFiredRef = useRef(false)
  useEffect(() => {
    if (autoFiredRef.current) return
    if (!graphQ.data) return
    if (graphQ.data.entities.length > 0) return
    if (runMutation.isPending) return
    if (isFootprintRunActive(latestRunQ.data)) return
    if (!defaultOrgName && !defaultDomain) return
    autoFiredRef.current = true
    startExpansion({ orgName: defaultOrgName, domain: defaultDomain })
    // startExpansion is stable for the closure's purposes — depends
    // on orgId / defaultOrgName / defaultDomain / qc which are all
    // captured in deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphQ.data, defaultOrgName, defaultDomain, latestRunQ.data])

  const signalByEntity = useMemo(() => {
    const m = new Map<string, FootprintSignalKind>()
    for (const s of tsQ.data?.signals ?? []) {
      m.set(s.entity_id, s.signal)
    }
    return m
  }, [tsQ.data])

  const selectedEntity = useMemo(
    () => graphQ.data?.entities.find(e => e.id === selectedId) ?? null,
    [graphQ.data, selectedId],
  )

  // Per-run live snapshot for the progress card (and for the
  // running banner when the user already has data on screen).
  const sourcesObserved = useMemo(() => {
    const s = new Set<string>()
    for (const e of graphQ.data?.entities ?? []) {
      if (e.source) s.add(e.source)
    }
    return s
  }, [graphQ.data])
  const liveEntityCount = graphQ.data?.entities.length ?? 0
  const liveSignalCount = tsQ.data?.signals.length ?? 0
  const showRunningCard = runMutation.isPending || isRunning
  // Recent entities by last_seen_at desc — the activity-tape feed.
  const recentEntities = useMemo(() => {
    if (!graphQ.data) return []
    return [...graphQ.data.entities].sort((a, b) =>
      (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? ''),
    ).slice(0, 12)
  }, [graphQ.data])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={{ xs: 1.25, sm: 2 }}
        sx={{ px: { xs: 2, sm: 3 }, py: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" variant="h6" sx={{ fontWeight: 600 }}>
            {t('footprint.headerTitle')}
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>
              {t('footprint.headerSubtitle')}
            </Typography>
            {latestRunQ.data?.finished_at && (
              <Chip
                size="small"
                label={t('footprint.autoRun')}
                sx={{
                  fontSize: 12, height: 20, bgcolor: 'success.main', color: '#fff',
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            )}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            onChange={(_, v) => v && setViewMode(v)}
            sx={{ maxWidth: '100%' }}
          >
            <ToggleButton value="brief" sx={{ px: 1.5 }}>
              <FileText size={14} style={{ marginRight: 6 }} />
              <Box sx={{ fontSize: 13 }}>{t('footprint.viewMode.brief')}</Box>
            </ToggleButton>
            <ToggleButton value="list" sx={{ px: 1.5 }}>
              <ListIcon size={14} style={{ marginRight: 6 }} />
              <Box sx={{ fontSize: 13 }}>{t('footprint.viewMode.list')}</Box>
            </ToggleButton>
            <ToggleButton value="graph" sx={{ px: 1.5 }}>
              <Boxes size={14} style={{ marginRight: 6 }} />
              <Box sx={{ fontSize: 13 }}>{t('footprint.viewMode.graph')}</Box>
            </ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Play size={14} />}
            onClick={() => setRunOpen(true)}
            disabled={showRunningCard}
            title={showRunningCard ? t('footprint.alreadyRunning') : undefined}
          >
            {graphQ.data && graphQ.data.entities.length > 0 ? t('footprint.reRun') : t('footprint.startExpansion')}
          </Button>
	          <Tooltip title={t('footprint.tuning.openButton')}>
	            <IconButton
	              onClick={() => setTuningOpen(true)}
	              size="small"
	              aria-label={t('footprint.tuning.openButton')}
	            >
	              <SlidersHorizontal size={16} />
	            </IconButton>
	          </Tooltip>
          <Tooltip title={t('common.refresh')}>
	            <IconButton
	              onClick={() => invalidateFootprintClosure(qc, orgId)}
	              size="small"
	              aria-label={t('common.refresh')}
	            >
	              <RefreshCw size={16} />
	            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <RunDialog
        open={runOpen}
        onClose={() => setRunOpen(false)}
        orgId={orgId}
        defaultOrgName={defaultOrgName}
        defaultDomain={defaultDomain}
        isRunning={showRunningCard}
        onRun={(p) => startExpansion(p)}
      />
      <RuleTuningModal
        open={tuningOpen}
        onClose={() => setTuningOpen(false)}
        orgId={orgId}
      />

      {runMutation.isError && (
        <Alert
          severity="error"
          sx={{ mx: 2, mt: 1 }}
          icon={<AlertTriangle size={16} />}
          onClose={() => runMutation.reset()}
        >
          {t('footprint.expansionFailed')}: {String((runMutation.error as Error)?.message ?? runMutation.error)}
        </Alert>
      )}
      {runMutation.isPending && <LinearProgress />}

      {(graphQ.isLoading || tsQ.isLoading) && <LinearProgress />}

      {(graphQ.error || tsQ.error) && !graphQ.data && (
        <Box sx={{ m: 2 }}>
          <DataBoundary
            isError
            error={graphQ.error ?? tsQ.error}
            onRetry={() => {
              void graphQ.refetch()
              void tsQ.refetch()
            }}
            hasData={false}
            label="footprint graph"
          >
            <span />
          </DataBoundary>
        </Box>
      )}

      {(graphQ.error || tsQ.error) && graphQ.data && (
        <Alert severity="warning" sx={{ m: 2 }} icon={<AlertTriangle size={16} />}>
          {t('footprint.refreshFailedStale')}
        </Alert>
      )}

      {!graphQ.isLoading && graphQ.data && graphQ.data.entities.length === 0 && (
        showRunningCard ? (
          <RunProgressCard
            entitiesSoFar={liveEntityCount}
            signalsSoFar={liveSignalCount}
            sourcesObserved={sourcesObserved}
            latestRun={latestRunQ.data}
            recentEntities={recentEntities}
          />
        ) : !defaultOrgName && !defaultDomain ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {t('footprint.tellUsHint')}
            </Typography>
            <Button
              variant="contained"
              startIcon={<Play size={16} />}
              onClick={() => setRunOpen(true)}
            >
              {t('footprint.startExpansion')}
            </Button>
          </Box>
        ) : (
          <RunProgressCard
            entitiesSoFar={liveEntityCount}
            signalsSoFar={liveSignalCount}
            sourcesObserved={sourcesObserved}
            latestRun={latestRunQ.data}
            recentEntities={recentEntities}
          />
        )
      )}

      {/* When there's already data AND a run is in flight, show a
          slim live banner over the list/graph so the operator sees
          the scores updating without losing the view they're on. */}
      {graphQ.data && graphQ.data.entities.length > 0 && showRunningCard && (
        <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Box sx={{
              width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main',
              animation: 'pulse 1.5s ease-in-out infinite',
              '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
            }} />
            <Typography variant="caption" sx={{ fontSize: 13, fontWeight: 500 }}>
              {t('footprint.expansionRunning')
                .replace('{n}', String(Math.max(1, Math.min((latestRunQ.data?.rounds_completed ?? 0) + 1, MAX_ROUNDS))))
                .replace('{total}', String(MAX_ROUNDS))}
            </Typography>
            <Chip size="small" label={`${liveEntityCount} ${t('footprint.entitiesUnit')}`} />
            <Chip size="small" label={`${latestRunQ.data?.tokens_harvested ?? 0} ${t('footprint.tokensUnit')}`} />
            <Chip size="small" label={`${sourcesObserved.size} sources`} variant="outlined" />
          </Stack>
        </Box>
      )}

      {graphQ.data && graphQ.data.entities.length > 0 && (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Main pane — Brief (default), List, or 3D Graph */}
          <Box sx={{ flex: 1, position: 'relative', bgcolor: 'background.default', minWidth: 0 }}>
            {viewMode === 'brief' ? (
              <ReconBriefView
                orgId={orgId}
                entities={graphQ.data.entities}
                latestRunEntitiesCreated={latestRunQ.data?.entities_created ?? 0}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : viewMode === 'list' ? (
              <FootprintListView
                entities={graphQ.data.entities}
                signalByEntity={signalByEntity}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : (
              <>
                <Canvas
                  key={cameraResetKey /* bump → re-mount → camera resets */}
                  camera={{ position: [4, 6, 16], fov: 45 }}
                  style={{ width: '100%', height: '100%' }}
                  dpr={[1, 2]}
                  gl={{
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.1,
                  }}
                >
                  <Scene
                    entities={graphQ.data.entities}
                    rels={graphQ.data.relationships}
                    signalByEntity={signalByEntity}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    palette={scenePalette}
                    actionableOnly={actionableOnly}
                    graphScope={graphScope}
                    enabledDepths={enabledDepths}
                    showAllLabels={showAllLabels}
                    timelineCursor={timelineCursor}
                    overlayByDomain={overlayByDomain}
                  />
                  {/* Real bloom — dark mode only. On light the bright slate
                      backdrop would bloom and wash the scene out, so we keep
                      the gl ACES tone-map there and skip the composer. The
                      high luminanceThreshold means only the emissive node
                      cores / glow sprites bloom, not the whole frame. A
                      ToneMapping effect restores ACES inside the composer
                      (the composer otherwise outputs linear). */}
                  {isDark && (
                    <EffectComposer enableNormalPass={false}>
                      <Bloom
                        intensity={0.85}
                        luminanceThreshold={0.22}
                        luminanceSmoothing={0.9}
                        radius={0.7}
                        mipmapBlur
                      />
                      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
                    </EffectComposer>
                  )}
                </Canvas>
                {/* Clear-selection moved into SelectedDetail header
                    (× icon) so it stops covering the Depth axis labels.
                    Click empty canvas also deselects. */}

                {/* Top-right stack: Actionable toggle + Depth chips. */}
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  flexWrap="wrap"
                  justifyContent="flex-end"
                  useFlexGap
                  sx={{ position: 'absolute', top: 12, right: 12, left: 170, pointerEvents: 'none', '& > *': { pointerEvents: 'auto' } }}
                >
                  <Stack direction="row" spacing={0.5} sx={{
                    bgcolor: scenePalette.labelBg,
                    border: `1px solid ${scenePalette.labelBorder}`,
                    backdropFilter: 'blur(6px)',
                    borderRadius: 999,
                    px: 0.5,
                    py: 0.5,
                  }}>
                    {([
                      ['focused', t('footprint.graphScope.focused')],
                      ['expanded', t('footprint.graphScope.expanded')],
                      ['all', t('footprint.graphScope.all')],
                    ] as const).map(([scope, label]) => {
                      const on = graphScope === scope
                      return (
                        <Box
                          key={scope}
                          onClick={() => {
                            setGraphScope(scope)
                            setEnabledDepths(new Set(GRAPH_SCOPE_DEPTHS[scope]))
                          }}
                          sx={{
                            px: 1,
                            height: 26,
                            borderRadius: 999,
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            bgcolor: on ? '#7c3aed' : 'transparent',
                            color: on ? '#fff' : scenePalette.labelColor,
                            border: on ? '1px solid #7c3aed' : `1px solid transparent`,
                            transition: 'all 120ms ease',
                            '&:hover': { color: '#fff', bgcolor: on ? '#7c3aed' : 'rgba(124,58,237,0.35)' },
                          }}
                        >
                          {label}
                        </Box>
                      )
                    })}
                  </Stack>

                  {/* Depth filter — 5 circular chips (0/1/2/3/4+). */}
                  <Stack direction="row" spacing={0.5} sx={{
                    bgcolor: scenePalette.labelBg,
                    border: `1px solid ${scenePalette.labelBorder}`,
                    backdropFilter: 'blur(6px)',
                    borderRadius: 999,
                    px: 0.75,
                    py: 0.5,
                  }}>
                    <Typography sx={{ fontSize: 12, color: scenePalette.labelColor, alignSelf: 'center', mx: 0.5, opacity: 0.7 }}>
                      {t('footprint.depth')}
                    </Typography>
                    {[0, 1, 2, 3, 4].map(d => {
                      const on = enabledDepths.has(d)
                      return (
                        <Box
                          key={d}
                          onClick={() => setEnabledDepths(prev => {
                            const next = new Set(prev)
                            if (next.has(d)) next.delete(d); else next.add(d)
                            // Don't allow all-off — keep at least one shell visible.
                            return next.size === 0 ? new Set([d]) : next
                          })}
                          sx={{
                            width: 26, height: 26, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 600,
                            cursor: 'pointer',
                            bgcolor: on ? '#7c3aed' : 'transparent',
                            color: on ? '#fff' : scenePalette.labelColor,
                            border: on ? '1px solid #7c3aed' : `1px solid ${scenePalette.labelBorder}`,
                            transition: 'all 120ms ease',
                            '&:hover': { borderColor: '#7c3aed' },
                          }}
                        >
                          {d === 4 ? '4+' : d}
                        </Box>
                      )
                    })}
                  </Stack>

                  <Chip
                    size="small"
                    label={actionableOnly ? `${t('footprint.actionableOnly')} · ON` : t('footprint.actionableOnly')}
                    onClick={() => setActionableOnly(v => !v)}
                    sx={{
                      fontSize: 13, fontWeight: 600,
                      bgcolor: actionableOnly ? '#dc2626' : 'rgba(15,23,42,0.6)',
                      color: '#fff',
                      cursor: 'pointer',
                      backdropFilter: 'blur(6px)',
                      border: '1px solid rgba(220,38,38,0.5)',
                      '&:hover': { bgcolor: actionableOnly ? '#b91c1c' : 'rgba(220,38,38,0.4)' },
                    }}
                  />
                </Stack>

                {/* Bottom-center action bar — labels toggle + reset
                    camera + pan/rotate/zoom hints. Compact: no
                    line wraps, short labels, narrower spacing. */}
                <Stack
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                  sx={{
                    position: 'absolute', bottom: 12, left: '50%',
                    transform: 'translateX(-50%)',
                    bgcolor: scenePalette.labelBg,
                    border: `1px solid ${scenePalette.labelBorder}`,
                    backdropFilter: 'blur(6px)',
                    borderRadius: 999,
                    px: 1, py: 0.5,
                    whiteSpace: 'nowrap',
                    zIndex: 2,
                  }}
                >
                  {[
                    { key: 'pan',    label: t('footprint.action.pan'),       hint: 'right-click drag' },
                    { key: 'rotate', label: t('footprint.action.rotate'), hint: 'left-click drag' },
                    { key: 'zoom',   label: t('footprint.action.zoom'),     hint: 'scroll' },
                  ].map(a => (
                    <Tooltip key={a.key} title={a.hint}>
                      <Typography sx={{
                        fontSize: 13, color: scenePalette.labelColor, px: 0.6, opacity: 0.7,
                        whiteSpace: 'nowrap',
                      }}>
                        {a.label}
                      </Typography>
                    </Tooltip>
                  ))}
                  <Box sx={{ width: 1, height: 16, bgcolor: scenePalette.labelBorder, mx: 0.25 }} />
                  <Tooltip title={t('footprint.action.recenter')}>
                    <Typography
                      onClick={() => setCameraResetKey(k => k + 1)}
                      sx={{
                        fontSize: 13, color: scenePalette.labelColor, px: 0.6,
                        cursor: 'pointer', fontWeight: 500,
                        whiteSpace: 'nowrap',
                        '&:hover': { color: '#7c3aed' },
                      }}
                    >
                      {t('footprint.action.reset')}
                    </Typography>
                  </Tooltip>
                  <Tooltip title={showAllLabels ? t('footprint.action.hideLabels') : t('footprint.action.showLabels')}>
                    <Typography
                      onClick={() => setShowAllLabels(v => !v)}
                      sx={{
                        fontSize: 13, color: showAllLabels ? '#7c3aed' : scenePalette.labelColor,
                        px: 0.6, cursor: 'pointer', fontWeight: 500,
                        whiteSpace: 'nowrap',
                        '&:hover': { color: '#7c3aed' },
                      }}
                    >
                      {t('footprint.action.labels')}{showAllLabels ? ' ·' : ''}
                    </Typography>
                  </Tooltip>
                </Stack>

                {/* Timeline slider — bottom edge of canvas. Filters
                    visibleEntities to first_seen_at ≤ cursor so the
                    operator can scrub through "what we knew at time T".
                    Cursor at the latest entity by default; clear to
                    re-show everything. */}
                {graphQ.data && graphQ.data.entities.length > 0 && (
                  <TimelineScrubber
                    entities={graphQ.data.entities}
                    value={timelineCursor}
                    onChange={setTimelineCursor}
                    palette={scenePalette}
                  />
                )}

                {/* Depth axis — compact left-edge legend so operators
                    see what each concentric shell means. Single
                    line per depth to leave the canvas breathing. */}
                <Stack
                  spacing={0.5}
                  sx={{
                    position: 'absolute', top: 12, left: 12,
                    fontSize: 13, color: scenePalette.labelColor,
                    pointerEvents: 'none',
                    opacity: 0.65,
                  }}
                >
                  {[
                    { d: 0, label: t('footprint.hop.seed') },
                    { d: 1, label: t('footprint.hop.direct') },
                    { d: 2, label: t('footprint.hop.pivot') },
                    { d: 3, label: t('footprint.hop.extended') },
                    { d: 4, label: t('footprint.hop.longTail') },
                  ].map(row => (
                    <Typography key={row.d} sx={{
                      fontSize: 13, fontWeight: 500, lineHeight: 1.3,
                    }}>
                      <Box component="span" sx={{ fontWeight: 700, mr: 0.75 }}>D{row.d}</Box>
                      {row.label}
                    </Typography>
                  ))}
                </Stack>

                {/* Legend — collapsed pill by default so it stops
                    fighting the Timeline scrubber for bottom-left
                    real estate. Click "Legend" to expand. */}
                <Box sx={{ position: 'absolute', bottom: 12, left: 12, zIndex: 2 }}>
                  {!legendOpen ? (
                    <Chip
                      size="small"
                      label={t('footprint.legend.title')}
                      onClick={() => setLegendOpen(true)}
                      sx={{
                        fontSize: 13, fontWeight: 600,
                        bgcolor: scenePalette.labelBg,
                        color: scenePalette.labelColor,
                        cursor: 'pointer',
                        backdropFilter: 'blur(6px)',
                        border: `1px solid ${scenePalette.labelBorder}`,
                      }}
                    />
                  ) : (
                    <Box sx={{
                      bgcolor: scenePalette.labelBg,
                      border: `1px solid ${scenePalette.labelBorder}`,
                      backdropFilter: 'blur(6px)',
                      borderRadius: 1.5, p: 1.25,
                      fontSize: 13, color: scenePalette.labelColor,
                      minWidth: 200,
                    }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.03em' }}>
                          Legend
                        </Typography>
                        <Box
                          onClick={() => setLegendOpen(false)}
                          sx={{
                            fontSize: 16, lineHeight: 1, cursor: 'pointer',
                            color: scenePalette.labelColor, opacity: 0.6,
                            '&:hover': { opacity: 1 },
                          }}
                        >
                          ×
                        </Box>
                      </Stack>
                      <Stack spacing={0.5}>
                        {(['red_team_actionable', 'needs_more_evidence', 'informational', 'rejected'] as const).map(tier => {
                          const vis = ACTIONABILITY_VISUAL[tier]
                          return (
                            <Stack key={tier} direction="row" alignItems="center" spacing={0.75}>
                              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: vis.ring, flexShrink: 0 }} />
                              <Typography sx={{ fontSize: 13 }}>{tierLabel(tier)}</Typography>
                            </Stack>
                          )
                        })}
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#a78bfa', flexShrink: 0 }} />
                          <Typography sx={{ fontSize: 13 }}>{t('footprint.promotion.confirmed')}</Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#fbbf24', flexShrink: 0 }} />
                          <Typography sx={{ fontSize: 13 }}>{t('footprint.promotion.candidate')}</Typography>
                        </Stack>
                      </Stack>
                      <Box sx={{ mt: 0.75, pt: 0.75, borderTop: `1px solid ${scenePalette.labelBorder}` }}>
                        <Stack spacing={0.4}>
                          <Stack direction="row" alignItems="center" spacing={0.75}>
                            <Box sx={{ width: 18, height: 2.5, bgcolor: scenePalette.edgeHighlight }} />
                            <Typography sx={{ fontSize: 13 }}>{t('footprint.legend.chainStrong')}</Typography>
                          </Stack>
                          <Stack direction="row" alignItems="center" spacing={0.75}>
                            <Box sx={{ width: 18, height: 1.2, bgcolor: scenePalette.edgeColor }} />
                            <Typography sx={{ fontSize: 13 }}>{t('footprint.legend.chainWeak')}</Typography>
                          </Stack>
                          <Stack direction="row" alignItems="center" spacing={0.75}>
                            {/* Dashed indicator — render as inline SVG so the
                                visual sample matches what's drawn in the
                                scene. Two short dashes communicates
                                "this means dashed". */}
                            <Box sx={{ width: 18, height: 1, display: 'flex', alignItems: 'center', gap: '3px' }}>
                              {[0, 1, 2, 3].map(i => (
                                <Box key={i} sx={{ width: 3, height: 1, bgcolor: scenePalette.edgeColor, opacity: 0.5 }} />
                              ))}
                            </Box>
                            <Typography sx={{ fontSize: 13 }}>{t('footprint.legend.indicator')}</Typography>
                          </Stack>
                        </Stack>
                      </Box>
                    </Box>
                  )}
                </Box>
              </>
            )}
          </Box>

          {/* Side panel */}
          <Box sx={{ width: 360, p: 2, borderLeft: 1, borderColor: 'divider', overflowY: 'auto' }}>
            <Stack spacing={2}>
              {/* Platform pipeline — single-click 3-phase orchestrator */}
              <PlatformPipelinePanel orgId={orgId} />
              <BreakthroughSummaryPanel orgId={orgId} />
              {/* Balanced posture — healthy + watching + acting
                  in a horizontal stacked bar. The "好的" side the
                  user said was missing. Deliberately NOT a 4x4
                  criticality x severity matrix (Bitsight patent). */}
              <PostureDistributionPanel orgId={orgId} />
              {/* "Phase 2 補了 Phase 1 漏掉的什麼" delta — shows the
                  cross-phase data flow as a concrete number */}
              <FootprintDeltaPanel orgId={orgId} />
              {/* Attacker-perspective narrative — prose first */}
              <NarrativePanel
                orgId={orgId}
                entityCount={graphQ.data.entities.length}
                refreshKey={latestRunQ.data?.entities_created ?? 0}
              />
              {/* Technology fingerprint pulled out of "rejected" */}
              <TechnologyFingerprintPanel entities={graphQ.data.entities ?? []} />
              {/* Top Attack Paths — what to test next, numbered */}
              <TopAttackPathsPanel
                orgId={orgId}
                selectedId={selectedId}
                onSelect={setSelectedId}
                refreshKey={latestRunQ.data?.entities_created ?? 0}
              />
              {/* Connector activity — visibility into the black box */}
              <ConnectorActivityPanel entities={graphQ.data.entities ?? []} />
              {selectedEntity ? (
                <SelectedDetail
                  orgId={orgId}
                  entity={selectedEntity}
                  signal={signalByEntity.get(selectedEntity.id)}
                  allEntities={graphQ.data.entities ?? []}
                  onClose={() => setSelectedId(null)}
                  onOpenResearchFootprint={setResearchSelector}
                />
              ) : (
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary' }}>
                    {viewMode === 'list'
                      ? t('footprint.detailHintRow')
                      : t('footprint.detailHintNode')}
                  </Typography>
                </Paper>
              )}
              {/* Decision-oriented counts at the bottom */}
              <ActionabilityStatsPanel
                entities={graphQ.data.entities ?? []}
                totalRelationships={graphQ.data.relationships?.length ?? 0}
                signals={tsQ.data?.signals ?? []}
              />
            </Stack>
          </Box>
        </Box>
      )}
      <ResearchFootprintDrawer
        orgId={orgId}
        open={!!researchSelector}
        selector={researchSelector}
        onClose={() => setResearchSelector(null)}
      />
    </Box>
  )
}

export default FootprintGraphView
