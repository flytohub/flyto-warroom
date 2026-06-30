/** Type definitions for @flyto2/design-tokens.
 *
 * Deliberately simple — tokens are plain strings / records. No Mantine or
 * Tailwind types leak out so the package stays framework-agnostic.
 */

export type ColorScale = Record<string | number, string>

export const purple:  ColorScale
export const cyan:    ColorScale
export const pink:    ColorScale
export const orange:  ColorScale

export interface SemanticColors {
  success: string
  successDark: string
  warning: string
  warningDark: string
  error: string
  errorDark: string
  info: string
  infoDark: string
}
export const semantic: SemanticColors

export interface SurfaceColors {
  darkest: string
  base: string
  secondary: string
  tertiary: string
  overlay: string
}
export const surface: SurfaceColors

export interface TextColors {
  primary: string
  secondary: string
  tertiary: string
  inverse: string
  link: string
}
export const text: TextColors

export interface BorderColors {
  default: string
  light: string
  focus: string
  handle: string
}
export const border: BorderColors

export const presence: string[]

export interface CategoryColors {
  document: string
  code: string
  media: string
  data: string
  config: string
  archive: string
}
export const category: CategoryColors

export const brandPrimary: string
export const brandAccent: string
export const borderFlow: string
export const glassCard: string
export const glassCardHover: string

export interface ShadowTokens {
  xs: string
  sm: string
  md: string
  lg: string
  xl: string
  card: string
  cardHover: string
  popup: string
}
export const shadowTokens: ShadowTokens

export const focusRing: string
export interface Glow {
  purple: string
  purpleSm: string
  cyan: string
  pink: string
  orange: string
  success: string
  error: string
}
export const glow: Glow

export interface Durations {
  fast: string
  normal: string
  slow: string
  verySlow: string
}
export const durations: Durations

export interface Easings {
  standard: string
  emphasized: string
  overshoot: string
  linear: string
}
export const easings: Easings

export const keyframeNames: Record<string, string>
export const animationShorthands: Record<string, string>

export const radiiTokens: Record<string, string>
export const nodeRadii: Record<string, string>

export const spacingTokens: Record<string | number, string>
export interface Layout {
  sidebarWidth: string
  topbarHeight: string
  pagePadding: string
  pagePaddingLg: string
  contentMaxWidth: string
}
export const layout: Layout

export interface Fonts {
  sans: string
  mono: string
}
export const fonts: Fonts

export const typeScale: Record<string, string>

/* Namespaced re-exports — for code that prefers `tokens.colors.purple[500]`. */
export * as colors from './colors.js'
export * as gradients from './gradients.js'
export * as shadows from './shadows.js'
export * as animations from './animations.js'
export * as radii from './radii.js'
export * as spacing from './spacing.js'
