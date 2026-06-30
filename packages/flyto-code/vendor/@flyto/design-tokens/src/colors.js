/**
 * Flyto brand palette.
 *
 * Source of truth for every product. Cloud uses these via UnoCSS preset;
 * Cortex injects them into Mantine theme + consumes as CSS variables.
 * Anything used visually anywhere in the platform should live here.
 */

/** Primary brand — purple. Used for primary actions, focus rings, active nav. */
export const purple = {
  50:  '#f5f3ff',
  100: '#ede9fe',
  200: '#ddd6fe',
  300: '#c4b5fd',
  400: '#a78bfa',   // brand-light
  500: '#8b5cf6',   // brand (canonical Flyto purple)
  600: '#7c3aed',   // brand-dark
  700: '#6d28d9',
  800: '#5b21b6',
  900: '#4c1d95',
}

/** Accent — cyan. Used for AI / system callouts + gradient partner. */
export const cyan = {
  50:  '#ecfeff',
  100: '#cffafe',
  200: '#a5f3fc',
  300: '#67e8f9',
  400: '#22d3ee',
  500: '#06b6d4',   // brand accent
  600: '#0891b2',
  700: '#0e7490',
  800: '#155e75',
  900: '#164e63',
}

/** Accent — pink. Used for switch/loop nodes in cloud, avatars in cortex. */
export const pink = {
  400: '#f472b6',
  500: '#ec4899',
  600: '#db2777',
}

/** Accent — orange. Triggers / warnings. */
export const orange = {
  400: '#fbbf24',
  500: '#f59e0b',
  600: '#d97706',
}

/** Semantic colors — aligned across products. */
export const semantic = {
  success: '#10b981',
  successDark: '#059669',
  warning: orange[500],
  warningDark: orange[600],
  error: '#ef4444',
  errorDark: '#dc2626',
  info: '#3b82f6',
  infoDark: '#2563eb',
}

/** Dark surfaces — the only mode we ship today. */
export const surface = {
  darkest:   '#0F172A',   // body background
  base:      '#0f172a',
  secondary: '#1e293b',   // sidebar / card base
  tertiary:  '#334155',   // elevated card / hover
  overlay:   'rgba(0, 0, 0, 0.7)',
}

/** Text colours on dark surfaces. */
export const text = {
  primary:   '#f8fafc',
  secondary: '#cbd5e1',
  tertiary:  '#94a3b8',
  inverse:   '#0f172a',
  link:      purple[400],
}

/** Borders — subtle by default, branded for focus. */
export const border = {
  default: 'rgba(148, 163, 184, 0.1)',
  light:   'rgba(148, 163, 184, 0.06)',
  focus:   purple[500],
  handle:  '#374151',
}

/**
 * Presence palette — six distinct hues for multi-user cursors / avatars.
 * Order is stable; pick by (hash(userId) % 6) for deterministic assignment.
 */
export const presence = [
  semantic.error,
  cyan[500],
  purple[500],
  semantic.success,
  orange[500],
  pink[500],
]

/**
 * Category tags — used by Cortex resource cards. Colours chosen to harmonise
 * with the four brand accents so a project-dashboard doesn't clash.
 */
export const category = {
  document: cyan[500],
  code:     purple[500],
  media:    pink[500],
  data:     orange[500],
  config:   '#64748b',
  archive:  '#475569',
}
