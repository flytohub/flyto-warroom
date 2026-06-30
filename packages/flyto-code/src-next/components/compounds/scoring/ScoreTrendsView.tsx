/**
 * ScoreTrendsView — score history + sector benchmark.
 *
 * Renamed from `ScoringAuditView` 2026-05-22 Phase 1 cleanup. The
 * old name carried "audit" semantics that didn't match the page
 * content (it's a benchmark + trend view, not a hash-chain audit).
 * Both file + export now match the UI label.
 *
 * Why this page exists (2026-05-19 redesign):
 *   The previous version was a per-domain hash-chain forensic
 *   inspector. Operator feedback:
 *     - "這頁面要幹嗎 設計好醜" — 99% of users had no use for it.
 *     - "不要直接看 domain 會被告 是要看產業別" — surfacing
 *       per-domain ratings is a legal liability, same risk that
 *       pushed /explore to sign-in-only.
 *
 * New design — fully aggregate, zero PII / third-party-domain exposure:
 *   - Top stat row: org's current grade + delta this week.
 *   - Org timeline: grade-change events (upgrade / stable / downgrade)
 *     for the org *itself* — no domain names, no scanner identity.
 *   - Sector baseline: where the org sits in its declared industry
 *     sector (P50 / P90 from peer_baseline_snapshots). Surfaces
 *     positioning without naming peers.
 *
 * The per-domain hash-chain endpoints are intact at the API layer —
 * compliance auditors can still query them via the engine — but
 * they're no longer surfaced in this view.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import {
  Box, Typography, Paper, Chip, Skeleton, Tooltip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { TrendingUp, TrendingDown, Minus, Users, Award, Activity } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  getComputedScore,
  getOrgScoreEvents,
  getPeerBaseline,
  getUnifiedScoreHistory,
  listPeerCorpus,
  type ScoreEvent,
  type PeerBaselineSnapshot,
  type PeerCorpusSectorEntry,
} from '@lib/engine'
import { TrendChart } from '@compounds/_shared'
import { QueryError } from '@atoms/QueryError'
import { JellyCard } from '@atoms/JellyCard'
import { StatTile } from '@atoms/StatTile'
import { MONO, BRAND, techGrid, techTile, TechEyebrow, ConsoleSectionLabel } from '@atoms/techConsole'

const GRADE_TONE: Record<string, string> = {
  A: '#22c55e', B: '#84cc16', C: '#eab308', D: '#f97316', F: '#ef4444',
}
function gradeTone(grade?: string | null): string {
  if (!grade) return '#94a3b8'
  const k = grade.toUpperCase()[0]
  return GRADE_TONE[k] ?? '#94a3b8'
}

function dateLabel(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function ScoreTrendsView() {
  const { org } = useOrg()
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const orgId = org?.id
  // Sector is plumbed via the same cast pattern the other compounds
  // use (industrySector lives on org but isn't yet exposed in the
  // exported Organization type). Lowercased to match the PeerSector
  // enum the backend speaks.
  const orgSector = (org as { industrySector?: string } | undefined)
    ?.industrySector?.toLowerCase()

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
  const eventsQ = useQuery({
    queryKey: qk.scoring.scoreEvents(orgId, 90),
    queryFn: () => getOrgScoreEvents(orgId!, 90),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
  const peerQ = useQuery({
    queryKey: qk.scoring.peerBaseline(orgId, orgSector),
    queryFn: () => getPeerBaseline(orgId!, orgSector!),
    enabled: !!orgId && !!orgSector,
    staleTime: 60 * 60_000,
  })
  // Org-agnostic corpus coverage — one fetch, all sectors. The
  // org's own sector gets highlighted in the table so the operator
  // can see "I'm here, in this row" without us naming a single peer.
  const corpusQ = useQuery({
    queryKey: qk.scoring.peerCorpus(),
    queryFn: () => listPeerCorpus(),
    enabled: !!orgId,
    staleTime: 60 * 60_000,
    retry: false,
  })
  // 90-day unified score line — same source + cache key the manager
  // view uses, so the engineer/manager surfaces share one fetch.
  const histQ = useQuery({
    queryKey: qk.scoring.scoreHistory(orgId, 90),
    queryFn: () => getUnifiedScoreHistory(orgId!, 90),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const overall = scoreQ.data
  // A3-F2 (Codex review prompt of 277b745 → 20333d9): the same
  // discriminator the other A3 surfaces use. `undefined` is
  // tolerated as truthy during the rollout window. Pre-A3 the
  // three StatCards below used `?? '—'` / `?? 0` fallbacks that
  // silently rendered an unscored org as "grade —, score 0,
  // Below median sector position" — exactly the fake worst-tier
  // pattern A3 was supposed to eliminate.
  const hasScore =
    !!overall &&
    overall.score_available !== false &&
    overall.overall_grade != null &&
    overall.overall_raw != null
  const events = eventsQ.data?.events ?? []
  const delta7d = useMemo(() => computeDelta(events, 7), [events])

  // 90-day score line for the trend chart — mirrors the manager view's
  // derivation (sort ascending by computedAt, round overallDisplay).
  const trend = useMemo(() => {
    const sortedAsc = [...(histQ.data?.entries ?? [])].sort(
      (a, b) => new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime(),
    )
    return {
      categories: sortedAsc.map((e) => dateLabel(e.computedAt)),
      values: sortedAsc.map((e) => Math.round(e.overallDisplay)),
    }
  }, [histQ.data])

  if (scoreQ.isError) {
    return (
      <Box sx={{ height: '100%', overflow: 'auto' }}>
        <QueryError
          error={scoreQ.error}
          onRetry={scoreQ.refetch}
          label={t('scoreTrends.label')}
        />
      </Box>
    )
  }

  return (
    <Box sx={{
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Fixed header */}
      <Box sx={{
        flexShrink: 0,
        px: { xs: 2, md: 4 },
        pt: { xs: 2, md: 3 },
        pb: 2,
        borderTop: `2px solid ${BRAND}`,
        borderBottom: '1px solid',
        borderColor: 'divider',
        ...techGrid(dark),
        '& > *': { position: 'relative', zIndex: 1 },
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography className="text-3xl leading-none font-semibold tracking-tight">
            {t('scoreTrends.title')}
          </Typography>
          <TechEyebrow icon={<Activity size={12} />}>{t('hardcoded.trend.matrix.dbdfb5c6')}</TechEyebrow>
        </Box>
        <Typography
          className="ml-0.5 mt-1 text-base font-medium"
          color="text.secondary"
        >
          {t('scoreTrends.subtitle')}
        </Typography>
      </Box>

      {/* Scrollable body */}
      <Box sx={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        px: { xs: 2, md: 4 }, py: 3,
      }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Stat row */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
            gap: 2,
          }}>
            <JellyCard delay={0}><StatTile
              grow={false}
              valueSize={32}
              sx={techTile(hasScore ? gradeTone(overall!.overall_grade!) : '#94a3b8', dark)}
              label={t('scoreTrends.currentGrade')}
              // A3: explicit empty-state value, not fake '—'.
              // `value` is required string, so we render an em-dash
              // ONLY when the gate fires — paired with the
              // muted "No score yet" sub-copy via title (StatTile
              // already does grey tone for unknown grade).
              value={hasScore ? overall!.overall_grade! : t('scoreTrends.noScoreShort')}
              color={hasScore ? gradeTone(overall!.overall_grade!) : '#94a3b8'}
              loading={scoreQ.isLoading}
            /></JellyCard>
            <JellyCard delay={0.04}><StatTile
              grow={false}
              valueSize={32}
              sx={techTile(BRAND, dark)}
              label={t('scoreTrends.currentScore')}
              value={hasScore
                ? String(overall!.overall_display ?? overall!.overall_raw)
                : t('scoreTrends.noScoreShort')}
              loading={scoreQ.isLoading}
            /></JellyCard>
            <JellyCard delay={0.08}><StatTile
              grow={false}
              valueSize={32}
              sx={techTile(delta7d.tone ?? '#94a3b8', dark)}
              label={t('scoreTrends.delta7d')}
              value={delta7d.label}
              icon={delta7d.icon}
              color={delta7d.tone}
              loading={eventsQ.isLoading}
            /></JellyCard>
          </Box>

          {/* Score trend — 90-day unified-score line. Shares the
              manager view's TrendChart + chartTheme so both surfaces
              match. peer_baseline gives only current-value percentiles
              (not a time series), so this is a single-line chart — no
              fabricated sector series. */}
          <Box>
            <ConsoleSectionLabel label={t('scoreTrends.chartTitle')} />
            <JellyCard delay={0.1} noHover>
              <Paper variant="outlined" sx={{ p: 2, borderColor: 'divider' }}>
                {histQ.isLoading && (
                  <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 1 }} />
                )}
                {!histQ.isLoading && trend.values.length > 1 && (
                  <TrendChart
                    categories={trend.categories}
                    series={[{
                      name: t('scoreTrends.yourScore'),
                      data: trend.values,
                    }]}
                    /* values are 250–900 display scores (overallDisplay), so
                       the axis must span that band — a 0–100 axis pushed the
                       whole line off the top of the chart (looked empty). */
                    yMin={250}
                    yMax={900}
                    height={260}
                  />
                )}
                {!histQ.isLoading && trend.values.length <= 1 && (
                  <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      {t('scoreTrends.chartEmpty')}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </JellyCard>
          </Box>

          {/* Sector baseline — only shown if the org has declared a
              sector. Uses corpus aggregates (P50/P90) so no individual
              peer is named. */}
          {orgSector && (
            <JellyCard delay={0.12}>
            <SectorBaselineCard
              sector={orgSector}
              // A3: pass null (not 0) when no score. SectorBaselineCard
              // handles this — peerPosition collapses to 'unknown'
              // and "Your score" tile renders the em-dash sentinel.
              orgScore={hasScore ? overall!.overall_raw! : null}
              isLoading={peerQ.isLoading}
              isError={peerQ.isError}
              snapshots={peerQ.data?.latest}
            />
            </JellyCard>
          )}

          {!orgSector && (
            <Paper
              variant="outlined"
              sx={{ p: 2.5, borderColor: 'divider', display: 'flex', alignItems: 'flex-start', gap: 1.5 }}
            >
              <Users size={18} style={{ flexShrink: 0, opacity: 0.5, marginTop: 2 }} />
              <Box>
                <Typography variant="subtitle2" fontWeight={600}>
                  {t('scoreTrends.noSectorTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t('scoreTrends.noSectorHint')}
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Industry coverage — sector-level corpus table. No
              individual peer / domain ever named; only the curated
              sector list + aggregate percentiles + sample size. */}
          <Box>
            <ConsoleSectionLabel
              label={t('scoreTrends.industryCoverage')}
              suffix={t('scoreTrends.aggregateOnly')}
            />
            <JellyCard delay={0.14} noHover>
              <SectorCoverageTable
                data={corpusQ.data?.sectors}
                isLoading={corpusQ.isLoading}
                isError={corpusQ.isError}
                ownSector={orgSector}
                // A3: pass undefined when no score, NOT 0. Pre-A3
                // this was `?? undefined` which already worked for
                // null, but tightening to `hasScore` matches the
                // rest of the gate pattern.
                orgScore={hasScore ? overall!.overall_raw! : undefined}
              />
            </JellyCard>
          </Box>

          {/* Timeline */}
          <Box>
            <ConsoleSectionLabel
              label={t('scoreTrends.timeline')}
              suffix={t('scoreTrends.last90')}
            />
            <JellyCard delay={0.16} noHover>
            <Paper variant="outlined" sx={{ borderColor: 'divider' }}>
              {eventsQ.isLoading && (
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {[0, 1, 2].map((i) => <Skeleton key={i} variant="text" height={36} />)}
                </Box>
              )}
              {!eventsQ.isLoading && eventsQ.isError && (
                <Box sx={{ p: 2 }}>
                  <QueryError
                    error={eventsQ.error}
                    onRetry={eventsQ.refetch}
                    compact
                    label={t('scoreTrends.eventsLabel')}
                  />
                </Box>
              )}
              {!eventsQ.isLoading && !eventsQ.isError && events.length === 0 && (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('scoreTrends.empty')}
                  </Typography>
                </Box>
              )}
              {!eventsQ.isLoading && !eventsQ.isError && events.length > 0 && (
                <Box>
                  {events.map((e, idx) => (
                    <TimelineRow key={idx} event={e} last={idx === events.length - 1} />
                  ))}
                </Box>
              )}
            </Paper>
            </JellyCard>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// ── Subcomponents ──────────────────────────────────────────────

function TimelineRow({ event, last }: { event: ScoreEvent; last: boolean }) {
  const dirIcon =
    event.direction === 'upgrade' ? <TrendingUp size={14} /> :
    event.direction === 'downgrade' ? <TrendingDown size={14} /> :
    <Minus size={14} />
  const dirTone =
    event.direction === 'upgrade' ? '#22c55e' :
    event.direction === 'downgrade' ? '#ef4444' :
    '#64748b'
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1.5,
        borderBottom: last ? 'none' : '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ color: dirTone, flexShrink: 0 }}>{dirIcon}</Box>
      <Box sx={{ minWidth: 92, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, fontFamily: MONO }}>
          {dateLabel(event.date)}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Chip
          size="small"
          label={`${event.from_grade} ${event.from_score}`}
          sx={{
            fontWeight: 600, fontFamily: MONO,
            bgcolor: `${gradeTone(event.from_grade)}1a`,
            color: gradeTone(event.from_grade),
          }}
        />
        <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>→</Typography>
        <Chip
          size="small"
          label={`${event.to_grade} ${event.to_score}`}
          sx={{
            fontWeight: 600, fontFamily: MONO,
            bgcolor: `${gradeTone(event.to_grade)}1a`,
            color: gradeTone(event.to_grade),
          }}
        />
      </Box>
      {event.reasons.length > 0 && (
        <Tooltip title={event.reasons.join(' · ')}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {event.reasons.join(' · ')}
          </Typography>
        </Tooltip>
      )}
    </Box>
  )
}

function SectorBaselineCard({ sector, orgScore, isLoading, isError, snapshots }: {
  sector: string
  // A3-F2: nullable. Pre-A3 the caller force-defaulted to 0,
  // which made an unscored org sit at the bottom of the corpus
  // distribution AND get a "Below median" badge — exactly the
  // fake worst-tier pattern.
  orgScore: number | null
  isLoading: boolean
  isError: boolean
  snapshots?: Record<number, PeerBaselineSnapshot>
}) {
  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5, borderColor: 'divider' }}>
        <Skeleton variant="text" width={180} height={28} />
        <Skeleton variant="rectangular" height={64} sx={{ mt: 1, borderRadius: 1 }} />
      </Paper>
    )
  }
  if (isError || !snapshots) {
    // Silent — sector baseline is optional. The fallback "no sector"
    // panel above already covers the case where the org didn't set one.
    return null
  }
  const p50 = snapshots[50]?.value
  const p90 = snapshots[90]?.value
  // A3: peerPosition stays 'unknown' when org has no score —
  // baseline tiles still render (operators can see the corpus
  // P50/P90 even before their own first scan) but the "your
  // score" tile shows an em-dash + the position label is the
  // neutral grey "Not yet positioned".
  const peerPosition =
    orgScore == null ? 'unknown' :
    p90 != null && orgScore >= p90 ? 'topDecile' :
    p50 != null && orgScore >= p50 ? 'aboveMedian' :
    p50 != null && orgScore < p50 ? 'belowMedian' :
    'unknown'
  const positionLabel: Record<typeof peerPosition, string> = {
    topDecile: t('scoreTrends.posTop10'),
    aboveMedian: t('scoreTrends.posAboveMed'),
    belowMedian: t('scoreTrends.posBelowMed'),
    unknown: t('scoreTrends.posUnknown'),
  }
  const positionTone: Record<typeof peerPosition, string> = {
    topDecile: '#22c55e',
    aboveMedian: '#84cc16',
    belowMedian: '#f97316',
    unknown: '#94a3b8',
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
        <Award size={18} style={{ color: positionTone[peerPosition], marginTop: 2, flexShrink: 0 }} />
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {sectorLabel(sector)}
            <Box component="span" sx={{
              ml: 1, fontSize: 12, fontWeight: 600,
              color: positionTone[peerPosition],
            }}>
              · {positionLabel[peerPosition]}
            </Box>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('scoreTrends.sectorHint')}
          </Typography>
        </Box>
      </Box>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
        gap: 2,
      }}>
        <BaselineTile label="P50 (median)" value={p50} />
        <BaselineTile label="P90 (top 10%)" value={p90} />
        <BaselineTile
          label={t('scoreTrends.yourScore')}
          value={orgScore}
          tone={positionTone[peerPosition]}
        />
      </Box>
    </Paper>
  )
}

