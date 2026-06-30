import { type ReactNode } from 'react'
import { Chip, Tooltip } from '@mui/material'
import { colors, softBg } from '@/styles/designTokens'

// SignalPill — the single atom every CTEM picker row / detail panel
// uses for its decoration chips. Centralises:
//
//   • colour selection via designTokens (no inline hex)
//   • soft-fill background via softBg() (alpha tuned once, not per-call)
//   • tooltip wrapping (every signal has a "why" worth explaining)
//   • icon slot positioning (left, with consistent margin)
//
// Why this exists: row clutter was 7+ raw <Chip> elements with
// inline `sx` blobs duplicating the same 6 lines of styling each
// (height/fontSize/fontWeight/bgcolor/color/icon margin). One atom
// kills the duplication and gives us a single place to flip
// dark/light tokens when the day comes.

export type SignalTone =
  | 'critical'     // red — KEV, breach, RCE
  | 'high'         // orange — EPSS hot, edge-to-internal
  | 'medium'       // amber — concentration paths
  | 'success'      // green — verified fixed, mitigation active
  | 'brand'        // brand violet — owner, internal CTEM lineage
  | 'tech'         // tech cyan — source/domain, external scanner
  | 'threat'       // dark violet — threat actor / campaign
  | 'neutral'      // slate — anything else

export interface SignalPillProps {
  tone: SignalTone
  label: string
  icon?: ReactNode
  /** Hover/long-press explanation. ALWAYS provide — pills with no
   *  tooltip are guesswork for the operator. */
  tooltip?: string
  /** Pulsing animation — reserved for active alarm states (breached
   *  SLA, awaiting verify). Don't pulse stable signals. */
  pulse?: boolean
  /** When set, clicking the chip fires this. Otherwise the chip is
   *  presentation-only (parent button captures the click). */
  onClick?: () => void
  /** Override max width — useful for long actor/campaign names. */
  maxWidth?: number
}

function paletteFor(tone: SignalTone): { color: string; bg: string; bgStrong: string } {
  switch (tone) {
    case 'critical':
      return { color: colors.severity.critical, bg: softBg(colors.severity.critical), bgStrong: softBg(colors.severity.critical, 0.22) }
    case 'high':
      return { color: colors.severity.high, bg: softBg(colors.severity.high), bgStrong: softBg(colors.severity.high, 0.22) }
    case 'medium':
      return { color: colors.severity.medium, bg: softBg(colors.severity.medium), bgStrong: softBg(colors.severity.medium, 0.22) }
    case 'success':
      return { color: colors.semantic.success, bg: softBg(colors.semantic.success), bgStrong: softBg(colors.semantic.success, 0.22) }
    case 'brand':
      return { color: colors.brand, bg: softBg(colors.brand), bgStrong: softBg(colors.brand, 0.22) }
    case 'tech':
      return { color: colors.tech, bg: softBg(colors.tech), bgStrong: softBg(colors.tech, 0.22) }
    case 'threat':
      return { color: colors.brandDeep, bg: softBg(colors.brandDeep, 0.16), bgStrong: softBg(colors.brandDeep, 0.26) }
    case 'neutral':
    default:
      return { color: colors.semantic.neutral, bg: softBg(colors.semantic.neutral, 0.18), bgStrong: softBg(colors.semantic.neutral, 0.26) }
  }
}

export function SignalPill({ tone, label, icon, tooltip, pulse, onClick, maxWidth }: SignalPillProps) {
  const p = paletteFor(tone)
  const chip = (
    <Chip
      size="small"
      icon={icon as React.ReactElement | undefined}
      label={label}
      onClick={onClick}
      clickable={!!onClick}
      sx={{
        height: 20,
        fontSize: 12,
        fontWeight: 700,
        maxWidth: maxWidth ?? 140,
        bgcolor: pulse ? p.bgStrong : p.bg,
        color: p.color,
        cursor: onClick ? 'pointer' : 'default',
        '& .MuiChip-icon': { ml: 0.5, color: p.color },
        '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' },
        animation: pulse ? 'flyto-pulse 1.4s infinite' : undefined,
        // Force the same paint in light + dark — soft alpha + brand
        // color keeps readable contrast against both `--color-bg-*`
        // and `--mui-palette-background-*`.
        '@keyframes flyto-pulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.55 },
        },
      }}
    />
  )
  return tooltip ? <Tooltip title={tooltip}>{chip}</Tooltip> : chip
}
