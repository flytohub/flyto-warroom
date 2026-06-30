/**
 * ScoringView — Bitsight-style scoring page for the war room.
 *
 * Two-panel layout:
 *   Left: Category accordion with sub-vector rows + grade circles
 *   Right: Overview (donut + breakdown table) or sub-vector drill-down
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { qk } from '@lib/queryKeys'
import { ChevronDown, ChevronLeft, BarChart3, ExternalLink, Zap, Eye, Info } from 'lucide-react'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Collapse from '@mui/material/Collapse'
import ButtonBase from '@mui/material/ButtonBase'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import { useOrg } from '@hooks/useOrg'
import { getComputedScore, type ComputedScoreResponse, type DrillScoreServer } from '@lib/engine'
import { getCategoryDefs, type SubVectorDef, type ScoringResult, type ComputedSubVector, type ComputedCategory, type CrossDimDetail, type ScoringExplanation } from './scoring-defs'
import { BenchmarkCard } from './BenchmarkCard'
import { GradeCircle } from '@compounds/_shared/GradeCircle'
import { WeightDonut } from './WeightDonut'
import { t, tOr } from '@lib/i18n';
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { QueryError } from '@atoms/QueryError'
import { useFixQueue } from '@/contexts/FixQueueContext'

// Cross-dim chip drill-in target. Most chips route into the unified
// Fix Queue with a filter — that drawer shows the actual findings
// that contributed to the penalty, so the operator can act on them
// (not just read the chip). Blast Radius is the outlier: it routes
// to Pulse, which is the org-wide ranked feed by blast.
import type { FixQueueFilter } from '@/contexts/FixQueueContext'
type CrossDimAction =
  | { kind: 'navigate'; target: string }
  | { kind: 'queue'; filter: FixQueueFilter }
const CROSS_DIM_ACTIONS: Record<'blastRadius' | 'prAdjacency' | 'taintAdjacency' | 'pentestVerdict' | 'autofixCoverage', CrossDimAction> = {
  blastRadius:    { kind: 'navigate', target: '_pulse' },
  prAdjacency:    { kind: 'queue',    filter: 'pr' },
  taintAdjacency: { kind: 'queue',    filter: 'taint' },
  pentestVerdict: { kind: 'queue',    filter: 'pentest' },
  autofixCoverage:{ kind: 'queue',    filter: 'autofix' },
}

// Mode visual treatment — replaces inline emoji (👁 / ℹ) which violated
// the lucide-only design rule and offered no explanation when an
// operator wondered why a row had no grade.
const MODE_HINT = {
  observing: { Icon: Eye, opacity: 0.6, key: 'scoring.mode.observingLabel', fallback: 'Observing — data collected, not yet scored' },
  context:   { Icon: Info, opacity: 0.4, key: 'scoring.mode.contextLabel',  fallback: 'Context — informational only, never scored' },
} as const

function ModeBadge({ mode }: { mode: 'observing' | 'context' }) {
  const hint = MODE_HINT[mode]
  const { Icon } = hint
  return (
    <Tooltip title={tOr(hint.key, hint.fallback)}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0.5, opacity: hint.opacity, cursor: 'help' }}>
        <Icon size={12} />
      </Box>
    </Tooltip>
  )
}


const GRADES = [
  { grade: 'F', min: 250, max: 370, color: '#ef4444' },
  { grade: 'D', min: 380, max: 490, color: '#f97316' },
  { grade: 'C', min: 500, max: 630, color: '#eab308' },
  { grade: 'B', min: 640, max: 730, color: '#06b6d4' },
  { grade: 'A', min: 740, max: 900, color: '#22c55e' },
]

/**
 * Map server-computed score response to the ScoringResult shape the UI needs.
 * Attaches SubVectorDef (icons, labels, colors) from getCategoryDefs()
 * for rendering. All scoring data comes from the server.
 */