// ── SectorCoverageTable ──────────────────────────────────────────
// Shows every industry the platform crawls — sample size, latest
// P50/P75/P90 of the unified score in that sector, and snapshot
// freshness. The org's own sector row is visually highlighted so
// the operator sees "I'm in this row" without us ever naming a
// single peer. Per `feedback_aikido_integration` + the /explore
// lockdown precedent: aggregate only, never per-domain.
function SectorCoverageTable({
  data, isLoading, isError, ownSector, orgScore,
}: {
  data?: PeerCorpusSectorEntry[]
  isLoading: boolean
  isError: boolean
  ownSector?: string
  orgScore?: number
}) {
  const reduced = useReducedMotion()
  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderColor: 'divider' }}>
        <Skeleton variant="text" height={28} sx={{ mb: 1 }} />
        {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="text" height={32} />)}
      </Paper>
    )
  }
  if (isError || !data || data.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5, borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">
          {t('scoreTrends.coverageUnavailable')}
        </Typography>
      </Paper>
    )
  }
  // Sort highest sample-size first so the most-trustworthy sectors
  // surface to the top — small corpora ride along but don't lead.
  const rows = [...data].sort((a, b) => b.domain_count - a.domain_count)
  const totalDomains = rows.reduce((acc, r) => acc + r.domain_count, 0)
  const lastSnap = rows
    .map(r => r.snapshot_date)
    .filter(Boolean)
    .sort()
    .pop()

  return (
    <Paper variant="outlined" sx={{ borderColor: 'divider', overflow: 'hidden' }}>
      {/* Summary strip — adds a subtle gradient + brand dot so the
          eye lands on it instead of skipping over plain text. */}
      <Box sx={{
        px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        background: 'linear-gradient(90deg, rgba(139,92,246,0.10), rgba(139,92,246,0.02))',
      }}>
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%', bgcolor: '#8b5cf6',
          boxShadow: '0 0 8px rgba(139,92,246,0.6)',
        }} />
        <Typography variant="body2" fontWeight={700} color="text.primary">
          {t('scoreTrends.coverageSummary')
            .replace('{sectors}', String(rows.length))
            .replace('{domains}', String(totalDomains))}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto', flexWrap: 'wrap' }}>
          <LegendDot color="#94a3b8" label="P50" />
          <LegendDot color="#64748b" label="P75" />
          <LegendDot color="#334155" label="P90" />
          {orgScore != null && <LegendDot color="#8b5cf6" label={t('scoreTrends.you')} ring />}
          {lastSnap && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
              · {lastSnap}
            </Typography>
          )}
        </Box>
      </Box>
      {/* Header row — two columns now (sector + sample) plus the
          full-width distribution viz column. Cleaner + visual. */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 0.6fr 3fr',
        gap: 2, px: 2, py: 1,
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', fontFamily: MONO }}>
          {t('scoreTrends.col.sector')}
        </Typography>
        <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', textAlign: 'right' }}>
          {t('scoreTrends.col.sample')}
        </Typography>
        <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', fontFamily: MONO }}>
          {t('scoreTrends.col.distribution')}
        </Typography>
      </Box>
      {rows.map((row, i) => {
        const isOwn = !!ownSector && row.key === ownSector
        return (
          <motion.div
            key={row.key}
            initial={reduced ? false : { opacity: 0, x: -8 }}
            animate={reduced ? undefined : { opacity: 1, x: 0 }}
            transition={reduced ? undefined : {
              duration: 0.4,
              delay: i * 0.04,
              ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.6fr 3fr',
                gap: 2, px: 2, py: 1.5,
                alignItems: 'center',
                borderBottom: '1px solid', borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
                ...(isOwn ? {
                  bgcolor: 'rgba(139,92,246,0.08)',
                  borderLeft: '3px solid #8b5cf6',
                  pl: 1.75,
                } : {}),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={isOwn ? 800 : 600} color="text.primary" noWrap>
                  {sectorLabel(row.key)}
                </Typography>
                {isOwn && (
                  <Chip
                    label={t('scoreTrends.youAreHere')}
                    size="small"
                    sx={{
                      height: 18, fontSize: 12, fontWeight: 700,
                      bgcolor: '#8b5cf6', color: '#fff',
                    }}
                  />
                )}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  textAlign: 'right',
                  fontFamily: MONO,
                  fontVariantNumeric: 'tabular-nums',
                  color: row.domain_count > 0 ? 'text.secondary' : 'text.secondary',
                  fontWeight: row.domain_count > 0 ? 600 : 400,
                  fontStyle: row.domain_count > 0 ? 'normal' : 'italic',
                }}
              >
                {row.domain_count > 0
                  ? row.domain_count
                  : t('scoreTrends.notProbed')}
              </Typography>
              {row.p50 != null || row.p75 != null || row.p90 != null ? (
                <SectorDistributionBar
                  p50={row.p50}
                  p75={row.p75}
                  p90={row.p90}
                  yourScore={isOwn ? orgScore : undefined}
                  animDelay={i * 0.04 + 0.1}
                />
              ) : (
                <Box sx={{
                  height: 28, display: 'flex', alignItems: 'center',
                  px: 1.5, borderRadius: 2, border: '1px dashed',
                  borderColor: 'divider',
                }}>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: 12, fontStyle: 'italic' }}>
                    {t('scoreTrends.awaitingSweep')}
                  </Typography>
                </Box>
              )}
            </Box>
          </motion.div>
        )
      })}
    </Paper>
  )
}

