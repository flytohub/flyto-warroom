/**
 * GradeCircle — Flyto2 circular grade badge shared across surfaces.
 *
 * Three states:
 *   1. Rated (colored) — impacts score
 *   2. Advisory (gray, same size) — has grade but doesn't count
 *   3. N/A (slash) — no data at all
 */

interface Props {
  grade: string | null  // A-F or null for N/A
  color: string
  size?: number
  noRating?: boolean    // Advisory: gray grade, same size, no color
}

export function GradeCircle({ grade, color, size = 28, noRating = false }: Props) {
  const isNA = !grade
  const bg = isNA ? 'rgba(148,163,184,0.1)' : noRating ? 'rgba(148,163,184,0.15)' : `${color}18`
  const fg = isNA ? '#94a3b8' : noRating ? '#9ca3af' : color
  const fontSize = size * 0.42

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2} cy={size / 2} r={size / 2 - 1}
        fill={bg}
        stroke={isNA ? 'none' : `${fg}40`}
        strokeWidth={1.5}
      />
      {isNA ? (
        <line
          x1={size * 0.3} y1={size * 0.7}
          x2={size * 0.7} y2={size * 0.3}
          stroke={fg} strokeWidth={2} strokeLinecap="round"
        />
      ) : (
        <text
          x={size / 2} y={size / 2}
          textAnchor="middle" dominantBaseline="central"
          fill={fg} fontSize={fontSize} fontWeight={700}
          fontFamily="inherit"
        >
          {grade}
        </text>
      )}
    </svg>
  )
}