function mapServerResult(server: ComputedScoreResponse): ScoringResult {
  const catDefs = getCategoryDefs()
  // Build a lookup of sub-vector defs by ID
  const svDefMap = new Map<string, SubVectorDef>()
  for (const cat of catDefs) {
    for (const sv of cat.subVectors) {
      svDefMap.set(sv.id, sv)
    }
  }

  const categories: ComputedCategory[] = server.categories.map(sc => {
    const catDef = catDefs.find(c => c.id === sc.id)
    const subVectors: ComputedSubVector[] = sc.sub_vectors.map(ssv => {
      const def = svDefMap.get(ssv.id)
      const mapDrill = (d: DrillScoreServer) => ({
        id: d.id, name: d.name, raw: d.raw, display: d.display,
        grade: d.grade, gradeColor: d.grade_color || '#94a3b8', label: d.label,
      })
      return {
        def: def ?? { id: ssv.id, label: ssv.label, icon: BarChart3, weight: ssv.weight, color: ssv.color, mode: ssv.mode, drillDownType: ssv.drill_down_type },
        raw: ssv.raw,
        display: ssv.display,
        grade: ssv.grade,
        gradeColor: ssv.grade_color || '#94a3b8',
        repoScores: ssv.repo_scores?.map(mapDrill),
        domainScores: ssv.domain_scores?.map(mapDrill),
      }
    })
    return {
      def: catDef ?? { id: sc.id, label: sc.label, weight: sc.weight, color: sc.color, subVectors: [] },
      subVectors,
      raw: sc.raw,
      display: sc.display,
      grade: sc.grade,
      gradeColor: sc.grade_color || '#94a3b8',
      effectiveWeight: sc.effective_weight,
    }
  })

  const crossDim: CrossDimDetail = {
    blastRadiusPenalty: server.cross_dim.blast_radius_penalty,
    prAdjacencyPenalty: server.cross_dim.pr_adjacency_penalty,
    taintAdjacencyPenalty: server.cross_dim.taint_adjacency_penalty,
    pentestVerdictModifier: server.cross_dim.pentest_verdict_modifier,
    autofixCoverageBonus: server.cross_dim.autofix_coverage_bonus,
    total: server.cross_dim.total,
  }

  const explanations: ScoringExplanation[] = (server.explanations ?? []).map(e => ({
    findingId: e.finding_id,
    subVectorId: e.sub_vector_id,
    description: e.description,
    basePenalty: e.base_penalty,
    confidenceLevel: e.confidence_level,
    multiplier: e.multiplier,
    effectivePenalty: e.effective_penalty,
    reason: e.reason,
  }))

  return {
    categories,
    overallRaw: server.overall_raw,
    overallDisplay: server.overall_display,
    overallGrade: server.overall_grade,
    overallGradeColor: server.overall_grade_color || '#94a3b8',
    activeCount: server.active_count,
    totalCount: server.total_count,
    crossDim,
    explanations,
  }
}

