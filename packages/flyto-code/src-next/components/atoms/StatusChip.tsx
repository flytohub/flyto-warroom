import { Chip } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { colors, softBg } from '@/styles/designTokens'

// StatusChip — finding/issue lifecycle status badge.
//
// Replaces the inline status→colour logic scattered in
// security/IssuesView.tsx and exposure/FindingsView.tsx. Statuses match
// the engine's issue lifecycle (open/snoozed/ignored/solved) plus the
// `verifying` state used by the closed-loop verify flow.
//
// Token-based + dual-mode safe (soft-fill via softBg). Unknown status →
// neutral, so it never throws on an unexpected value.

export type FindingStatus = 'open' | 'snoozed' | 'ignored' | 'solved' | 'verifying'

const TONE: Record<FindingStatus, string> = {
  open:      colors.semantic.info,     // needs triage
  snoozed:   colors.semantic.warning,  // deferred
  ignored:   colors.semantic.neutral,  // dismissed
  solved:    colors.semantic.success,  // closed
  verifying: colors.tech,              // awaiting verify
}

export function normalizeStatus(input: string | null | undefined): FindingStatus {
  const k = (input ?? '').toLowerCase().trim()
  return (Object.keys(TONE) as FindingStatus[]).includes(k as FindingStatus)
    ? (k as FindingStatus)
    : 'open'
}

/** Status → line/text colour, for callers that need only the colour. */
export function statusColor(input: string | null | undefined): string {
  return TONE[normalizeStatus(input)]
}

export interface StatusChipProps {
  status: string | null | undefined
  /** Override the visible label (e.g. an i18n string). Defaults to the
   *  capitalised status key. */
  label?: string
  size?: 'small' | 'medium'
  sx?: SxProps<Theme>
}

export function StatusChip({ status, label, size = 'small', sx }: StatusChipProps) {
  const s = normalizeStatus(status)
  const color = TONE[s]
  return (
    <Chip
      label={label ?? s.charAt(0).toUpperCase() + s.slice(1)}
      size={size}
      sx={{
        height: 20,
        fontSize: 12,
        fontWeight: 700,
        bgcolor: softBg(color),
        color,
        '& .MuiChip-label': { px: 0.75 },
        ...sx,
      }}
    />
  )
}
