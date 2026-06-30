/**
 * Shadow tokens. Two families:
 *
 *   - neutral shadows (xs → lg) — elevation on dark cards.
 *   - glow shadows — branded, used for hover + focus ring reinforcement.
 */

export const shadows = {
  xs:    '0 1px 2px rgba(0, 0, 0, 0.2)',
  sm:    '0 1px 3px rgba(0, 0, 0, 0.3)',
  md:    '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg:    '0 8px 24px rgba(0, 0, 0, 0.5)',
  xl:    '0 16px 48px rgba(0, 0, 0, 0.6)',
  card:        '0 4px 12px rgba(0, 0, 0, 0.3)',
  cardHover:   '0 8px 24px rgba(0, 0, 0, 0.4)',
  popup:       '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)',
}

/** Focus ring — purple, used on keyboard focus + brand ownership signals. */
export const focusRing = '0 0 0 3px rgba(139, 92, 246, 0.25)'

/** Glow hues — for hover states and animation pulses. */
export const glow = {
  purple:   '0 4px 15px rgba(139, 92, 246, 0.4)',
  purpleSm: '0 0 12px rgba(139, 92, 246, 0.35)',
  cyan:     '0 4px 15px rgba(6, 182, 212, 0.4)',
  pink:     '0 4px 15px rgba(236, 72, 153, 0.4)',
  orange:   '0 4px 15px rgba(245, 158, 11, 0.4)',
  success:  '0 4px 15px rgba(16, 185, 129, 0.4)',
  error:    '0 4px 15px rgba(239, 68, 68, 0.4)',
}
