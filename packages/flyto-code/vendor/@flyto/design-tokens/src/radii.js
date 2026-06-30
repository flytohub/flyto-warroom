/**
 * Border radii. Kept small on purpose — we reserve the bigger numbers for
 * "hero" surfaces so the card ↔ node visual mapping stays legible.
 */
export const radii = {
  xs: '2px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',   // node cards, hero tiles
  '3xl': '20px',
  full: '9999px',
}

/** Node-specific radii — matched to cloud's nodeDesignSystem.css. */
export const nodeRadii = {
  rectangle: '16px',
  square:    '12px',
  diamond:   '8px',
  circle:    '50%',
  outerRect: '18px',   // the extra ring around a selected rectangle node
  outerDiamond: '10px',
}
