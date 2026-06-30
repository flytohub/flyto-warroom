/**
 * Design tokens for the reports system.
 *
 * Single source of truth for spacing, typography, colors, and sizing.
 * All chart + widget + table components should reference these tokens
 * instead of hardcoding values.
 */

// ── Spacing scale (px) ──
export const SP = {
  xs: 4,    // 0.5 in MUI
  sm: 8,    // 1
  md: 12,   // 1.5
  lg: 16,   // 2
  xl: 24,   // 3
  xxl: 32,  // 4
} as const

// ── Typography scale ──
export const FONT = {
  title:    { size: 14, weight: 700, lineHeight: 1.3 },
  subtitle: { size: 12, weight: 600, lineHeight: 1.4 },
  body:     { size: 11, weight: 400, lineHeight: 1.5 },
  caption:  { size: 10, weight: 400, lineHeight: 1.4 },
  micro:    { size: 9,  weight: 400, lineHeight: 1.3 },  // minimum readable (WCAG)
} as const

// ── Chart heights ──
export const CHART_H = {
  sm: 240,
  md: 300,
  lg: 400,
} as const

// ── Severity colors (semantic, accessible contrast) ──
export const SEV = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#d97706',
  moderate: '#d97706',
  low:      '#0284c7',
  info:     '#64748b',
} as const

// ── Chart color palette (10 colors, high contrast, accessible) ──
export const CHART_PALETTE = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
] as const

// ── Widget card styles ──
export const CARD = {
  borderRadius: 12,
  padding: 20,       // p: 2.5 in MUI
  headerGap: 8,
  shadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.15)',
} as const

// ── PDF export ──
export const PDF = {
  margin: 15,        // mm
  fontSize: {
    title: 20,
    subtitle: 12,
    body: 9,
    table: 8,
    footer: 7,
  },
  colors: {
    headerBg: [139, 92, 246] as [number, number, number],  // #8b5cf6
    headerText: [255, 255, 255] as [number, number, number],
    altRow: [248, 249, 250] as [number, number, number],
    divider: [229, 231, 235] as [number, number, number],
    muted: [156, 163, 175] as [number, number, number],
  },
  cellPadding: 3,    // mm
} as const

// ── Table styles ──
export const TABLE = {
  headerFontSize: 11,
  bodyFontSize: 11,
  rowPadding: 10,     // py in px
  cellPadding: 12,    // px in px
  zebraOpacity: 0.05,
} as const
