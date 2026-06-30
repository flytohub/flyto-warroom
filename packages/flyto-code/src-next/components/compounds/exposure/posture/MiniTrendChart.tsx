// Sparkline for the posture score trend. Pure SVG, extracted verbatim
// from PostureOverview.tsx (behaviour-neutral split).

export function MiniTrendChart({ points }: { points: { date: string; score: number }[] }) {
  const width = 800, height = 120, pad = 16
  const scores = points.map(p => p.score)
  const min = Math.min(...scores) - 5, max = Math.max(...scores) + 5
  const range = max - min || 1
  const pts = points.map((p, i) => ({
    x: pad + (i / (points.length - 1)) * (width - 2 * pad),
    y: pad + (1 - (p.score - min) / range) * (height - 2 * pad),
  }))
  const d = 'M ' + pts.map(p => `${p.x},${p.y}`).join(' L ')
  const area = d + ` L ${pts[pts.length - 1].x},${height - pad} L ${pts[0].x},${height - pad} Z`
  const trend = scores[0] - scores[scores.length - 1]
  const color = trend >= 0 ? '#22c55e' : '#ef4444'
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFillPO" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#trendFillPO)" />
      <path d={d} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  )
}
