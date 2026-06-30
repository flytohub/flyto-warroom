/**
 * ReconRadar — small SVG radar overlaid on the target card.
 *
 * Real feed: one blip per fleet[] entry (discovery scan-type groups).
 * Blip color = colorFor(type); a blip turns breach-red when that group
 * has criticals. The sweep arm spins ONLY while scans are running
 * (stats.running > 0); under prefers-reduced-motion it stays static.
 *
 * Pure presentation — no fetch, no state. Colors are var() tokens.
 */

import { useMemo } from 'react'
import Box from '@mui/material/Box'
import { colorFor } from './shared'
import styles from './RedTeamView.module.css'

export interface RadarBlip {
  type: string
  critical: number
}

const SIZE = 96
const C = SIZE / 2
const RINGS = [0.32, 0.62, 0.92]

export function ReconRadar({ blips, scanning }: { blips: RadarBlip[]; scanning: boolean }) {
  // Deterministically place blips around the dial from a hash of the
  // scan-type name, so the same target always lays out the same way.
  const placed = useMemo(() => {
    return blips.slice(0, 10).map((b, i) => {
      let h = 0
      for (let k = 0; k < b.type.length; k++) h = (h * 31 + b.type.charCodeAt(k)) >>> 0
      const angle = ((h % 360) + i * 37) * (Math.PI / 180)
      const radius = (0.28 + ((h >> 9) % 60) / 100) * (C - 8)
      return {
        type: b.type,
        critical: b.critical,
        x: C + Math.cos(angle) * radius,
        y: C + Math.sin(angle) * radius,
        color: b.critical > 0 ? 'var(--rt-breach)' : colorFor(b.type),
      }
    })
  }, [blips])

  const breached = placed.some(p => p.critical > 0)

  return (
    <Box
      aria-hidden
      sx={{ width: SIZE, height: SIZE, position: 'relative', opacity: 0.92 }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="rt-sweep-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--rt-recon)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--rt-recon)" stopOpacity={0} />
          </linearGradient>
          {/* Soft neon bloom — blips + sweep glow rather than read as flat dots. */}
          <filter id="rt-blip-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={1.6} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="rt-sweep-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={1.1} />
          </filter>
        </defs>

        {/* Rings */}
        {RINGS.map((r, i) => (
          <circle
            key={i}
            cx={C} cy={C} r={r * (C - 4)}
            fill="none"
            stroke="var(--rt-recon)"
            strokeOpacity={0.28}
            strokeWidth={1}
          />
        ))}
        {/* Cross-hairs */}
        <line x1={C} y1={4} x2={C} y2={SIZE - 4} stroke="var(--rt-recon)" strokeOpacity={0.18} strokeWidth={1} />
        <line x1={4} y1={C} x2={SIZE - 4} y2={C} stroke="var(--rt-recon)" strokeOpacity={0.18} strokeWidth={1} />

        {/* Breach lock — a pulsing red ring when any blip is critical. SMIL
            animation is reduced-motion-respecting via the CSS guard wrapper. */}
        {breached && (
          <circle
            className={styles.radarBreach}
            cx={C} cy={C} r={C - 7}
            fill="none"
            stroke="var(--rt-breach)"
            strokeWidth={1.4}
            strokeOpacity={0.7}
          />
        )}

        {/* Sweep arm — spins only while scanning (CSS class is reduced-motion-guarded). */}
        <g className={scanning ? styles.spin : undefined} style={{ transformOrigin: 'center' }} filter="url(#rt-sweep-glow)">
          <path
            d={`M ${C} ${C} L ${C + (C - 6)} ${C} A ${C - 6} ${C - 6} 0 0 0 ${C + (C - 6) * Math.cos(-0.7)} ${C + (C - 6) * Math.sin(-0.7)} Z`}
            fill="url(#rt-sweep-grad)"
          />
          <line x1={C} y1={C} x2={C + (C - 6)} y2={C} stroke="var(--rt-recon)" strokeOpacity={0.7} strokeWidth={1.4} />
        </g>

        {/* Blips */}
        <g filter="url(#rt-blip-glow)">
          {placed.map((p, i) => (
            <g key={`${p.type}-${i}`}>
              <circle cx={p.x} cy={p.y} r={3.2} fill={p.color} />
              <circle cx={p.x} cy={p.y} r={5.5} fill="none" stroke={p.color} strokeOpacity={0.4} strokeWidth={1} />
            </g>
          ))}
        </g>
      </svg>
    </Box>
  )
}
