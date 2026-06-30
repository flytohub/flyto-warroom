// designTokens.ts — single source of truth for every color used in
// user-facing surfaces. Builds on [[feedback_ui_grounded_palette]]:
// 1 brand + 1 tech accent + semantic-only-when-alarming. Replaces a
// scattered set of inline hex literals and per-component gradient
// strings that drifted across the war-room sections.
//
// Conventions
//   - Hex colors are lowercase, 6-digit (no shorthand). Transparency
//     uses `rgba()` because Tailwind's `/NN` opacity syntax doesn't
//     translate to MUI sx props.
//   - Names describe SEMANTIC intent (`danger`, `success`, `accent`)
//     not the hue (`red`, `green`). When the brand palette evolves,
//     change once here, not in 40 files.
//   - Gradients are emitted as full `linear-gradient(...)` strings so
//     they can be dropped straight into `background:` / `bgcolor:`.
//
// Migration target — anywhere we see:
//   - `bgcolor: '#ef4444'` → `bgcolor: tokens.severity.critical`
//   - `background: 'linear-gradient(135deg, #ef4444, #f97316)'` →
//     `background: tokens.gradients.security`
//   - per-component `--exp-accent` inline colors → still allowed
//     because each exposure view IS supposed to declare its own
//     section accent (see PostureOverview / ScoreTrends pattern).
//     The token here just gives them a name to import.

import { brand as sharedBrand, palette as sharedPalette, severity as sharedSeverity } from '@lib/tokens'
import { RAW, SEVERITY_TONE } from '@lib/tokens/severity'

export const colors = {
  /** The single brand violet. Every "this is the product" surface
   *  (Topbar logo glow, Audit Timeline accent, Score sparkline)
   *  uses this. Other accents are SECTION colors, not brand. */
  brand:         sharedBrand.light,
  brandDeep:     sharedBrand.base,
  brandDarkest:  sharedPalette.purple[900],

  /** Tech accent for "computation / scanning / data" surfaces —
   *  Code Activity, sec-iac, sec-license, scan_views. Cyan keeps
   *  the violet brand from collapsing into a one-note palette. */
  tech:      sharedPalette.cyan[500],
  techDeep:  sharedPalette.cyan[600],

  /** Semantic — used ONLY for severity / state communication. Don't
   *  use these as decoration. */
  semantic: {
    success: RAW.green500,
    warning: RAW.orange500,
    danger:  RAW.red500,
    info:    RAW.blue500,
    neutral: RAW.slate400,
  },

  /** Per-severity finding palette. Aligns with the SEV_BG map in
   *  warroom/history/dimensions/shared.ts. */
  severity: {
    critical: sharedSeverity.critical,
    high:     sharedSeverity.high,
    medium:   sharedSeverity.medium,
    low:      sharedSeverity.low,
    info:     SEVERITY_TONE[''].tone,
  },

  /** Section accents — picked per-pillar so the sidebar's coloured
   *  icon strip matches the active view's hero header. Reference
   *  these from individual views' inline `--exp-accent` CSS var. */
  section: {
    architecture: sharedBrand.light, // violet (brand-aligned — Arch is the org's "shape")
    security:     RAW.red500, // danger red — sec-overview is the alarm panel
    // cicd section pulled from nav 2026-05-21 + compounds deleted
    // 2026-05-22 Phase 1 cleanup. Token kept commented in case the
    // section ever returns.
    // cicd:      '#c084fc',
    exposure:     sharedPalette.cyan[500], // tech cyan — CTEM / external posture
    history:      '#fbbf24', // amber — audit / time-flow connotation
    scoring:      sharedBrand.base, // brand-deep — scoring is brand-product authority
  },
} as const

/** Gradient strings, ready to drop into `background:` or `bgcolor:`. */
export const gradients = {
  /** Hero icon for the Security Overview action queue. Red→orange
   *  expresses "alarm + action needed" without leaving the
   *  severity palette. */
  security: `linear-gradient(135deg, ${colors.semantic.danger}, ${colors.semantic.warning})`,

  /** Hero icon for Architecture views. Brand violet pair. */
  architecture: `linear-gradient(135deg, ${colors.brand}, ${colors.brandDeep})`,

  /** AutoFix run / accept actions — "ready to ship" brand-tech blend. */
  autofix: `linear-gradient(135deg, ${colors.brand}, ${colors.tech})`,

  /** RedTeam campaign launch — pure danger, no brand bleed. */
  redteam: `linear-gradient(135deg, ${colors.semantic.danger}, #b91c1c)`,

  /** Compliance posture — brand-deep + brand. */
  compliance: `linear-gradient(135deg, ${colors.brandDeep}, ${colors.brand})`,

  // CI/CD gradient pulled — section deleted 2026-05-22 Phase 1.
  // Kept commented for revival reference.

  /** Brand Protection (CTEM cross-cut) — brand + tech bridge. */
  brandProtection: `linear-gradient(135deg, ${colors.brandDeep}, ${colors.tech})`,

  /** PDF cover banners — variant-aware. */
  pdfCoverAudit: `linear-gradient(135deg, #1e1b4b 0%, ${colors.brandDarkest} 50%, ${colors.brandDeep} 100%)`,
  pdfCoverCode:  `linear-gradient(135deg, #083344 0%, #155e75 50%, ${colors.techDeep} 100%)`,
} as const

/** Convenience — opacity variants for backgrounds. `colors.severity.critical`
 *  is the line/dot color, this is the soft-fill behind it. */
export function softBg(hex: string, alpha = 0.12): string {
  // Hex → rgb. Caller passes only known 6-digit hex from this file,
  // so no need to validate.
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Pre-baked soft backgrounds — one less call site per pill. */
export const softBgTokens = {
  critical: softBg(colors.severity.critical),
  high:     softBg(colors.severity.high),
  medium:   softBg(colors.severity.medium),
  low:      softBg(colors.severity.low),
  success:  softBg(colors.semantic.success),
  danger:   softBg(colors.semantic.danger),
  warning:  softBg(colors.semantic.warning),
  brand:    softBg(colors.brand),
  tech:     softBg(colors.tech),
} as const

export type DesignTokens = {
  colors: typeof colors
  gradients: typeof gradients
  softBgTokens: typeof softBgTokens
}

export const tokens: DesignTokens = { colors, gradients, softBgTokens }
