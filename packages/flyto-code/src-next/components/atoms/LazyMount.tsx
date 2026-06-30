/**
 * LazyMount — render children only once the placeholder Box scrolls
 * into the viewport. Used to defer heavy below-fold widgets
 * (AssetCity3D, ScoreTrendChart) so they don't pay their query +
 * render + WebGL cost on first paint.
 *
 * Once mounted, stays mounted — IntersectionObserver fires once
 * then we disconnect. Re-entering the viewport doesn't unmount,
 * which would lose query cache + scroll position.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'

export interface LazyMountProps {
  children: ReactNode
  /** Placeholder rendered until the box enters viewport. */
  placeholder?: ReactNode
  /** Pixels of root-margin pre-load. Default 200px = mount when
   *  ~half a viewport away from being visible, so by the time the
   *  user scrolls down the widget is already rendered. */
  rootMargin?: string
  /** Minimum height for the placeholder so the scroll position
   *  doesn't shift when the real content mounts. */
  minHeight?: number | string
  className?: string
}

export function LazyMount({
  children,
  placeholder,
  rootMargin = '200px',
  minHeight = 240,
  className,
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (mounted) return
    if (!ref.current) return
    // Fallback for environments without IntersectionObserver
    // (jsdom, old browsers): mount immediately so tests + edge
    // cases don't perma-stall on the placeholder.
    if (typeof IntersectionObserver === 'undefined') {
      setMounted(true)
      return
    }
    const node = ref.current
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMounted(true)
            observer.disconnect()
            return
          }
        }
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [mounted, rootMargin])

  if (mounted) {
    // Fill the parent's box completely after mount. Children
    // often expect height: 100% inheritance (Canvas / Map need a
    // pixel height to render). The placeholder's minHeight is
    // kept as a floor so a missing parent height doesn't collapse
    // the whole region to 0. width: 100% + height: 100% + flex
    // column lets the child fill or `flex: 1` itself.
    // Without this, react-three-fiber's Canvas collapsed to a
    // sliver because the mounted <div> had no intrinsic height
    // (operator 2026-05-23: "3D 怎麼會動到").
    return (
      <Box
        className={className}
        sx={{
          width: '100%', height: '100%',
          minHeight,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {children}
      </Box>
    )
  }
  return (
    <Box
      ref={ref}
      className={className}
      sx={{ minHeight, width: '100%' }}
    >
      {placeholder}
    </Box>
  )
}
