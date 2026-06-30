/**
 * Gradient recipes. Everything uses 135deg by convention so backgrounds
 * feel coherent across Cloud + Cortex.
 */

import { purple, cyan, pink, orange, surface } from './colors.js'

/** Primary brand gradient — purple → deep purple. Hero buttons, highlight rails. */
export const brandPrimary =
  `linear-gradient(135deg, ${purple[500]} 0%, ${purple[700]} 100%)`

/** Brand accent gradient — purple → cyan. Gradient text, decorative borders. */
export const brandAccent =
  `linear-gradient(90deg, ${purple[500]}, ${cyan[500]})`

/** Flowing border animation — used with @keyframes border-flow. 3x size. */
export const borderFlow =
  `linear-gradient(90deg, ${purple[500]}, ${cyan[500]}, ${pink[500]}, ${orange[500]}, ${purple[500]})`

/** Glass card base — dark gradient with subtle transparency. */
export const glassCard = `linear-gradient(135deg, ${withAlpha(surface.secondary, 0.9)} 0%, ${withAlpha(surface.base, 0.95)} 100%)`

/** Glass card elevated — for hover / active states. */
export const glassCardHover = `linear-gradient(135deg, ${withAlpha(surface.tertiary, 0.95)} 0%, ${withAlpha(surface.secondary, 0.95)} 100%)`

/** Radial blob — for floating background accents behind hero tiles. */
export const blobPurple = `radial-gradient(circle at center, ${withAlpha(purple[500], 0.25)} 0%, transparent 60%)`
export const blobCyan   = `radial-gradient(circle at center, ${withAlpha(cyan[500], 0.20)} 0%, transparent 60%)`
export const blobPink   = `radial-gradient(circle at center, ${withAlpha(pink[500], 0.15)} 0%, transparent 60%)`

/** Per-node-type gradients matching the cloud node design system. */
export const nodePurple  = `linear-gradient(135deg, ${purple[500]} 0%, ${purple[700]} 100%)`
export const nodeSuccess = `linear-gradient(135deg, #10B981 0%, #059669 100%)`
export const nodeError   = `linear-gradient(135deg, #EF4444 0%, #DC2626 100%)`
export const nodeWarning = `linear-gradient(135deg, ${orange[500]} 0%, ${orange[600]} 100%)`
export const nodeInfo    = `linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)`
export const nodeFork    = `linear-gradient(135deg, ${cyan[500]} 0%, #0891B2 100%)`

/**
 * withAlpha converts a hex color to rgba with the given alpha. Minimal,
 * no-dependency helper — gradients are computed once at import time.
 */
function withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.replace(/^rgba?\(.*$/, ''))
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
