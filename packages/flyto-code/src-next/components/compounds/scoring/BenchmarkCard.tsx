/**
 * BenchmarkCard — Peer benchmarking percentile display.
 * Shows the org's position relative to industry peers (p25/p50/p75/p90).
 */

import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { getOrgBenchmark } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';

export function BenchmarkCard() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data: benchmark, isLoading } = useQuery({
    queryKey: qk.scoring.benchmark(orgId),
    queryFn: () => getOrgBenchmark(orgId!),
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  })

  if (isLoading) {
    return (
      <Paper elevation={1} className="rounded-xl" sx={{ bgcolor: 'background.paper', p: 2.5 }}>
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
      </Paper>
    )
  }

  // fetcher catch→null = transport error / no sector configured.
  // The pre-A3 fall-through assumed this also covered "no score
  // yet" because the old backend returned a 4xx for no-score. A3
  // backend now returns 200 + `{score_available: false, org_score:
  // null, ...}` envelope, so we have to handle that case here too.
  if (!benchmark) {
    return (
      <Paper elevation={1} className="rounded-xl" sx={{ bgcolor: 'background.paper', p: 2.5 }}>
        <Box className="flex items-center gap-1.5 mb-2">
          <BarChart3 size={14} style={{ color: '#8b5cf6' }} />
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('scoring.benchmark')}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          {t('scoring.benchmarkNoSector')}
        </Typography>
      </Paper>
    )
  }

  // A3-F2 (Codex review prompt of 277b745 → 20333d9): explicit
  // no-score gate. Pre-A3 the silent `if (!bm) return null`
  // collapsed two completely different states (sector-not-
  // configured vs no-score-yet) into "render nothing". A3
  // backend now distinguishes them — `score_available === false`
  // means the engine has nothing to compare, regardless of
  // sector. Render an explicit empty state with the engine's
  // `message`. NOTE: do NOT rely on `org_score === 0` here —
  // 0 is a legitimate real low score per A3 hard rule #1.
  const hasScore =
    benchmark.score_available !== false &&
    benchmark.org_score != null &&
    benchmark.benchmark != null &&
    benchmark.percentile != null
  if (!hasScore) {
    return (
      <Paper elevation={1} className="rounded-xl" sx={{ bgcolor: 'background.paper', p: 2.5 }}>
        <Box className="flex items-center justify-between mb-2">
          <Box className="flex items-center gap-1.5">
            <BarChart3 size={14} style={{ color: '#8b5cf6' }} />
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('scoring.benchmark')}
            </Typography>
          </Box>
          {benchmark.sector && (
            <Chip label={benchmark.sector} size="small" sx={{ height: 20, fontSize: 12, fontWeight: 600 }} />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          {benchmark.message ?? t('scoring.benchmarkNoScore')}
        </Typography>
      </Paper>
    )
  }

  // Past the gate: benchmark.benchmark / percentile / org_score are
  // guaranteed populated. Non-null assertions document the contract
  // for the reader; the wire check above is the actual safety.
  const { sector, comparison } = benchmark
  const bm = benchmark.benchmark!
  const org_score = benchmark.org_score!
  const percentile = benchmark.percentile!
  const topPct = Math.max(1, 100 - percentile)

  // Trend icon
  const TrendIcon = comparison === 'above' ? TrendingUp : comparison === 'below' ? TrendingDown : Minus
  const trendColor = comparison === 'above' ? '#22c55e' : comparison === 'below' ? '#ef4444' : '#94a3b8'

  return (
    <Paper elevation={1} className="rounded-xl" sx={{ bgcolor: 'background.paper', p: 2.5 }}>
      <Box className="flex items-center justify-between mb-3">
        <Box className="flex items-center gap-1.5">
          <BarChart3 size={14} style={{ color: '#8b5cf6' }} />
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('scoring.benchmark')}
          </Typography>
        </Box>
        <Chip label={sector} size="small" sx={{ height: 20, fontSize: 12, fontWeight: 600 }} />
      </Box>

      {/* Percentile rank — hero number */}
      <Box className="flex items-center gap-3 mb-3">
        <Box sx={{ minWidth: 56 }}>
          <Typography sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: trendColor }}>
            {topPct}%
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
            {t('scoring.topPercentile')}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box className="flex items-center gap-1">
            <TrendIcon size={14} style={{ color: trendColor }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
              {benchmark.display_text}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Distribution bar — shows p25/p50/p75/p90 with org score marker */}
      <Box sx={{ position: 'relative', height: 24, mb: 1 }}>
        {/* Background bar */}
        <Box sx={{ position: 'absolute', inset: 0, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden' }}>
          {/* Gradient zones */}
          <Box sx={{ position: 'absolute', left: 0, width: `${(bm.p25 / 900) * 100}%`, height: '100%', bgcolor: '#ef444420' }} />
          <Box sx={{ position: 'absolute', left: `${(bm.p25 / 900) * 100}%`, width: `${((bm.p50 - bm.p25) / 900) * 100}%`, height: '100%', bgcolor: '#f9731620' }} />
          <Box sx={{ position: 'absolute', left: `${(bm.p50 / 900) * 100}%`, width: `${((bm.p75 - bm.p50) / 900) * 100}%`, height: '100%', bgcolor: '#eab30820' }} />
          <Box sx={{ position: 'absolute', left: `${(bm.p75 / 900) * 100}%`, width: `${((bm.p90 - bm.p75) / 900) * 100}%`, height: '100%', bgcolor: '#22c55e20' }} />
        </Box>

        {/* Percentile markers */}
        {[
          { value: bm.p25, label: 'P25' },
          { value: bm.p50, label: 'P50' },
          { value: bm.p75, label: 'P75' },
          { value: bm.p90, label: 'P90' },
        ].map(({ value, label }) => (
          <Box key={label} sx={{
            position: 'absolute', left: `${(value / 900) * 100}%`, top: 0, bottom: 0,
            borderLeft: '1px dashed', borderColor: 'divider', display: 'flex', alignItems: 'flex-end',
          }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', ml: 0.3, lineHeight: 1, fontWeight: 600 }}>{label}</Typography>
          </Box>
        ))}

        {/* Org score marker */}
        <Box sx={{
          position: 'absolute', left: `${(org_score / 900) * 100}%`, top: -2, bottom: -2,
          width: 3, borderRadius: 1, bgcolor: '#8b5cf6',
          boxShadow: '0 0 6px rgba(139,92,246,0.6)',
          transform: 'translateX(-1.5px)',
        }} />
      </Box>

      {/* Legend */}
      <Box className="flex items-center justify-between">
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>250</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
          {t('scoring.yourScore')}: <strong style={{ color: '#8b5cf6' }}>{org_score}</strong>
          {' · '}
          {t('scoring.sampleSize')}: {bm.sample_size}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>900</Typography>
      </Box>
    </Paper>
  )
}
