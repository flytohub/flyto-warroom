/**
 * JellyCard — entrance + hover spring animation wrapper.
 *
 * Wraps any dashboard tile with a tasteful jelly/bounce effect:
 *   - mount: scale 0.92 → 1 with a spring overshoot
 *   - hover: none — the card must not move or resize on hover (any
 *     position/size change reads as layout shift to the operator).
 *     Hover feedback is left to the wrapped card's own border/shadow.
 *   - tap: scale 1 → 0.98 for press feedback (momentary, on click only)
 *
 * The springs are tuned soft (low stiffness, medium damping) so the
 * tiles don't feel like a kids' toy — they breathe rather than
 * bounce. Stagger the entrance via the optional `delay` prop:
 *
 *   {tiles.map((t, i) => (
 *     <JellyCard key={t.id} delay={i * 0.05}>...</JellyCard>
 *   ))}
 *
 * Skip the animation entirely with `disableMotion` (e.g. in tests
 * where motion would flicker).
 */

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode, CSSProperties, KeyboardEvent } from 'react'

export interface JellyCardProps {
  children: ReactNode
  /** Stagger entrance — pass index * 0.04 for a row of cards. */
  delay?: number
  /** Disable the entrance animation (still animates hover/tap).
   *  Use when the parent already controls visibility. */
  noEnter?: boolean
  /** Disable the hover lift. Use on full-width banners where a
   *  3D tilt feels like the page is wobbling. */
  noHover?: boolean
  /** Skip the entire motion treatment. Useful in tests. */
  disableMotion?: boolean
  className?: string
  style?: CSSProperties
  /** Full-area click handler. Forwarded to the motion wrapper so
   *  the whole card is the hit target (no need to add interactive
   *  styling to the child). */
  onClick?: () => void
}

export function JellyCard({
  children,
  delay = 0,
  noEnter = false,
  // noHover is accepted for API compatibility but no longer needed —
  // JellyCard has no hover transform to disable.
  disableMotion = false,
  className,
  style,
  onClick,
}: JellyCardProps) {
  const reducedMotion = useReducedMotion()
  // Respect the OS-level "reduce motion" preference. WCAG / a11y
  // best practice — also a courtesy to operators who get queasy
  // on dashboards full of springs.
  const a11y = onClick
    ? {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        },
      }
    : undefined
  if (disableMotion || reducedMotion) {
    return (
      <div className={className} style={style} onClick={onClick} {...a11y}>
        {children}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      style={style}
      onClick={onClick}
      {...a11y}
      initial={noEnter ? false : { scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        // Soft spring — overshoot but lands gently. damping/stiffness
        // tuned so a 10-card grid takes <1s to settle.
        type: 'spring',
        stiffness: 280,
        damping: 22,
        delay,
      }}
      // No hover transform — the card stays put (no lift/scale) so it
      // never reads as layout shift. `noHover` is kept for API compat.
      whileTap={onClick ? { scale: 0.985 } : undefined}
    >
      {children}
    </motion.div>
  )
}
