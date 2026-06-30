import { useMemo, useState } from 'react'
import { colors, softBg } from '@/styles/designTokens'
import type { PostureSnapshot } from '@lib/engine'
import { StatusDot } from '@atoms/StatusDot'
import { t } from '@lib/i18n';

// PostureSnapshotChart — 90-day overlay of score + finding count +
// asset count. Pure SVG, same pattern as MiniTrendChart and
// AttackPathGraph (no chart library dep).
//
// Three series sharing the X axis (snapshot_date) but with two Y
// axes:
//   - LEFT axis: overall_display (0-900 Bitsight range, normalised)
//   - RIGHT axis: counts (asset_count, finding_count_total) shown
//                  as bars + line; same scale because the operator
//                  reads "are findings growing while score drops?"
//
// Interaction: hover any X column → tooltip with all three values
// + date. Click a column → fire onClick(snapshot) so callers can
// route to that day's drill-down. (Caller controls behaviour; the
// chart is purely presentational beyond the hover state.)
//
// Empty / single-point input is rendered as an empty-state hint —
// the trend only makes sense at >= 2 datapoints.

export interface PostureSnapshotChartProps {
  snapshots: PostureSnapshot[]
  /** Pixel height of the SVG. Width fills container. */
  height?: number
  onClick?: (s: PostureSnapshot) => void
}

interface Point {
  x: number
  yScore: number
  yFindings: number
  yAssets: number
  raw: PostureSnapshot
}

const PADDING = { top: 16, right: 32, bottom: 28, left: 36 }