// LegendDot — tiny coloured circle + label, used in the summary
// strip so the operator can decode the markers below without a
// per-row legend.
function LegendDot({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{
        width: 8, height: 8, borderRadius: '50%',
        bgcolor: color,
        ...(ring ? { boxShadow: `0 0 0 2px ${color}55` } : {}),
      }} />
      <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
        {label}
      </Typography>
    </Box>
  )
}

// SectorDistributionBar — horizontal 250-900 range bar with subtle
// grade-tinted background gradient, tick marks at the grade
// boundaries, and dot markers at P50/P75/P90. When `yourScore` is
// supplied (own-sector row), a bright purple ringed dot pins your
// actual position so the row tells a full story without any text.
function SectorDistributionBar({
  p50, p75, p90, yourScore, animDelay = 0,
}: {
  p50?: number; p75?: number; p90?: number; yourScore?: number; animDelay?: number
}) {
  const reduced = useReducedMotion()
  const RANGE_LO = 250
  const RANGE_HI = 900
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - RANGE_LO) / (RANGE_HI - RANGE_LO)) * 100))
  // Grade boundaries on the 250-900 scale — visual ticks so the
  // operator's eye picks up "this P50 sits inside grade C" at a glance.
  const GRADE_TICKS = [
    { at: pct(370), color: '#ef4444' },
    { at: pct(490), color: '#f97316' },
    { at: pct(630), color: '#eab308' },
    { at: pct(730), color: '#22c55e' },
  ]
  const transition = reduced ? undefined : {
    duration: 0.6, delay: animDelay,
    ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  }
  return (
    <Box sx={{ position: 'relative', height: 44, display: 'flex', alignItems: 'center' }}>
      {/* Background track — soft gradient hints at the grade
          spectrum without screaming. Vertically centred inside the
          taller row so the numeric labels above/below have room to
          breathe without colliding with the next row. */}
      <Box sx={{
        position: 'absolute', left: 0, right: 0, top: 14, bottom: 14,
        borderRadius: 2,
        background: 'linear-gradient(90deg, rgba(239,68,68,0.10) 0%, rgba(249,115,22,0.10) 22%, rgba(234,179,8,0.10) 45%, rgba(34,197,94,0.10) 78%, rgba(34,197,94,0.18) 100%)',
        border: '1px solid', borderColor: 'divider',
      }} />
      {/* Grade boundary ticks — vertical hairlines */}
      {GRADE_TICKS.map((t) => (
        <Box key={t.at} sx={{
          position: 'absolute', left: `${t.at}%`, top: 18, bottom: 18,
          width: 1, bgcolor: t.color, opacity: 0.35,
        }} />
      ))}
      {/* Percentile + own-score markers. Animate in (scale 0 → 1 +
          fade) staggered so the row "draws itself" on mount. */}
      {p50 != null && (
        <Marker pctLeft={pct(p50)} color="#94a3b8" label="P50" value={p50} transition={transition} />
      )}
      {p75 != null && (
        <Marker pctLeft={pct(p75)} color="#64748b" label="P75" value={p75} transition={transition} />
      )}
      {p90 != null && (
        <Marker pctLeft={pct(p90)} color="#334155" label="P90" value={p90} transition={transition} />
      )}
      {yourScore != null && (
        <Marker
          pctLeft={pct(yourScore)}
          color="#8b5cf6"
          label={t('scoreTrends.you')}
          value={yourScore}
          highlight
          transition={transition}
        />
      )}
    </Box>
  )
}

