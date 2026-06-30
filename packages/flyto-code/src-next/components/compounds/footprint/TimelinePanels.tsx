/**
 * TimelineScrubber + RunProgressCard.
 *
 * Extracted from FootprintGraphView.tsx 2026-05-23.
 *
 * TimelineScrubber — bottom-of-canvas slider that filters the 3D
 * Scene to entities whose first_seen_at ≤ cursor. Cursor at the
 * latest entity by default; clicking right edge re-enables
 * "show everything" (null cursor). Below the slider, dots for
 * unique first_seen dates so operators see discovery rhythm.
 *
 * RunProgressCard — running-state empty card that shows live
 * counters + connector progress while the expansion is happening,
 * so the page doesn't feel dead between API ticks.
 */
import { useMemo } from 'react'
import {
  Box, Stack, Typography, Chip, Paper,
} from '@mui/material'
import type { FootprintEntity, FootprintRunRow } from '@lib/engine'
import { isFootprintRunActive } from '@lib/footprintRunState'
import type { ScenePalette } from './scene'
import { MAX_ROUNDS, TIER_BADGE } from './shared'
import { promotionTier, relationshipScore } from '@lib/engine'
import { t } from '@lib/i18n';

// Built at render time so translation reads the loaded table
// (config objects at module level run before init).
function runningConnectorLayers(): Array<{ label: string; source: string }> {
  return [
    { label: t('footprint.connector.websiteCrawl'), source: 'website_crawl' },
    { label: t('footprint.connector.whoisRdap'), source: 'whois_rdap' },
    { label: t('footprint.connector.ctLog'), source: 'ct_log_subdomain_walk' },
    { label: t('footprint.connector.lookalike'), source: 'lookalike_domain' },
    { label: t('footprint.connector.wayback'), source: 'wayback_cdx' },
    { label: t('footprint.connector.techStack'), source: 'tech_stack' },
    { label: t('footprint.connector.githubOrg'), source: 'github_org_search' },
    { label: t('footprint.connector.secEdgar'), source: 'sec_edgar' },
  ]
}


// ─── Timeline scrubber ──────────────────────────────────────────
//
// Bottom-of-canvas slider that filters Scene to entities whose
// first_seen_at ≤ cursor.

export interface TimelineScrubberProps {
  entities: FootprintEntity[]
  value: number | null
  onChange: (v: number | null) => void
  palette: ScenePalette
}


export function TimelineScrubber({ entities, value, onChange, palette }: TimelineScrubberProps) {
  // Bug #17 — strict ISO 8601 parse instead of locale-dependent
  // Date.parse. Backend emits canonical RFC3339 timestamps; if a
  // value doesn't match the expected shape we drop it rather than
  // letting browser-specific Date.parse heuristics in.
  const isoRE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
  const times = useMemo(() => {
    const ts: number[] = []
    for (const e of entities) {
      if (!e.first_seen_at || !isoRE.test(e.first_seen_at)) continue
      const t = new Date(e.first_seen_at).getTime()
      if (Number.isFinite(t)) ts.push(t)
    }
    ts.sort((a, b) => a - b)
    return ts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities])

  if (times.length === 0) return null
  const min = times[0]
  const max = times[times.length - 1]
  const cursor = value ?? max
  const span = Math.max(max - min, 1)
  const pct = ((cursor - min) / span) * 100

  const formatDate = (t: number) => {
    const d = new Date(t)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <Box sx={{
      position: 'absolute', bottom: 56, left: '50%',
      transform: 'translateX(-50%)',
      width: '56%', maxWidth: 600, minWidth: 320,
      bgcolor: palette.labelBg,
      border: `1px solid ${palette.labelBorder}`,
      backdropFilter: 'blur(6px)',
      borderRadius: 1.5,
      px: 1.25, py: 0.75,
      zIndex: 1,
    }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography sx={{ fontSize: 13, color: palette.labelColor, opacity: 0.75 }}>
          {t('footprint.timeline')} · {formatDate(min)} → {formatDate(max)}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.labelColor }}>
            {formatDate(cursor)}
          </Typography>
          {value !== null && (
            <Typography
              onClick={() => onChange(null)}
              sx={{ fontSize: 13, color: '#7c3aed', cursor: 'pointer', fontWeight: 500 }}
            >
              {t('footprint.timeline.clear')}
            </Typography>
          )}
        </Stack>
      </Stack>
      <Box sx={{ position: 'relative', height: 24 }}>
        {/* Track */}
        <Box sx={{
          position: 'absolute', top: 11, left: 0, right: 0, height: 2,
          bgcolor: palette.edgeColor, opacity: 0.3, borderRadius: 1,
        }} />
        {/* Filled track up to cursor */}
        <Box sx={{
          position: 'absolute', top: 11, left: 0, width: `${pct}%`, height: 2,
          bgcolor: '#7c3aed', borderRadius: 1,
        }} />
        {/* Dots per unique date */}
        {times.map((t, i) => {
          const dotPct = ((t - min) / span) * 100
          const isPast = t <= cursor
          return (
            <Box
              key={`${t}-${i}`}
              sx={{
                position: 'absolute', top: 8, left: `${dotPct}%`,
                width: 8, height: 8, borderRadius: '50%',
                transform: 'translateX(-50%)',
                bgcolor: isPast ? '#7c3aed' : palette.edgeColor,
                opacity: isPast ? 0.85 : 0.45,
                pointerEvents: 'none',
              }}
            />
          )
        })}
        {/* Invisible draggable input on top */}
        <input
          type="range"
          min={min}
          max={max}
          step={Math.max(Math.floor(span / 200), 1)}
          value={cursor}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer',
          }}
        />
      </Box>
    </Box>
  )
}