export function PostureSnapshotChart({ snapshots, height = 200, onClick }: PostureSnapshotChartProps) {
  // Backend returns newest-first; the chart reads left-to-right
  // (oldest-to-newest), so reverse once at the top.
  const ordered = useMemo(
    () => [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
    [snapshots],
  )
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const width = 800
  if (ordered.length < 2) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--mui-palette-text-secondary, #94a3b8)',
        fontSize: 12, fontStyle: 'italic',
      }}>
        {t('posture.trendBuilding')}
      </div>
    )
  }

  // Variance check — when the org just started or has been quiet
  // for the whole window, all 3 series read the same value every
  // day and the chart looks like 23 identical bars (operator 2026-
  // 05-23: "我看表都一樣啊"). Replace with a "stable" summary card
  // so the operator sees the *flat* state explicitly instead of
  // misreading the chart as broken.
  const scoreVals = ordered.map(s => s.overall_display)
  const assetVals = ordered.map(s => s.asset_count)
  const findingVals = ordered.map(s => s.finding_count_total)
  const allFlat =
    new Set(scoreVals).size === 1 &&
    new Set(assetVals).size === 1 &&
    new Set(findingVals).size === 1
  if (allFlat) {
    const oldest = ordered[0]
    const newest = ordered[ordered.length - 1]
    return (
      <div style={{
        height, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: 'var(--mui-palette-text-secondary, #94a3b8)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mui-palette-text-primary)' }}>
          {t('posture.stableTitle')} · {ordered.length} {t('posture.daysNoChange')}
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
          <span><span style={{ color: 'var(--mui-palette-text-secondary)' }}>{t('common.score')}</span> <strong style={{ color: 'var(--mui-palette-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{scoreVals[0]}</strong></span>
          <span><span style={{ color: 'var(--mui-palette-text-secondary)' }}>{t('nav.assets')}</span> <strong style={{ color: 'var(--mui-palette-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{assetVals[0]}</strong></span>
          <span><span style={{ color: 'var(--mui-palette-text-secondary)' }}>{t('nav.findings')}</span> <strong style={{ color: 'var(--mui-palette-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{findingVals[0]}</strong></span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--mui-palette-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {oldest.snapshot_date.slice(0, 10)} — {newest.snapshot_date.slice(0, 10)}
        </div>
      </div>
    )
  }

  const innerW = width - PADDING.left - PADDING.right
  const innerH = height - PADDING.top - PADDING.bottom

  // Two y-scales — score uses 0-100 (already display-scaled by
  // backend), counts use [0, max(asset+finding)] so both bars + line
  // share the right axis.
  const scoreMin = 0
  const scoreMax = 100
  const maxAssets = Math.max(...ordered.map(s => s.asset_count), 1)
  const maxFindings = Math.max(...ordered.map(s => s.finding_count_total), 1)
  const countMax = Math.max(maxAssets, maxFindings)

  const points: Point[] = ordered.map((s, i) => {
    const x = PADDING.left + (i / (ordered.length - 1)) * innerW
    const yScore = PADDING.top + (1 - (s.overall_display - scoreMin) / (scoreMax - scoreMin)) * innerH
    const yFindings = PADDING.top + (1 - s.finding_count_total / countMax) * innerH
    const yAssets = PADDING.top + (1 - s.asset_count / countMax) * innerH
    return { x, yScore, yFindings, yAssets, raw: s }
  })

  const scorePath = 'M ' + points.map(p => `${p.x},${p.yScore}`).join(' L ')
  const scoreArea = scorePath +
    ` L ${points[points.length - 1].x},${height - PADDING.bottom}` +
    ` L ${points[0].x},${height - PADDING.bottom} Z`
  const findingsPath = 'M ' + points.map(p => `${p.x},${p.yFindings}`).join(' L ')

  // Bar width = column slot - 30% gap. Cap so a 90-bar chart still
  // shows individual bars instead of a solid block.
  const colW = innerW / ordered.length
  const barW = Math.max(2, Math.min(colW * 0.7, 14))

  // Score colour follows direction: green when latest > first,
  // amber when flat, red when dropping. Same heuristic as
  // MiniTrendChart — operator reads colour before reading numbers.
  const scoreDelta = ordered[ordered.length - 1].overall_display - ordered[0].overall_display
  const scoreColor = scoreDelta > 1
    ? colors.semantic.success
    : scoreDelta < -1
      ? colors.semantic.danger
      : colors.semantic.warning

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHoverIdx(null)}
        role="img" aria-label={t('posture.snapshotChartLabel')}
      >
        <defs>
          <linearGradient id="postureTrendArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={scoreColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={scoreColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Y grid (4 horizontal lines for score: 25/50/75/100) */}
        {[25, 50, 75, 100].map(v => {
          const y = PADDING.top + (1 - v / 100) * innerH
          return (
            <g key={v}>
              <line x1={PADDING.left} y1={y} x2={width - PADDING.right} y2={y}
                stroke="var(--mui-palette-divider, #e2e8f0)" strokeWidth={0.5} strokeDasharray="2 4" />
              <text x={PADDING.left - 6} y={y + 3}
                textAnchor="end" fontSize={12} fill="var(--mui-palette-text-secondary, #94a3b8)"
                style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</text>
            </g>
          )
        })}

        {/* Asset count bars (background series, soft tech tint) */}
        {points.map((p, i) => {
          const barH = (height - PADDING.bottom) - p.yAssets
          if (barH <= 0) return null
          return (
            <rect
              key={`asset-${i}`}
              x={p.x - barW / 2}
              y={p.yAssets}
              width={barW}
              height={barH}
              fill={softBg(colors.tech, 0.22)}
              stroke={colors.tech}
              strokeOpacity={0.4}
              strokeWidth={0.5}
            />
          )
        })}

        {/* Score series — area + line */}
        <path d={scoreArea} fill="url(#postureTrendArea)" />
        <path d={scorePath} fill="none" stroke={scoreColor} strokeWidth={2} />

        {/* Findings series — dashed line, severity tone */}
        <path d={findingsPath} fill="none"
          stroke={colors.semantic.warning} strokeWidth={1.5} strokeDasharray="4 3" />

        {/* Hover hit-targets (transparent rects, one per column) */}
        {points.map((p, i) => (
          <rect
            key={`hit-${i}`}
            x={p.x - colW / 2}
            y={PADDING.top}
            width={colW}
            height={innerH}
            fill="transparent"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
            onMouseEnter={() => setHoverIdx(i)}
            onClick={() => onClick?.(p.raw)}
          />
        ))}

        {/* Hover indicator + dot */}
        {hoverIdx !== null && (() => {
          const p = points[hoverIdx]
          return (
            <g>
              <line x1={p.x} x2={p.x} y1={PADDING.top} y2={height - PADDING.bottom}
                stroke="var(--mui-palette-text-secondary, #94a3b8)"
                strokeWidth={0.5} strokeDasharray="2 2" />
              <circle cx={p.x} cy={p.yScore} r={3.5} fill={scoreColor} stroke="white" strokeWidth={1} />
              <circle cx={p.x} cy={p.yFindings} r={3} fill={colors.semantic.warning} stroke="white" strokeWidth={1} />
            </g>
          )
        })()}

        {/* X axis ticks — start, mid, end (avoid clutter for 90 pts) */}
        {[0, Math.floor(points.length / 2), points.length - 1].map((idx, k) => {
          const p = points[idx]
          const dateLabel = p.raw.snapshot_date.slice(0, 10)
          return (
            <text key={`tick-${k}`} x={p.x} y={height - 8}
              textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}
              fontSize={12} fill="var(--mui-palette-text-secondary, #94a3b8)"
              style={{ fontVariantNumeric: 'tabular-nums' }}>{dateLabel}</text>
          )
        })}
      </svg>

      {/* Tooltip — absolutely positioned so it doesn't push the
          SVG width around. Renders to the side of the hover column
          to stay inside the container. */}
      {hoverIdx !== null && (() => {
        const p = points[hoverIdx]
        const flip = (p.x / width) > 0.7 // right-align when near right edge
        return (
          <div style={{
            position: 'absolute',
            top: PADDING.top + 4,
            left: flip ? undefined : `calc(${(p.x / width) * 100}% + 8px)`,
            right: flip ? `calc(${100 - (p.x / width) * 100}% + 8px)` : undefined,
            background: 'var(--mui-palette-background-paper, #1e293b)',
            border: '1px solid var(--mui-palette-divider, #334155)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--mui-palette-text-primary, #f8fafc)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{p.raw.snapshot_date.slice(0, 10)}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Dot color={scoreColor} />
              <span>{t('common.score')}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {p.raw.overall_display}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Dot color={colors.semantic.warning} />
              <span>{t('nav.findings')}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {p.raw.finding_count_total}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Dot color={colors.tech} />
              <span>{t('nav.assets')}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {p.raw.asset_count}
              </span>
            </div>
            {p.raw.kev_count > 0 && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Dot color={colors.severity.critical} />
                <span>KEV</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colors.severity.critical }}>
                  {p.raw.kev_count}
                </span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Legend — bottom-right corner */}
      <div style={{
        position: 'absolute', right: 8, top: 4,
        display: 'flex', gap: 12, fontSize: 12,
        color: 'var(--mui-palette-text-secondary, #94a3b8)',
      }}>
        <LegendItem color={scoreColor} label={t('common.score')} />
        <LegendItem color={colors.semantic.warning} label={t('nav.findings')} dashed />
        <LegendItem color={colors.tech} label={t('nav.assets')} bar />
      </div>
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return <StatusDot color={color} size={8} />
}

function LegendItem({ color, label, dashed, bar }: { color: string; label: string; dashed?: boolean; bar?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {bar ? (
        <span style={{
          width: 10, height: 8,
          background: softBg(color, 0.22),
          border: `1px solid ${color}`,
        }} />
      ) : (
        <span style={{
          width: 14, height: 0,
          borderTop: dashed ? `2px dashed ${color}` : `2px solid ${color}`,
        }} />
      )}
      <span>{label}</span>
    </span>
  )
}