function Marker({
  pctLeft, color, label, value, highlight, transition,
}: {
  pctLeft: number
  color: string
  label: string
  value: number
  highlight?: boolean
  transition?: { duration: number; delay: number; ease: [number, number, number, number] }
}) {
  const size = highlight ? 12 : 8
  // Pin the numeric label above the highlight dot and below the
  // non-highlight dots so when the markers cluster (which happens
  // when sectors all score similarly) the operator still sees the
  // actual numbers next to each dot — that's how you tell two
  // overlapping rows apart without zooming.
  const labelOffsetY = highlight ? -14 : 12
  return (
    <Tooltip title={`${label}: ${value}`} placement="top" arrow>
      <Box
        component={motion.div}
        initial={transition ? { opacity: 0, scale: 0 } : false}
        animate={transition ? { opacity: 1, scale: 1 } : undefined}
        transition={transition}
        sx={{
          position: 'absolute',
          left: `${pctLeft}%`,
          top: 0, bottom: 0,
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center',
          cursor: 'help',
          zIndex: highlight ? 3 : 2,
          pointerEvents: 'auto',
        }}
      >
        {/* The dot itself */}
        <Box sx={{
          width: size, height: size, borderRadius: '50%',
          bgcolor: color,
          ...(highlight ? {
            boxShadow: `0 0 0 3px ${color}33, 0 0 12px ${color}aa`,
            border: '2px solid #fff',
          } : {
            border: '1px solid rgba(255,255,255,0.4)',
          }),
        }} />
        {/* Inline numeric label — anchored absolute to the marker
            stack so the dot stays centred while the number floats
            above (own-score) or below (P50/75/90). Tabular-nums
            keeps the digits aligned across rows. */}
        <Box sx={{
          position: 'absolute',
          top: '50%',
          mt: `${labelOffsetY}px`,
          transform: 'translate(-50%, -50%)',
          left: '50%',
          px: 0.5, py: 0.1, borderRadius: 0.5,
          bgcolor: highlight ? color : 'background.paper',
          color: highlight ? '#fff' : color,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: MONO,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          border: `1px solid ${highlight ? color : `${color}88`}`,
          boxShadow: highlight ? `0 2px 6px ${color}55` : 'none',
        }}>
          {value}
        </Box>
      </Box>
    </Tooltip>
  )
}

