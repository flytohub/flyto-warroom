import { Chip } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { SEVERITY_TONE, type Severity } from '@lib/tokens/severity'

// SeverityChip — the ONE severity badge for the whole app.
//
// The component layer over the canonical colour table in
// `@lib/tokens/severity` (which already consolidated 7+ inline tone
// tables). Replaces the still-divergent badge *components*:
//   • compounds/scanning/_shared.tsx `SevBadge` (its own SEV_COLORS, MUI-mapped)
//   • compounds/domains/types.ts     `sevBadge`
//   • inline severity <Chip> in FindingRow / Pulse / Issues
//
// Because it sources SEVERITY_TONE, adopting it is colour-neutral with
// the existing token-table call sites. Unknown values fall back to the
// table's '' (neutral) entry, so it never throws.

export type { Severity }

const SEVERITY_SET: Severity[] = ['critical', 'high', 'medium', 'low']

/** Normalise any caller string ("HIGH", "High", "sev-high", "moderate")
 *  to a Severity. `moderate` is a common engine/report synonym for
 *  `medium` — fold it here so every consumer maps it the same way. */
export function normalizeSeverity(input: string | null | undefined): Severity {
  const k = (input ?? '').toLowerCase().replace(/^sev[-_]?/, '').trim()
  if (k === 'moderate') return 'medium'
  return (SEVERITY_SET as string[]).includes(k) ? (k as Severity) : ''
}

/** The canonical severity → line/text colour, for callers that need just
 *  the colour (e.g. a left border or an icon) rather than the full chip. */
export function severityColor(input: string | null | undefined): string {
  return SEVERITY_TONE[normalizeSeverity(input)].tone
}

export interface SeverityChipProps {
  severity: string | null | undefined
  /** `soft` (default): token soft-fill + coloured label.
   *  `outlined`: bordered chip (matches the old scanning SevBadge). */
  variant?: 'soft' | 'outlined'
  /** Override the label (defaults to the severity string, uppercased). */
  label?: string
  /** Render UPPERCASE label (default true). */
  uppercase?: boolean
  size?: 'small' | 'medium'
  sx?: SxProps<Theme>
}

export function SeverityChip({
  severity,
  variant = 'soft',
  label,
  uppercase = true,
  size = 'small',
  sx,
}: SeverityChipProps) {
  const t = SEVERITY_TONE[normalizeSeverity(severity)]
  const text = label ?? severity ?? ''
  const shown = uppercase ? String(text).toUpperCase() : String(text)

  if (variant === 'outlined') {
    return (
      <Chip
        label={shown}
        size={size}
        variant="outlined"
        sx={{ fontWeight: 600, fontSize: 12, height: 24, color: t.tone, borderColor: t.ring, ...sx }}
      />
    )
  }
  return (
    <Chip
      label={shown}
      size={size}
      sx={{
        fontSize: 12,
        fontWeight: 700,
        bgcolor: t.soft,
        color: t.tone,
        textTransform: 'uppercase',
        ...sx,
      }}
    />
  )
}