export function ScoringView({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const { org } = useOrg()

  // Server-computed score — single source of truth for ALL scoring data
  const { data: serverScore, isLoading: scoreLoading, isError, error, refetch } = useQuery({
    queryKey: qk.computedScore(org?.id),
    queryFn: () => getComputedScore(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
    retry: false,
  })

  // Map server response to UI ScoringResult
  const scoring = useMemo<ScoringResult | null>(() => {
    if (!serverScore) return null
    return mapServerResult(serverScore)
  }, [serverScore])

  const [selectedSv, setSelectedSv] = useState<SubVectorDef | null>(null)

  if (isError) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 3 }}>
        <QueryError error={error} onRetry={refetch} />
      </Box>
    )
  }

  if (scoreLoading || !scoring) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <LinearProgress sx={{ width: 200 }} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, height: '100%', width: '100%', overflow: { xs: 'auto', lg: 'hidden' }, minHeight: 0 }}>
      {/* Left panel — Score nav. Was `position: absolute, inset: 0`
          which locked us to a specific dispatcher positioning context
          — swapped to flex+height:100% so the layout survives any
          parent wrapper. */}
      <Box sx={{
        width: { xs: '100%', lg: 340 },
        minWidth: { xs: 0, lg: 340 },
        maxHeight: { xs: 320, md: 360, lg: 'none' },
        borderRight: { xs: 'none', lg: '1px solid' },
        borderBottom: { xs: '1px solid', lg: 'none' },
        borderColor: 'divider',
        overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, flexShrink: 0,
      }}>
        <ScoreNavPanel scoring={scoring} selectedSv={selectedSv} onSelect={setSelectedSv} />
      </Box>

      {/* Right panel — Overview or drill-down */}
      <Box sx={{ flex: { xs: '0 0 auto', lg: 1 }, overflow: { xs: 'visible', lg: 'hidden' }, display: 'flex', flexDirection: 'column', p: { xs: 2, md: 3 }, gap: 3, minHeight: { xs: 'auto', lg: 0 } }}>
        <FlytoPageHeader
          title={selectedSv?.label ?? t('scoring.title')}
          subtitle={selectedSv
            ? t('scoring.subVectorSub')
            : t('scoring.subtitle')}
          bottomGap={0}
        />
        {selectedSv ? (
          <SubVectorDetail
            sv={selectedSv}
            scoring={scoring}
            onBack={() => setSelectedSv(null)}
            onNavigate={onNavigate}
          />
        ) : (
          <ScoreOverviewPanel scoring={scoring} onSelectSv={setSelectedSv} onNavigate={onNavigate} />
        )}
      </Box>
    </Box>
  )
}

/* ── Left Panel: Score Navigation ──────────────── */

