import { useMemo } from 'react'
import { alpha } from '@mui/material/styles'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { t } from '@lib/i18n';
import type { ConnectedRepo, RepoHealthSummary } from '@lib/engine'
import type { RepoScore } from '@hooks/useRepoScores'
import { getRepoScore } from '@hooks/useRepoScores'
import { SEVERITY_TONE, LETTER_GRADE_TONE } from '@lib/tokens/severity'
import { GRADE_COLORS, displayScore } from './types'

// --- SVG Charts ---

/**
 * HealthGauge — clean semi-circle gauge. Gradient arc from red→green,
 * large grade letter centered, score below. Minimal and readable.
 */
export function HealthGauge({ score, grade, prevScore }: { score: number; grade: string; prevScore?: number }) {
  const w = 200
  const h = 148
  const cx = w / 2
  const cy = 95
  const r = 78
  const stroke = 18
  const gradeColor = GRADE_COLORS[grade] ?? LETTER_GRADE_TONE[''].tone

  const halfCirc = Math.PI * r
  const progress = halfCirc * (score / 100)
  const remaining = halfCirc - progress

  // Indicator dot position on the arc
  const dotAngle = Math.PI - (score / 100) * Math.PI // π(left) → 0(right)
  const dotX = cx + r * Math.cos(dotAngle)
  const dotY = cy - r * Math.sin(dotAngle)

  // Trend
  const delta = prevScore !== undefined ? score - prevScore : undefined
  const trendUp = delta !== undefined && delta > 0
  const trendDown = delta !== undefined && delta < 0

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={SEVERITY_TONE.critical.tone} />
          <stop offset="30%" stopColor={SEVERITY_TONE.high.tone} />
          <stop offset="50%" stopColor={SEVERITY_TONE.medium.tone} />
          <stop offset="75%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor={LETTER_GRADE_TONE.A.tone} />
        </linearGradient>
        <filter id="dot-glow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Subtle glow behind progress arc */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={gradeColor} strokeWidth={stroke + 12}
        strokeLinecap="round" opacity={0.06}
        strokeDasharray={`${progress} ${remaining}`} />

      {/* Background track */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="var(--color-card-border)" strokeWidth={stroke}
        strokeLinecap="round" />

      {/* Progress arc — gradient */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="url(#gauge-grad)" strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${progress} ${remaining}`}
        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }} />

      {/* Indicator dot at current score position */}
      {score > 0 && (
        <circle cx={dotX} cy={dotY} r={5} fill="#fff" opacity={0.9}
          filter="url(#dot-glow)"
          style={{ transition: 'cx 1s cubic-bezier(0.4,0,0.2,1), cy 1s cubic-bezier(0.4,0,0.2,1)' }} />
      )}

      {/* Min / Max labels */}
      <text x={cx - r} y={cy + 22} textAnchor="middle" fill="currentColor" opacity={0.65}
        fontSize="13" fontWeight="700" fontFamily="inherit">300</text>
      <text x={cx + r} y={cy + 22} textAnchor="middle" fill="currentColor" opacity={0.65}
        fontSize="13" fontWeight="700" fontFamily="inherit">900</text>

      {/* Grade letter */}
      <text x={cx} y={cy - 28} textAnchor="middle" dominantBaseline="central"
        fill={gradeColor} fontSize="40" fontWeight="900" fontFamily="inherit"
        style={{ filter: `drop-shadow(0 0 8px ${gradeColor}30)` }}>{grade}</text>

      {/* Score + trend arrow */}
      <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="central"
        fill="var(--color-text-secondary)" fontSize="16" fontWeight="700" fontFamily="inherit">
        {displayScore(score)}
      </text>
      {trendUp && (
        <text x={cx + 30} y={cy - 2} textAnchor="start" dominantBaseline="central"
          fill={LETTER_GRADE_TONE.A.tone} fontSize="13" fontWeight="700" fontFamily="inherit">▲</text>
      )}
      {trendDown && (
        <text x={cx + 30} y={cy - 2} textAnchor="start" dominantBaseline="central"
          fill={SEVERITY_TONE.critical.tone} fontSize="13" fontWeight="700" fontFamily="inherit">▼</text>
      )}

      {/* Label */}
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central"
        fill="currentColor" opacity={0.6} fontSize="12" fontWeight="600"
        fontFamily="inherit" letterSpacing="0.08em">SCORE</text>
    </svg>
  )
}

/** Donut chart for grade distribution */
export function GradeDonut({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const grades = ['A', 'B', 'C', 'D', 'F'] as const
  const size = 140
  const cx = size / 2
  const cy = size / 2
  const radius = 50
  const innerRadius = 32

  const slices: Array<{ grade: string; count: number; startAngle: number; angle: number }> = []
  let runningAngle = -90
  for (const g of grades) {
    const count = distribution[g] || 0
    if (count === 0) continue
    const angle = (count / total) * 360
    slices.push({ grade: g, count, startAngle: runningAngle, angle })
    runningAngle += angle
  }

  function polarToCartesian(cxp: number, cyp: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cxp + r * Math.cos(rad), y: cyp + r * Math.sin(rad) }
  }

  function slicePath(s: { startAngle: number; angle: number }) {
    const endAngle = s.startAngle + s.angle
    const largeArc = s.angle > 180 ? 1 : 0

    const outerStart = polarToCartesian(cx, cy, radius, s.startAngle)
    const outerEnd = polarToCartesian(cx, cy, radius, endAngle)
    const innerStart = polarToCartesian(cx, cy, innerRadius, endAngle)
    const innerEnd = polarToCartesian(cx, cy, innerRadius, s.startAngle)

    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
      'Z',
    ].join(' ')
  }

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map(s => (
          <path
            key={s.grade}
            d={slicePath(s)}
            fill={GRADE_COLORS[s.grade]}
            opacity={0.85}
            style={{ transition: 'opacity 0.2s' }}
          >
            <title>{s.grade}: {s.count}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="central"
          fill="var(--color-text-primary)" fontSize="20" fontWeight="800" fontFamily="inherit">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central"
          fill="currentColor" opacity={0.3} fontSize="12" fontWeight="500" fontFamily="inherit">repos</text>
      </svg>
      <div className="flex flex-col gap-1">
        {grades.filter(g => (distribution[g] || 0) > 0).map(g => (
          <span key={g} className="flex items-center gap-1.5 text-xs">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: GRADE_COLORS[g], display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: GRADE_COLORS[g], fontWeight: 700 }}>{g}</span>
            <span>{distribution[g]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Stacked horizontal bar for security severities */
export function SecurityStackedBar({ critical, high, medium }: { critical: number; high: number; medium: number }) {
  const total = critical + high + medium
  if (total === 0) {
    return <div className="text-center text-xs text-text-secondary py-4" style={{ marginTop: 0 }}>{t('dashboard.noData')}</div>
  }

  const segments = [
    { label: t('dashboard.critical'), count: critical, color: SEVERITY_TONE.critical.tone },
    { label: t('dashboard.high'), count: high, color: SEVERITY_TONE.high.tone },
    { label: t('dashboard.medium'), count: medium, color: SEVERITY_TONE.medium.tone },
  ].filter(s => s.count > 0)

  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden">
        {segments.map(s => (
          <div key={s.label} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <div className="flex gap-3 mt-2 text-xs">
        {segments.map(s => (
          <span key={s.label} style={{ color: s.color }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: s.color, marginRight: 4 }} />
            {s.count} {s.label}
          </span>
        ))}
      </div>
      <div className="text-xs text-text-secondary mt-1 text-center">{total} {t('dashboard.findings')}</div>
    </div>
  )
}

/** Horizontal bar chart for top risks */
export function RiskBars({ risks }: { risks: Array<{ id: string; repo?: ConnectedRepo; grade: string; score: number }> }) {
  if (risks.length === 0) {
    return <div className="text-center text-xs text-text-secondary py-4" style={{ marginTop: 0 }}>{t('dashboard.noData')}</div>
  }

  // Bar length = 100 - score (lower score = longer bar = more risk)
  const maxRisk = Math.max(...risks.map(r => 100 - r.score), 1)

  // Gradient colors: worst -> less bad
  const barColors = [SEVERITY_TONE.critical.tone, SEVERITY_TONE.high.tone, '#fb923c', '#fbbf24', SEVERITY_TONE.medium.tone]

  return (
    <div className="flex flex-col gap-3">
      {risks.map((risk, i) => {
        const riskVal = 100 - risk.score
        const pct = (riskVal / maxRisk) * 100
        const color = barColors[Math.min(i, barColors.length - 1)]
        return (
          <div key={risk.id} className="flex items-center gap-3">
            <span className="w-32 truncate shrink-0" style={{ color: 'var(--mui-palette-text-primary, var(--color-text-secondary))', fontSize: 14 }} title={risk.repo?.fullName}>{risk.repo?.repoName ?? risk.id}</span>
            <div className="flex-1 rounded-full bg-white/5 overflow-hidden" style={{ height: 8 }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="font-bold shrink-0 tabular-nums" style={{ color, fontSize: 15, minWidth: 32, textAlign: 'right' }}>
              {displayScore(risk.score)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** 7-day trend chip — shows direction + delta magnitude, tooltip with history */
export function TrendSparkline({ orgId, currentScore }: { orgId: string; currentScore: number }) {
  const historyKey = `flyto_score_history_${orgId}`

  const points = useMemo(() => {
    let history: Array<{ date: string; score: number }> = []
    try { history = JSON.parse(localStorage.getItem(historyKey) || '[]') } catch { /* corrupted */ }

    const today = new Date().toISOString().slice(0, 10)
    history = history.filter(h => h.date !== today)
    history.push({ date: today, score: currentScore })
    if (history.length > 30) history = history.slice(-30)
    try { localStorage.setItem(historyKey, JSON.stringify(history)) } catch { /* private mode */ }

    return history.slice(-7)
  }, [historyKey, currentScore])

  if (points.length < 2) return null

  const first = points[0].score
  const last = points[points.length - 1].score
  const delta = Math.round(last - first)
  if (delta === 0) return null

  const up = delta > 0
  const color = up ? LETTER_GRADE_TONE.A.tone : SEVERITY_TONE.critical.tone
  const Arrow = up ? TrendingUp : TrendingDown
  const tip = `${points.length}${t('common.daysShort')}: ` + points.map(p => `${p.date.slice(5)} ${Math.round(p.score)}`).join(' · ')

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      title={tip}
      style={{
        color,
        background: alpha(color, 0.1),
        border: `1px solid ${alpha(color, 0.25)}`,
      }}
    >
      <Arrow size={12} strokeWidth={2.5} />
      <span>{up ? '+' : ''}{delta}</span>
      <span className="text-[11px] opacity-60">7d</span>
    </span>
  )
}

/** Dot strip showing all repos by health score */
export function HealthDots({ healthRepos, scoreMap }: { healthRepos: RepoHealthSummary[]; scoreMap: Map<string, RepoScore> }) {
  // Build histogram: 10 buckets (0-9, 10-19, ..., 90-100)
  const buckets = useMemo(() => {
    const b = Array.from({ length: 10 }, () => 0)
    healthRepos.forEach(hr => {
      const score = getRepoScore(scoreMap, hr.repo_id)
      // A3: unscored repos drop out of the histogram entirely.
      // Pre-A3 they'd land in bucket 0 (because default raw=0)
      // and visually pile up as "10 repos scored 0-9", which read
      // as "the worst" rather than "not yet scored".
      if (!score.scorable || score.raw == null) return
      const idx = Math.min(9, Math.floor(Math.round(score.raw) / 10))
      b[idx]++
    })
    return b
  }, [healthRepos, scoreMap])

  if (healthRepos.length === 0) return null

  const maxCount = Math.max(...buckets, 1)
  const w = 500
  const h = 100
  const padX = 30
  const padY = 20
  const barGap = 4
  const usableW = w - padX * 2
  const usableH = h - padY * 2
  const barW = (usableW - barGap * 9) / 10

  const cTone = SEVERITY_TONE.critical.tone
  const hTone = SEVERITY_TONE.high.tone
  const mTone = SEVERITY_TONE.medium.tone
  const gTone = LETTER_GRADE_TONE.A.tone
  const barColors = [cTone, cTone, cTone, hTone, hTone, mTone, mTone, '#34d399', gTone, gTone]

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {/* Bars */}
      {buckets.map((count, i) => {
        const x = padX + i * (barW + barGap)
        const barH = count > 0 ? Math.max(4, (count / maxCount) * usableH) : 0
        const y = h - padY - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={barColors[i]} opacity={0.7} />
            {count > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize={12} fontWeight={600}>{count}</text>
            )}
            <text x={x + barW / 2} y={h - 4} textAnchor="middle" fill="currentColor" opacity={0.55} fontSize={12}>{i * 10}</text>
          </g>
        )
      })}
    </svg>
  )
}

