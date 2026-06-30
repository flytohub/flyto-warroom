/**
 * PageShell — the one wrapper every workspace page goes through.
 *
 * Enforces the scroll discipline that's bitten us three times in
 * production (see feedback_workspace_scroll_pattern memory): outer
 * page固定，內容 vertical-only scroll，永不出現 horizontal scrollbar.
 *
 * Use this instead of writing `<Box sx={{ overflow: 'auto' }}>` ad-hoc
 * in every Page component. The Page components in
 * app/(control-panel)/flyto/workspace/components/pages/ should be one
 * line:
 *
 *   <PageShell><WhateverView /></PageShell>
 *
 * Variants:
 *   - `padded` (default true) — adds standard page padding. Set false
 *     when the inner view manages its own padding (e.g. full-height
 *     three-column layouts like IssuesView).
 *   - `maxWidth` — caps the reading width when the inner view is a
 *     long-form list rather than a dashboard grid. Default `none`.
 */

import { Suspense } from 'react'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { flytoSpacing } from '@/styles/visualSystem'

export interface PageShellProps {
  children: ReactNode
  /** Wrap children in <Suspense> with the standard spinner fallback. */
  suspense?: boolean
  /** Add standard page padding around the children. Disable for views
   *  that own their own chrome (sidebar layouts, full-height grids). */
  padded?: boolean
  /** Cap reading width — useful for long-form content lists. */
  maxWidth?: number | 'none'
  /** Scroll responsibility.
   *
   *  - `self` (default): PageShell handles vertical scroll. Pick this
   *    when the inner view is a long top-to-bottom dashboard / list
   *    that doesn't manage scroll itself.
   *  - `host`: PageShell only constrains height; the inner view owns
   *    its own scroll regions (e.g. PulseView's bento grid with a
   *    sticky header, IssuesView's 3-column layout with independent
   *    panels). Outer container becomes `overflow: hidden`.
   */
  scroll?: 'self' | 'host'
  /** Optional className for one-off tweaks (e.g. theming dark sections). */
  className?: string
}

export function PageShell({
  children,
  suspense = true,
  padded = true,
  maxWidth = 'none',
  scroll = 'self',
  className,
}: PageShellProps) {
  const inner = padded ? (
    <Box
      sx={{
        // Page padding scales with viewport so dashboards breathe on
        // large monitors without crowding mobile.
        px: flytoSpacing.pageX,
        py: flytoSpacing.pageY,
        ...(maxWidth !== 'none' && {
          maxWidth,
          mx: 'auto',
        }),
        // Defensive minWidth: 0 — even though the outer Box has
        // overflowX: 'hidden', a flex/grid parent could still trip up
        // shrinking. Belt + braces.
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  ) : (
    children
  )

  return (
    <Box
      className={className}
      sx={{
        // The scroll contract. DO NOT change without re-reading
        // feedback_workspace_scroll_pattern memory.
        position: 'relative',
        width: '100%',
        height: '100%',
        minWidth: 0,
        bgcolor: 'background.default',
        ...(scroll === 'self'
          ? { overflowY: 'auto', overflowX: 'hidden' }
          : { overflow: 'hidden' }),
      }}
    >
      {suspense ? (
        <Suspense fallback={<PageShellFallback />}>
          {inner}
        </Suspense>
      ) : inner}
    </Box>
  )
}

function PageShellFallback() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
      <CircularProgress size={24} />
    </Box>
  )
}