export function RunProgressCard({ entitiesSoFar, signalsSoFar, sourcesObserved, latestRun, recentEntities }: {
  entitiesSoFar: number
  signalsSoFar: number
  sourcesObserved: Set<string>
  latestRun?: FootprintRunRow | null
  recentEntities?: FootprintEntity[]
}) {
  const round = latestRun?.rounds_completed ?? 0
  const tokens = latestRun?.tokens_harvested ?? 0
  // Cap displayed round at MAX_ROUNDS so the UI doesn't render
  // "Round 5 of 3" if the engine ever bumps the cap.
  const displayRound = Math.max(1, Math.min(round + (isFootprintRunActive(latestRun) ? 1 : 0), MAX_ROUNDS))
  return (
    <Box sx={{ p: 3, maxWidth: 720, mx: 'auto', mt: 4 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{
              width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main',
              animation: 'pulse 1.5s ease-in-out infinite',
              '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
            }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t('footprint.mappingTitle')}
            </Typography>
          </Stack>
          <Chip size="small" label={t('footprint.roundOfTotal').replace('{n}', String(displayRound)).replace('{total}', String(MAX_ROUNDS))} color="primary" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`${entitiesSoFar} entities`} />
          <Chip size="small" label={`${signalsSoFar} signals`} />
          <Chip size="small" label={`${tokens} tokens harvested`} />
          <Chip size="small" label={`${sourcesObserved.size} sources active`} variant="outlined" />
        </Stack>
        <Stack spacing={0.75} sx={{ mt: 2 }}>
          {runningConnectorLayers().map(c => {
            const active = sourcesObserved.has(c.source)
            return (
              <Stack key={c.source} direction="row" alignItems="center" spacing={1}>
                <Box sx={{
                  width: 6, height: 6, borderRadius: '50%',
                  bgcolor: active ? 'primary.main' : 'text.secondary',
                  flexShrink: 0,
                }} />
                <Typography variant="caption" sx={{
                  fontSize: 13,
                  color: active ? 'text.primary' : 'text.secondary',
                  fontWeight: active ? 500 : 400,
                }}>
                  {c.label}
                </Typography>
                {active && <Chip size="small" label={t('footprint.connector.done')} sx={{ height: 18, fontSize: 12 }} variant="outlined" color="success" />}
              </Stack>
            )
          })}
        </Stack>
        {/* Live activity feed — terminal-style tape of the latest
            entities the expander just discovered. Updates in place
            on every polling tick so the operator sees actual data
            flowing rather than a generic spinner. */}
        {recentEntities && recentEntities.length > 0 && (
          <Box sx={{
            mt: 2,
            bgcolor: 'action.hover',
            borderRadius: 1,
            p: 1.5,
            fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace',
            maxHeight: 200,
            overflow: 'auto',
          }}>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.5, letterSpacing: '0.05em' }}>
              ▸ LIVE DISCOVERY TAPE
            </Typography>
            <Stack spacing={0.25}>
              {recentEntities.slice(0, 10).map(e => {
                const tier = promotionTier(e)
                const accent = (TIER_BADGE[tier] ?? TIER_BADGE.unknown).accent
                return (
                  <Stack key={e.id} direction="row" spacing={1.5} alignItems="baseline" sx={{ fontSize: 13 }}>
                    <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary', minWidth: 90, fontFamily: 'inherit' }}>
                      {e.source.slice(0, 12)}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 13, color: accent, minWidth: 70, fontFamily: 'inherit' }}>
                      {e.type}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 13, color: 'text.primary', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.canonical_name}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary', fontFamily: 'inherit', ml: 'auto' }}>
                      {relationshipScore(e)}
                    </Typography>
                  </Stack>
                )
              })}
            </Stack>
          </Box>
        )}

        <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary', display: 'block', mt: 2 }}>
          {t('footprint.runHint').replace('{n}', String(MAX_ROUNDS))}
        </Typography>
      </Paper>
    </Box>
  )
}