function BaselineTile({ label, value, tone }: { label: string; value?: number | null; tone?: string }) {
  return (
    <Box sx={{
      px: 1.5, py: 1.25, borderRadius: 1.5,
      border: '1px solid', borderColor: 'divider',
      bgcolor: 'background.paper',
    }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}
      >
        {label}
      </Typography>
      <Typography sx={{
        fontSize: 22, fontWeight: 700, lineHeight: 1.1, mt: 0.5,
        color: tone ?? 'text.primary',
        fontFamily: MONO, fontVariantNumeric: 'tabular-nums',
      }}>
        {value != null ? value : '—'}
      </Typography>
    </Box>
  )
}

// [i18n key, English fallback] per sector — localized text lives in flyto-i18n.
const SECTOR_KEYS: Record<string, [string, string]> = {
  finance: ['sector.finance', 'Finance'],
  saas: ['sector.saas', 'SaaS'],
  retail: ['sector.retail', 'Retail'],
  healthcare: ['sector.healthcare', 'Healthcare'],
  gov: ['sector.gov', 'Government'],
  energy: ['sector.energy', 'Energy'],
  education: ['sector.education', 'Education'],
}
function sectorLabel(sector: string): string {
  const e = SECTOR_KEYS[sector]
  return e ? tOr(e[0], e[1]) : sector.charAt(0).toUpperCase() + sector.slice(1)
}

// ── Helpers ──────────────────────────────────────────────

function computeDelta(events: ScoreEvent[], days: number) {
  const cutoff = Date.now() - days * 86_400_000
  const recent = events.filter(e => Date.parse(e.date) >= cutoff)
  if (recent.length === 0) {
    return {
      label: t('common.noChange'),
      icon: <Minus size={20} style={{ opacity: 0.4 }} />,
      tone: undefined as string | undefined,
    }
  }
  const totalDelta = recent.reduce((acc, e) => acc + (e.to_score - e.from_score), 0)
  if (totalDelta === 0) {
    return {
      label: t('common.noChange'),
      icon: <Minus size={20} style={{ opacity: 0.4 }} />,
      tone: undefined as string | undefined,
    }
  }
  if (totalDelta > 0) {
    return {
      label: `+${totalDelta}`,
      icon: <TrendingUp size={20} />,
      tone: '#22c55e',
    }
  }
  return {
    label: `${totalDelta}`,
    icon: <TrendingDown size={20} />,
    tone: '#ef4444',
  }
}
