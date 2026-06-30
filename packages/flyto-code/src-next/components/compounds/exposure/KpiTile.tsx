/**
 * KpiTile — the one true KPI card for every CTEM/Exposure page.
 *
 * Was previously: each page hand-rolled its own KPI layout
 * (sometimes 3 cards, sometimes 4, sometimes label-on-top, sometimes
 * label-on-bottom, sometimes colored numbers, sometimes neutral).
 * Result: same product, eight visual languages.
 *
 * The single shape:
 *
 *   ┌──────────────────────────────────┐
 *   │ 30                               │   ← value (24px, tabular)
 *   │ TOTAL VENDORS                    │   ← label (10px, uppercase)
 *   │ supply chain                     │   ← hint (11px, optional)
 *   └──────────────────────────────────┘
 *
 * Colour rules (matches [[ui-grounded-palette]]):
 *   - `tone="neutral"` (default) → value uses primary text colour
 *   - `tone="critical"` → red, only when count > 0
 *   - `tone="high"` → orange, only when count > 0
 *   - `tone="medium"` → yellow, only when count > 0
 *   - `tone="ok"` → green, only when explicitly safe (0 critical AND 0 high)
 *   - `tone="brand"` → violet, ONLY for non-severity metrics
 *
 * Zero-value tone falls back to muted slate so a clean row stays calm
 * (matching the Projects page Pulse-tile pattern).
 */
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'

export type KpiTone = 'neutral' | 'critical' | 'high' | 'medium' | 'ok' | 'brand'

const TONE_COLOR: Record<KpiTone, string> = {
  neutral:  '',           // empty = use --color-text-primary
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  ok:       '#22c55e',
  brand:    '#a78bfa',
}

export interface KpiTileProps {
  /** Big number / value to show. Strings allowed for things like "N/A" or "C". */
  value: number | string
  /** Caption beneath the value. ALL CAPS in style; pass natural-case text. */
  label: string
  /** Optional secondary hint line beneath the label. Use sparingly. */
  hint?: string
  /** Optional icon to render top-left in tone color. */
  icon?: ComponentType<LucideProps>
  /** Determines the value-colour rule. Defaults to neutral. */
  tone?: KpiTone
}

export function KpiTile({ value, label, hint, icon: Icon, tone = 'neutral' }: KpiTileProps) {
  // Mute the colour when the value is zero — a clean metric should
  // not shout red/orange. Strings (e.g. "—", "N/A") always render in
  // the toned colour so they read as a real signal not a placeholder.
  const numeric = typeof value === 'number'
  const isZero = numeric && value === 0
  const tonedColor = TONE_COLOR[tone]
  const color = tonedColor && !isZero ? tonedColor : 'var(--color-text-primary)'

  return (
    <div className="exp-kpi">
      {Icon && (
        <Icon
          size={14}
          className="exp-kpi-icon"
          style={{ color: tonedColor || 'var(--color-text-tertiary)' }}
        />
      )}
      <div className="exp-kpi-value" style={{ color }}>{value}</div>
      <div className="exp-kpi-label">{label}</div>
      {hint && <div className="exp-kpi-hint">{hint}</div>}
    </div>
  )
}

/**
 * KpiRow — fixed-width responsive row of KpiTile, 1-4 columns by viewport.
 * The wrapper is exported so pages don't have to re-implement the grid
 * (which is exactly why the layout drifted in the first place).
 */
export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="exp-kpi-row">{children}</div>
}
