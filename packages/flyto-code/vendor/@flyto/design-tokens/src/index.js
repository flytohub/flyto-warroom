/**
 * @flyto2/design-tokens — canonical design values for the Flyto Platform.
 *
 * Two entry points:
 *
 *   import * as tokens from '@flyto2/design-tokens'       // JS/TS
 *   @import '@flyto2/design-tokens/css';                  // CSS custom properties
 *
 * Cloud (Vue + UnoCSS) consumes via a UnoCSS preset that maps these
 * values to utility names. Cortex (React + Tailwind v4 + Mantine) pulls
 * the CSS variables directly and mirrors the JS values into the Mantine
 * theme at createTheme time.
 */

export * as colors from './colors.js'
export * as gradients from './gradients.js'
export * as shadows from './shadows.js'
export * as animations from './animations.js'
export * as radii from './radii.js'
export * as spacing from './spacing.js'

// Direct re-exports for the common-case "just give me purple" call site.
export { purple, cyan, pink, orange, semantic, surface, text, border, presence, category } from './colors.js'
export { brandPrimary, brandAccent, borderFlow, glassCard, glassCardHover } from './gradients.js'
export { shadows as shadowTokens, focusRing, glow } from './shadows.js'
export { durations, easings, keyframes as keyframeNames, animations as animationShorthands } from './animations.js'
export { radii as radiiTokens, nodeRadii } from './radii.js'
export { spacing as spacingTokens, layout, fonts, typeScale } from './spacing.js'
