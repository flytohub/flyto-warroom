/**
 * Canonical animation timings + keyframe names. The keyframes themselves
 * are declared once in css/animations.css and imported by consumer apps.
 */

export const durations = {
  fast:   '120ms',
  normal: '200ms',
  slow:   '320ms',
  verySlow: '600ms',
}

export const easings = {
  standard:  'cubic-bezier(0.4, 0, 0.2, 1)',  // Material "standard"
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',   // strong in, soft out
  overshoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear:    'linear',
}

/**
 * Named keyframes. Values are the CSS animation-name strings; the actual
 * @keyframes live in css/animations.css.
 */
export const keyframes = {
  fadeIn:       'flyto-fade-in',
  fadeInUp:     'flyto-fade-in-up',
  slideUp:      'flyto-slide-up',
  float:        'flyto-float',
  shimmer:      'flyto-shimmer',
  borderFlow:   'flyto-border-flow',
  runningPulse: 'flyto-running-pulse',
  ripple:       'flyto-ripple',
  gradientShift: 'flyto-gradient-shift',
  spin:         'flyto-spin',
  badgePop:     'flyto-badge-pop',
}

/**
 * Prebuilt composite animation strings — drop into `animation:` directly.
 * Uses the standard easing and typical timings so consumers don't need to
 * re-derive the feel.
 */
export const animations = {
  fadeIn:     `${keyframes.fadeIn} ${durations.normal} ${easings.standard} both`,
  fadeInUp:   `${keyframes.fadeInUp} ${durations.slow} ${easings.standard} both`,
  slideUp:    `${keyframes.slideUp} ${durations.normal} ${easings.standard} both`,
  float:      `${keyframes.float} 20s ease-in-out infinite`,
  shimmer:    `${keyframes.shimmer} 1.4s ${easings.linear} infinite`,
  borderFlow: `${keyframes.borderFlow} 3s ${easings.linear} infinite`,
  gradientShift: `${keyframes.gradientShift} 4s ease-in-out infinite`,
  spin:       `${keyframes.spin} 1s ${easings.linear} infinite`,
}
