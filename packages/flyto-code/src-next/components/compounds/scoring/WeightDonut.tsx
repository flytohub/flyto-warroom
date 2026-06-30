/**
 * WeightDonut — SVG donut chart showing category weight distribution.
 */

import type { ComputedCategory } from './scoring-defs'

interface Props {
  categories: ComputedCategory[]
  size?: number
}

export function WeightDonut({ categories, size = 160 }: Props) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const strokeW = size * 0.12
  const circumference = 2 * Math.PI * r

  let offset = 0
  const segments = categories.map(cat => {
    const pct = cat.def.weight
    const dashLen = circumference * pct
    const dashOffset = -offset
    offset += dashLen
    return { cat, dashLen, dashOffset }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={strokeW} opacity={0.06} />
      {/* Segments */}
      {segments.map(({ cat, dashLen, dashOffset }) => (
        <circle
          key={cat.def.id}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={cat.raw !== null ? cat.def.color : '#94a3b8'}
          strokeWidth={strokeW}
          strokeDasharray={`${dashLen} ${circumference - dashLen}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="butt"
          opacity={cat.raw !== null ? 0.85 : 0.2}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      ))}
      {/* Center text */}
      <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="central"
        fill="currentColor" fontSize={12} fontWeight={500} opacity={0.55} fontFamily="inherit">
        Weight
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="central"
        fill="currentColor" fontSize={12} fontWeight={500} opacity={0.55} fontFamily="inherit">
        Distribution
      </text>
    </svg>
  )
}
