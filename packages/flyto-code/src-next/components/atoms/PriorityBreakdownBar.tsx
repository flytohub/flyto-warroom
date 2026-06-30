import { Tooltip } from '@mui/material'
import { colors, softBg } from '@/styles/designTokens'
import { t, tOr } from '@lib/i18n';

// PriorityBreakdownBar — replaces the 4-cell text grid in the
// external-issue detail panel with a stacked horizontal bar that
// shows how the priority engine arrived at its score. Each segment
// is one multiplier; widths are proportional so the operator can
// see at a glance whether the row is loud because of (a) base
// severity, (b) crown-jewel tier, (c) KEV/EPSS exploitability, or
// (d) lack of mitigation cover.
//
// Math:
//   base = severity-weight (5 / 20 / 40 / 60)
//   tier_lift = base × (tier_mul - 1)              ≥ 0 (or < 0 for sandbox)
//   exploit_lift = (base + tier_lift) × (exploit_mul - 1)
//   mit_reduction = subtotal × mit_factor (≥ 0)
//   final = subtotal - mit_reduction
//
// Bar is drawn as: [base][tier_lift][exploit_lift] and a notch
// (negative space) for mit_reduction on the right.

export interface PriorityBreakdownBarProps {
  baseSeverity: string         // critical | high | medium | low
  tierMultiplier: number       // typically 0.5 / 1.0 / 1.2 / 1.5
  exploitSignal: 'kev' | 'epss-high' | 'epss-low' | 'category' | 'none'
  exploitScore?: number        // 0..1, only used when exploitSignal === 'epss-*'
  mitigationFactor: number     // 0..0.85
  priorityScore: number        // final score (0..100), shown as the right-side number
}

const SEV_WEIGHT: Record<string, number> = { critical: 60, high: 40, medium: 20, moderate: 20, low: 5 }

function exploitMultiplier(spec: PriorityBreakdownBarProps): number {
  // Mirrors internal/ctem/priority.go's ComputeEffectiveSeverity:
  //   exploit = max(kev ? 1.5 : 1.0, 1 + epss*0.6, 1 + cat*0.5)
  switch (spec.exploitSignal) {
    case 'kev':       return 1.5
    case 'epss-high': return 1 + Math.min(1, spec.exploitScore ?? 0) * 0.6
    case 'epss-low':  return 1 + Math.min(1, spec.exploitScore ?? 0) * 0.6
    case 'category':  return 1.2 // approx average — exact value is per-category in backend
    default:          return 1.0
  }
}

export function PriorityBreakdownBar(props: PriorityBreakdownBarProps) {
  const base = SEV_WEIGHT[props.baseSeverity.toLowerCase()] ?? 5
  const tierMul = props.tierMultiplier
  const exploitMul = exploitMultiplier(props)
  const mitFactor = Math.max(0, Math.min(0.85, props.mitigationFactor))

  const tierContribution = base * Math.max(0, tierMul - 1)
  const tierPenalty = base * Math.max(0, 1 - tierMul)
  const subtotalBeforeMit = (base + tierContribution) * exploitMul
  const mitReduction = subtotalBeforeMit * mitFactor

  // Scale every segment to the score the backend actually computed
  // (we don't recompute — frontend just visualises the parts).
  const score = Math.max(1, props.priorityScore)
  const total = score + mitReduction // include the absorbed reduction so the notch is visible
  const pct = (n: number) => Math.max(0, Math.min(100, (n / total) * 100))

  // Translated labels — kept as locals so the tooltip + segment
  // titles + a11y label all match without drift.
  const labelBase = t('priority.base')
  const labelTier = t('priority.tier')
  const labelExploit = t('priority.exploit')
  const labelMitigation = t('priority.mitigation')
  const labelSandbox = t('priority.sandbox')

  const tooltipText =
    `${labelBase} ${props.baseSeverity} (${base}) ` +
    `× ${labelTier} ${tierMul.toFixed(2)}× ` +
    `× ${labelExploit} ${exploitMul.toFixed(2)}× ` +
    `× (1 − ${labelMitigation} ${(mitFactor * 100).toFixed(0)}%) ` +
    `= ${score}`

  // a11y — screen readers get a richer description than the visual
  // tooltip (which depends on hover/focus). Each segment is read
  // explicitly so the breakdown isn't lost.
  const ariaLabel = tOr('priority.ariaLabel',
    `Priority score ${score} of 100. ${tooltipText}`)

  return (
    <Tooltip title={tooltipText}>
      <div role="img" aria-label={ariaLabel}
           style={{
             display: 'flex', alignItems: 'center', gap: 8,
             padding: '8px 10px',
             background: 'var(--mui-palette-background-paper, rgba(139,92,246,0.04))',
             borderRadius: 8,
             border: '1px solid var(--mui-palette-divider, rgba(139,92,246,0.12))',
           }}>
        <div style={{
          flex: 1, display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden',
          background: softBg(colors.semantic.neutral, 0.12),
        }}>
          <Segment width={pct(base)} color={colors.severity.medium} title={`${labelBase}: ${base}`} />
          {tierContribution > 0 && (
            <Segment width={pct(tierContribution)} color={colors.brand} title={`${labelTier} +${tierContribution.toFixed(0)}`} />
          )}
          {tierPenalty > 0 && (
            <Segment width={pct(tierPenalty)} color={colors.semantic.neutral} title={`${labelSandbox} −${tierPenalty.toFixed(0)}`} striped />
          )}
          {exploitMul > 1 && (
            <Segment width={pct((base + tierContribution) * (exploitMul - 1))}
                     color={colors.severity.high}
                     title={`${labelExploit} +${((base + tierContribution) * (exploitMul - 1)).toFixed(0)}`} />
          )}
          {mitReduction > 0 && (
            <Segment width={pct(mitReduction)} color={colors.semantic.success} title={`${labelMitigation} −${mitReduction.toFixed(0)}`} striped />
          )}
        </div>
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 14,
          color: 'var(--mui-palette-text-primary, var(--color-text-primary))',
          minWidth: 36, textAlign: 'right',
        }}>
          {score}
        </span>
      </div>
    </Tooltip>
  )
}

function Segment({ width, color, title, striped }: { width: number; color: string; title: string; striped?: boolean }) {
  return (
    <div
      title={title}
      style={{
        width: `${width}%`,
        background: striped
          ? `repeating-linear-gradient(45deg, ${color}, ${color} 4px, transparent 4px, transparent 8px)`
          : color,
        transition: 'width 240ms ease-out',
      }}
    />
  )
}