function ScoreNavPanel({ scoring, selectedSv, onSelect }: {
  scoring: ScoringResult
  selectedSv: SubVectorDef | null
  onSelect: (sv: SubVectorDef | null) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(getCategoryDefs().map(c => [c.id, true])),
  )

  return (
    <>
      {/* Overall score header */}
      <ButtonBase
        onClick={() => onSelect(null)}
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          p: 2, borderBottom: '1px solid', borderColor: 'divider',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BarChart3 size={18} style={{ color: '#8b5cf6' }} />
          <Typography variant="subtitle2" fontWeight={700} color="text.primary">
            {t('scoring.overview')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <GradeCircle grade={scoring.overallGrade !== '--' ? scoring.overallGrade : null} color={scoring.overallGradeColor} size={38} />
          {scoring.overallDisplay !== null && (
            <Typography variant="h6" fontWeight={800} sx={{ color: scoring.overallGradeColor }}>
              {scoring.overallDisplay}
            </Typography>
          )}
        </Box>
      </ButtonBase>

      {/* Category accordions */}
      {scoring.categories.map(cat => {
        // Effective weight is what actually drives the overall score
        // after redistributing inactive categories — that's the
        // truthful number to show. Target weight is in the tooltip
        // for operators who want to know the static configuration.
        const effPct = Number.isFinite(cat.effectiveWeight) ? Math.round(cat.effectiveWeight * 100) : 0
        const targetPct = Math.round(cat.def.weight * 100)
        const weightsDiffer = effPct !== targetPct
        // A category is "observation only" when none of its sub-
        // vectors are scored. Code Quality is the canonical example
        // — claims 10% weight but every sub-vector is mode='context'.
        const allObserving = cat.subVectors.length > 0
          && cat.subVectors.every(sv => sv.def.mode !== 'scored')
        return (
        <Box key={cat.def.id} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          {/* Category header */}
          <ButtonBase
            onClick={() => setExpanded(prev => ({ ...prev, [cat.def.id]: !prev[cat.def.id] }))}
            sx={{
              display: 'flex', alignItems: 'center', width: '100%',
              px: 2, py: 1.5, gap: 1.5,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: cat.def.color, flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <Typography variant="body1" fontWeight={700} color="text.primary" noWrap>
                {cat.def.label}
              </Typography>
              {allObserving && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 12, fontStyle: 'italic' }}>
                  {t('scoring.observationOnly')}
                </Typography>
              )}
            </Box>
            <Tooltip title={
              weightsDiffer
                ? tOr('scoring.weight.tip',
                    `Effective ${effPct}% (target ${targetPct}%, redistributed after inactive categories)`)
                  .replace(/Effective \d+%/, `Effective ${effPct}%`)
                  .replace(/target \d+%/, `target ${targetPct}%`)
                : tOr('scoring.weight.tipStatic', `Weight: ${targetPct}% of overall score`)
                  .replace(/\d+%/, `${targetPct}%`)
            }>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mr: 1, cursor: 'help' }}>
                {effPct}%
              </Typography>
            </Tooltip>
            <GradeCircle grade={cat.grade} color={cat.gradeColor} size={28} />
            <ChevronDown size={14} style={{
              transition: 'transform 0.2s',
              transform: expanded[cat.def.id] ? 'rotate(180deg)' : 'rotate(0)',
              opacity: 0.4,
            }} />
          </ButtonBase>

          {/* Sub-vector rows */}
          <Collapse in={expanded[cat.def.id]}>
            {cat.subVectors.map(sv => {
              const isActive = selectedSv?.id === sv.def.id
              return (
                <ButtonBase
                  key={sv.def.id}
                  onClick={() => onSelect(sv.raw !== null ? sv.def : null)}
                  sx={{
                    display: 'flex', alignItems: 'center', width: '100%',
                    pl: 4.5, pr: 2, py: 1, gap: 1.5,
                    bgcolor: isActive ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                    opacity: sv.raw !== null ? 1 : 0.5,
                    cursor: sv.raw !== null ? 'pointer' : 'default',
                  }}
                >
                  <sv.def.icon size={15} style={{ color: sv.def.color, flexShrink: 0 }} />
                  <Typography variant="body2" color="text.primary" sx={{ flex: 1, textAlign: 'left', fontWeight: isActive ? 600 : 400 }}>
                    {sv.def.label}
                    {sv.def.mode === 'observing' && <ModeBadge mode="observing" />}
                    {sv.def.mode === 'context' && <ModeBadge mode="context" />}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                    {sv.def.mode === 'scored' ? `${Math.round(sv.def.weight * 100)}%` : ''}
                  </Typography>
                  <GradeCircle grade={sv.grade} color={sv.gradeColor} size={26} noRating={sv.def.mode !== 'scored'} />
                </ButtonBase>
              )
            })}
          </Collapse>
        </Box>
        )
      })}

      {/* Footnote */}
      <Box sx={{ p: 1.5, mt: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Eye size={12} />
          {t('scoring.mode.observing')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Info size={12} />
          {t('scoring.mode.context')}
        </Typography>
      </Box>
    </>
  )
}

/* ── Right Panel: Overview ─────────────────────── */

function ScoreOverviewPanel({ scoring, onSelectSv, onNavigate }: {
  scoring: ScoringResult
  onSelectSv: (sv: SubVectorDef) => void
  onNavigate?: (section: string) => void
}) {
  const fixQueue = useFixQueue()

  // Resolve a cross-dim action — same hook for all five chips.
  const runCrossDim = (action: CrossDimAction) => {
    if (action.kind === 'navigate') onNavigate?.(action.target)
    else fixQueue.open({ filter: action.filter })
  }
  return (
    <>
      {/* Header + Donut — fixed top */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 4 }, alignItems: { xs: 'stretch', md: 'flex-start' }, flexShrink: 0 }}>
        <WeightDonut categories={scoring.categories} size={180} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700} color="text.primary" gutterBottom>
            {t('scoring.whatMakesScore')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
            {t('scoring.scoreExplanation')
              .replace('{active}', String(scoring.activeCount))
              .replace('{categories}', String(scoring.categories.filter(c => c.raw !== null).length))}
          </Typography>
          {/* Category legend */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {scoring.categories.map(cat => (
              <Box key={cat.def.id} sx={{ display: 'grid', gridTemplateColumns: '16px 1fr 40px 28px', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: cat.raw !== null ? cat.def.color : '#94a3b8', opacity: cat.raw !== null ? 0.8 : 0.3 }} />
                <Typography variant="body2" color="text.primary" fontWeight={500}>
                  {cat.def.label}
                </Typography>
                <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ textAlign: 'right' }}>
                  {Number.isFinite(cat.effectiveWeight) ? Math.round(cat.effectiveWeight * 100) : 0}%
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <GradeCircle grade={cat.grade} color={cat.gradeColor} size={22} />
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Peer Benchmark */}
      <BenchmarkCard />

      {/* All sub-vectors table — scrollable */}
      <Paper variant="outlined" sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: { xs: '0 0 auto', lg: 1 }, minHeight: { xs: 360, lg: 0 }, maxHeight: { xs: 520, lg: 'none' } }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} color="text.primary">
            {t('scoring.riskVectorBreakdown')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {scoring.activeCount}/{scoring.totalCount} active
          </Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {scoring.categories.flatMap(cat => cat.subVectors).map(sv => {
          const pct = sv.raw ?? 0
          const clickable = sv.raw !== null
          return (
            <ButtonBase
              key={sv.def.id}
              disabled={!clickable}
              onClick={() => clickable && onSelectSv(sv.def)}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr) 58px 34px', sm: '180px 1fr 60px 36px', md: '200px 1fr 60px 36px' },
                alignItems: 'center',
                gap: { xs: 1, sm: 2 },
                width: '100%',
                px: { xs: 1.5, sm: 2.5 }, py: 1.5, textAlign: 'left',
                borderBottom: '1px solid', borderColor: 'divider',
                opacity: sv.def.mode === 'scored' ? 1 : sv.def.mode === 'observing' ? 0.7 : 0.4,
                '&:hover': clickable ? { bgcolor: 'action.hover' } : {},
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <sv.def.icon size={16} style={{ color: sv.def.color, flexShrink: 0 }} />
                <Typography variant="body1" fontWeight={500} color="text.primary" noWrap component="span">
                  {sv.def.label}
                  {sv.def.mode === 'observing' && <ModeBadge mode="observing" />}
                  {sv.def.mode === 'context' && <ModeBadge mode="context" />}
                </Typography>
              </Box>

              {/* Progress bar */}
              <Box sx={{ display: { xs: 'none', sm: 'block' }, height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}>
                {sv.raw !== null ? (
                  <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 3, bgcolor: sv.def.color, transition: 'width 0.6s ease' }} />
                ) : (
                  <Box sx={{
                    width: '100%', height: '100%',
                    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, currentColor 4px, currentColor 8px)',
                    opacity: 0.06,
                  }} />
                )}
              </Box>

              {/* Score — fixed width, right-aligned */}
              {sv.display !== null ? (
                <Typography variant="body1" fontWeight={700} color="text.primary" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 16 }}>
                  {sv.display}
                </Typography>
              ) : (
                <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'right', fontStyle: 'italic' }}>N/A</Typography>
              )}

              {/* Grade circle — fixed column */}
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <GradeCircle grade={sv.grade} color={sv.gradeColor} size={28} noRating={sv.def.mode !== 'scored'} />
              </Box>
            </ButtonBase>
          )
        })}
        </Box>
      </Paper>

      {/* Cross-dimensional modifier — show when ANY signal is non-zero,
          not just when the net total is non-zero (a +1 / -1 cancel
          still has signals worth surfacing). */}
      {(scoring.crossDim.blastRadiusPenalty !== 0
        || scoring.crossDim.prAdjacencyPenalty !== 0
        || scoring.crossDim.taintAdjacencyPenalty !== 0
        || scoring.crossDim.pentestVerdictModifier !== 0
        || scoring.crossDim.autofixCoverageBonus !== 0
      ) && (
        <Paper variant="outlined" sx={{ p: 2, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Zap size={16} style={{ color: '#a78bfa' }} />
            <Typography variant="subtitle2" fontWeight={700} color="text.primary">
              {t('scoring.crossDimTitle')}
            </Typography>
            <Typography variant="body2" fontWeight={700} sx={{
              ml: 'auto',
              color: scoring.crossDim.total > 0 ? '#22c55e' : scoring.crossDim.total < 0 ? '#ef4444' : 'text.secondary',
            }}>
              {scoring.crossDim.total > 0 ? '+' : ''}{scoring.crossDim.total} pts
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {scoring.crossDim.blastRadiusPenalty !== 0 && (
              <CrossDimChip
                label={t('scoring.crossDim.blastRadius')}
                pts={scoring.crossDim.blastRadiusPenalty}
                tooltip={t('scoring.crossDim.blastRadiusTip')}
                onClick={() => runCrossDim(CROSS_DIM_ACTIONS.blastRadius)}
              />
            )}
            {scoring.crossDim.prAdjacencyPenalty !== 0 && (
              <CrossDimChip
                label={t('scoring.crossDim.prAdjacency')}
                pts={scoring.crossDim.prAdjacencyPenalty}
                tooltip={t('scoring.crossDim.prAdjacencyTip')}
                onClick={() => runCrossDim(CROSS_DIM_ACTIONS.prAdjacency)}
              />
            )}
            {scoring.crossDim.taintAdjacencyPenalty !== 0 && (
              <CrossDimChip
                label={t('scoring.crossDim.taintAdjacency')}
                pts={scoring.crossDim.taintAdjacencyPenalty}
                tooltip={t('scoring.crossDim.taintAdjacencyTip')}
                onClick={() => runCrossDim(CROSS_DIM_ACTIONS.taintAdjacency)}
              />
            )}
            {scoring.crossDim.pentestVerdictModifier !== 0 && (
              <CrossDimChip
                label={t('scoring.crossDim.pentestVerdict')}
                pts={scoring.crossDim.pentestVerdictModifier}
                tooltip={t('scoring.crossDim.pentestVerdictTip')}
                onClick={() => runCrossDim(CROSS_DIM_ACTIONS.pentestVerdict)}
              />
            )}
            {scoring.crossDim.autofixCoverageBonus !== 0 && (
              <CrossDimChip
                label={t('scoring.crossDim.autofixCoverage')}
                pts={scoring.crossDim.autofixCoverageBonus}
                tooltip={t('scoring.crossDim.autofixCoverageTip')}
                onClick={() => runCrossDim(CROSS_DIM_ACTIONS.autofixCoverage)}
              />
            )}
          </Box>
        </Paper>
      )}

      {/* Grade spectrum — fixed bottom */}
      <Box sx={{ flexShrink: 0 }}>
        <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', mb: 1 }}>
          {GRADES.map(g => <Box key={g.grade} sx={{ flex: 1, bgcolor: g.color }} />)}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          {GRADES.map(g => (
            <Box key={g.grade} sx={{ flex: 1, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: g.color, fontWeight: 700 }}>{g.grade}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 13 }}>
                {g.min}–{g.max}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
          <sup>*</sup> {t('scoring.contextDisclaimer')}
        </Typography>
      </Box>
    </>
  )
}

/* ── Right Panel: Sub-vector Drill-down ────────── */

function SubVectorDetail({ sv, scoring, onBack, onNavigate }: {
  sv: SubVectorDef
  scoring: ScoringResult
  onBack: () => void
  onNavigate?: (section: string) => void
}) {
  const fixQueue = useFixQueue()
  const isDomain = sv.drillDownType === 'domain'

  // Find the computed sub-vector to get drill-down data
  const computedSv = useMemo(() => {
    for (const cat of scoring.categories) {
      for (const csv of cat.subVectors) {
        if (csv.def.id === sv.id) return csv
      }
    }
    return null
  }, [scoring, sv.id])

  const repoRows = computedSv?.repoScores ?? []
  const domainRows = computedSv?.domainScores ?? []

  // Filter explanations for this sub-vector
  const svExplanations = useMemo(() =>
    scoring.explanations.filter(e => e.subVectorId === sv.id),
    [scoring.explanations, sv.id],
  )

  const parentCat = getCategoryDefs().find(c => c.subVectors.some(s => s.id === sv.id))

  return (
    <>
      {/* Header — fixed */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <ButtonBase onClick={onBack} sx={{ p: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}>
          <ChevronLeft size={20} />
        </ButtonBase>
        <sv.icon size={20} style={{ color: sv.color }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700} color="text.primary">{sv.label}</Typography>
          {parentCat && (
            <Typography variant="body2" color="text.secondary">
              {sv.mode === 'scored'
                ? `${Math.round(sv.weight * 100)}% of ${parentCat.label}`
                : sv.mode === 'observing'
                  ? t('scoring.mode.observingLabel')
                  : t('scoring.mode.contextLabel')}
            </Typography>
          )}
        </Box>
        {sv.drillDownSection && onNavigate && (
          <Button
            size="small" variant="outlined"
            startIcon={<ExternalLink size={14} />}
            onClick={() => onNavigate(sv.drillDownSection!)}
            sx={{ textTransform: 'none', fontSize: 12 }}
          >
            {t('scoring.viewDetails')}
          </Button>
        )}
      </Box>

      {/* Drill-down table — when an Evidence panel exists it shares
          vertical space (flex 2 vs 1) instead of the table getting
          all the room and Evidence getting a 300px hard cap. */}
      <Paper variant="outlined" sx={{ flex: svExplanations.length > 0 ? 2 : 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 36px',
          gap: 1.5, px: 2.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
        }}>
          <Typography variant="body2" fontWeight={600} color="text.secondary">
            {isDomain ? t('common.domain') : t('common.repository')}
          </Typography>
          <Typography variant="body2" fontWeight={600} color="text.secondary">{t('common.detail')}</Typography>
          <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ textAlign: 'center' }}>{t('common.grade')}</Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {/* Repo drill-down */}
        {!isDomain && repoRows.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            {t('scoring.empty.noRepoData')}
          </Typography>
        )}
        {!isDomain && repoRows.filter(r => r.raw !== null).map(r => (
          <ButtonBase
            key={r.id}
            onClick={() => onNavigate?.(`_repo:${r.id}`)}
            sx={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 36px',
              gap: 1.5, px: 2.5, py: 1.25, width: '100%', textAlign: 'left',
              borderBottom: '1px solid', borderColor: 'divider',
              '&:last-child': { borderBottom: 'none' },
              '&:hover': { bgcolor: 'action.hover' },
              cursor: 'pointer',
            }}
          >
            <Typography variant="body2" fontWeight={500} color="text.primary" noWrap>{r.name}</Typography>
            <Typography variant="body2" color="text.secondary">{r.label}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <GradeCircle grade={r.grade} color={r.gradeColor} size={28} noRating={sv.mode !== 'scored'} />
            </Box>
          </ButtonBase>
        ))}

        {/* Domain drill-down — click navigates to the domain detail
            in DomainsView via `?domain=` query param (handled by
            DomainsView.useSearchParams). Without this the row was
            a visual dead-end. */}
        {isDomain && domainRows.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            {t('scoring.empty.noDomainData')}
          </Typography>
        )}
        {isDomain && domainRows.filter(r => r.raw !== null).map(r => (
          <ButtonBase
            key={r.id}
            onClick={() => onNavigate?.(`_domains?domain=${encodeURIComponent(r.name)}`)}
            sx={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 36px',
              gap: 1.5, px: 2.5, py: 1.25, width: '100%', textAlign: 'left',
              borderBottom: '1px solid', borderColor: 'divider',
              '&:last-child': { borderBottom: 'none' },
              '&:hover': { bgcolor: 'action.hover' },
              cursor: 'pointer',
            }}
          >
            <Typography variant="body2" fontWeight={500} color="text.primary" noWrap sx={{ fontFamily: 'monospace' }}>{r.name}</Typography>
            <Typography variant="body2" color="text.secondary">{r.label}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <GradeCircle grade={r.grade} color={r.gradeColor} size={28} noRating={sv.mode !== 'scored'} />
            </Box>
          </ButtonBase>
        ))}
        </Box>
      </Paper>

      {/* Evidence — per-finding explanations. Each row navigates to
          the unified Fix Queue scoped to that finding so the operator
          can act on the penalty directly instead of just reading it.
          Shares vertical space with the drill-down table (flex 1 vs
          table's flex 2) instead of the previous 300px hard cap. */}
      {svExplanations.length > 0 && (
        <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} color="text.primary">
              {t('scoring.evidence')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {svExplanations.length} {t('scoring.findings')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontStyle: 'italic' }}>
              {t('scoring.evidenceClickHint')}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {svExplanations.map((e, i) => (
              <ButtonBase
                key={i}
                onClick={() => fixQueue.open({ filter: 'all', initialItemId: e.findingId })}
                sx={{
                  display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px',
                  gap: 1.5, px: 2.5, py: 1, alignItems: 'center', width: '100%', textAlign: 'left',
                  borderBottom: '1px solid', borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' },
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.primary" fontWeight={500} noWrap>
                    {e.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {e.reason}
                  </Typography>
                </Box>
                <ConfidenceBadge level={e.confidenceLevel} />
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  -{e.basePenalty.toFixed(1)}
                </Typography>
                <Typography variant="body2" fontWeight={700} sx={{
                  textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  color: e.effectivePenalty > 5 ? '#ef4444' : e.effectivePenalty > 2 ? '#f97316' : '#eab308',
                }}>
                  -{e.effectivePenalty.toFixed(1)}
                </Typography>
              </ButtonBase>
            ))}
          </Box>
        </Paper>
      )}
    </>
  )
}

