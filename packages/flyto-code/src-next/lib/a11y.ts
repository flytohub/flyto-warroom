import type { KeyboardEvent } from 'react'

/**
 * clickableA11y — spread onto a non-button element (Box/Typography/li) that
 * has an onClick acting as a button, so keyboard + screen-reader users can
 * reach it. Returns role/tabIndex + an onKeyDown that fires the handler on
 * Enter/Space (and prevents the Space-scroll default).
 *
 *   <Box onClick={go} {...clickableA11y(go)} aria-label="Open projects" />
 *
 * Pass a disabled flag to drop it out of the tab order.
 */
export function clickableA11y(
  onActivate: () => void,
  opts?: { disabled?: boolean; label?: string },
) {
  return {
    role: 'button' as const,
    tabIndex: opts?.disabled ? -1 : 0,
    'aria-disabled': opts?.disabled || undefined,
    'aria-label': opts?.label,
    onKeyDown: (e: KeyboardEvent) => {
      if (opts?.disabled) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
  }
}
