/**
 * Design-token bridge for flyto-code.
 *
 * Re-exports from `@flyto/design-tokens` (the shared package — also used
 * by flyto-cloud + flyto-cortex) and adds flyto-code-specific semantic
 * mappings: severity colour scale, blast-radius bands, and the brand /
 * neutral palette used by the grounded-palette rule.
 *
 * Always prefer importing from here over hard-coded hex values. If a
 * hue you need isn't here, add it ONCE — never inline a #hex in a
 * component.
 *
 * See:
 *   - feedback_ui_grounded_palette  (only severity/brand colours, no rainbow)
 *   - feedback_font_size_floor       (no fontSize < 12)
 */

// The raw tokens are also exposed as CSS custom properties via
// `@import '@flyto/design-tokens/css'` (loaded in styles/index.css).
// At runtime, `var(--flyto-purple-500)` works anywhere CSS variables
// do; this TS bridge is for places where you need a JS value (sx prop,
// inline style with computed expressions, chart libraries that don't
// resolve CSS vars).

import {
  purple, cyan, pink, orange, semantic, surface, text, border,
  spacing as spacingTokens, layout, fonts, typeScale,
} from '@flyto/design-tokens'
import { SEVERITY_TONE } from './tokens/severity'

/** Brand purple — flyto canonical 500. */
export const brand = {
  light:  purple[400],
  base:   purple[500],
  dark:   purple[600],
  surface: 'rgba(139, 92, 246, 0.12)', // 8% tint, used for selected nav bg
  surfaceHover: 'rgba(139, 92, 246, 0.18)',
} as const

/** Severity palette. The ONLY four hues that should appear on any
 *  "finding" surface (badge, row stripe, blast number, alert banner).
 *  Per feedback_ui_grounded_palette: source/category kind is NOT
 *  severity and therefore stays neutral. */
// Derived from the canonical SEVERITY_TONE table (lib/tokens/severity.ts)
// so there is ONE severity palette across the app. `low` is a neutral
// slate (a low-severity finding is still a finding, not "clean/green")
// and `high` is orange, per the canonical. Do not re-inline hexes here.
export const severity = {
  critical: SEVERITY_TONE.critical.tone, // #ef4444
  high:     SEVERITY_TONE.high.tone,     // #f97316
  medium:   SEVERITY_TONE.medium.tone,   // #eab308
  low:      SEVERITY_TONE.low.tone,      // #64748b (slate)
  neutral:  SEVERITY_TONE[''].tone,      // #94a3b8
} as const

/** Blast-radius bands. Same hues as severity but expressed in terms of
 *  the 0-100 score the Pulse view sorts by. Match by score, not severity. */
export function blastTone(score: number): string {
  if (score >= 80) return severity.critical
  if (score >= 60) return severity.high
  if (score >= 40) return severity.medium
  return severity.neutral
}

/** Standard font size floor. Body must be 14px; chips can drop to 12. */
export const fontSize = {
  micro:    12, // chips, status pills only
  caption:  13, // subtitle, metadata, section header
  body:     14, // list row title, button label
  bodyLg:   15, // emphasised body
  metric:   16, // focal number in a row (blast radius, score)
  metricLg: 20, // dashboard tile metric
  metricXl: 32, // hero metric (gauge centre)
  h6:       17,
  h5:       19,
  h4:       21,
  h3:       24,
  h2:       28,
  h1:       34,
} as const

/** Neutral palette aliases. MUI sx-friendly. */
export const neutralPalette = {
  textPrimary:   text.primary,
  textSecondary: text.secondary,
  textTertiary:  text.tertiary,
  border:        border.default,
  borderSubtle:  border.light,
  surfaceBase:   surface.base,
  surfaceCard:   surface.secondary,
  surfaceHover:  surface.tertiary,
} as const

/** Spacing scale. Same numeric scale as @flyto/design-tokens for
 *  consistency across products. */
export const spacing = spacingTokens

/** Layout constants — sidebar width, topbar height, etc. */
export const pageLayout = layout

/** Typography stack. */
export const fontStack = fonts
export const fontScale = typeScale

/** Re-export the raw palette ladders for the rare case where you need
 *  a specific shade (e.g. chart fills). Default to the semantic names
 *  above whenever possible. */
export const palette = { purple, cyan, pink, orange, semantic, surface, text, border } as const