function ConfidenceBadge({ level }: { level: 'L0' | 'L1' | 'L2' }) {
  // L0 = inferred only (e.g. config heuristic), L1 = corroborated by
  // one source, L2 = confirmed by multi-source / live verification.
  // Tooltip surfaces the meaning so operators don't have to guess.
  const config = {
    L0: {
      label: 'L0', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',
      tipKey: 'scoring.confidence.l0', tipFallback: 'L0 — inferred from a single static signal; not yet verified.',
    },
    L1: {
      label: 'L1', color: '#eab308', bg: 'rgba(234,179,8,0.1)',
      tipKey: 'scoring.confidence.l1', tipFallback: 'L1 — corroborated by one independent source.',
    },
    L2: {
      label: 'L2', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',
      tipKey: 'scoring.confidence.l2', tipFallback: 'L2 — multi-source or live-DAST verified — penalty applies at full weight.',
    },
  }[level]
  return (
    <Tooltip title={tOr(config.tipKey, config.tipFallback)}>
      <Box sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        px: 1, py: 0.25, borderRadius: 1,
        bgcolor: config.bg, border: '1px solid', borderColor: `${config.color}55`,
        cursor: 'help',
      }}>
        <Typography variant="caption" fontWeight={700} sx={{ color: config.color, fontSize: 13 }}>
          {config.label}
        </Typography>
      </Box>
    </Tooltip>
  )
}

function CrossDimChip({
  label, pts, tooltip, onClick,
}: {
  label: string
  pts: number
  tooltip?: string
  onClick?: () => void
}) {
  const inner = (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75,
        px: 1.5, py: 0.5, borderRadius: 2,
        bgcolor: pts > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: '1px solid',
        borderColor: pts > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.15s, transform 0.15s',
        '&:hover': onClick ? {
          bgcolor: pts > 0 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
          transform: 'translateY(-1px)',
        } : undefined,
        '&:focus-visible': onClick ? {
          outline: '2px solid #a78bfa', outlineOffset: 2,
        } : undefined,
      }}
    >
      <Typography variant="caption" color="text.primary" sx={{ fontSize: 13, fontWeight: 600 }}>{label}</Typography>
      <Typography variant="caption" fontWeight={700} sx={{
        color: pts > 0 ? '#22c55e' : '#ef4444',
        fontSize: 12,
      }}>
        {pts > 0 ? '+' : ''}{pts}
      </Typography>
      {onClick && <ExternalLink size={11} style={{ opacity: 0.5 }} />}
    </Box>
  )
  return tooltip ? <Tooltip title={tooltip}>{inner}</Tooltip> : inner
}
