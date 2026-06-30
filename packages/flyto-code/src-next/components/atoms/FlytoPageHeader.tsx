/**
 * FlytoPageHeader — the canonical page-title block.
 *
 * Mirrors the Fuse-React-v17 demo's header layout (see
 * `Fuse-React-v17.0.0-vitejs-demo/src/app/(control-panel)/apps/contacts/components/ui/ContactsHeader.tsx`).
 * The 2026-05-19 audit found that page headers across compound views
 * were each rolling their own MUI sx layout — some had gradient icon
 * boxes, some had `<Typography variant="h5">`, some had nothing — and
 * the inconsistency was the single biggest contributor to the
 * "縫合怪" feel. This atom fixes it: one component, one layout, one
 * typography hierarchy.
 *
 * Usage:
 *
 *   <FlytoPageHeader
 *     title="Architecture Overview"
 *     subtitle="Per-repo health, structure & shared services"
 *     action={<Button>Run scan</Button>}
 *   />
 *
 * The full Fuse pattern also wraps the page in `FusePageSimple`, but
 * the workspace dispatcher (WarRoomView) already provides the outer
 * scroll/padding wrapper via the `Box sx={{ height:'100%',
 * overflowY:'auto', p:3 }}` convention — keeping that intact preserves
 * the user-loved scrollbar (`我覺得滾軸很好看 不要亂改` memory).
 */

import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { flytoLayout, flytoSpacing, flytoTypography } from '@/styles/visualSystem'

export interface FlytoPageHeaderProps {
  /** Page title — rendered at text-2xl. */
  title: ReactNode
  /** Optional subtitle — rendered at text-base secondary. Wrap long
   *  copy in a single string; the layout will keep it on its own line
   *  below the title. */
  subtitle?: ReactNode
  /** Optional right-aligned slot for filter dropdowns, primary CTA
   *  buttons, count chips, etc. */
  action?: ReactNode
  /** Inline count chip rendered after the title (e.g. "23 issues").
   *  Pair with `action` only when both are short — a long action area
   *  next to a count chip starts to feel cramped at <1280px. */
  count?: ReactNode
  /** Optional tab bar rendered full-width BELOW the title row. Lets a
   *  detail view combine "header + tabs" in one component instead of
   *  rolling its own Box+Tabs layout. Pass an <TabBar /> here. */
  tabs?: ReactNode
  /** Bottom margin override. Default `mb-6` matches the Fuse demo's
   *  spacing between header and first content row. Set `0` when the
   *  next sibling is a tab bar that owns its own spacing. */
  bottomGap?: 0 | 4 | 6 | 8
}

export function FlytoPageHeader({
  title,
  subtitle,
  action,
  count,
  tabs,
  bottomGap = 6,
}: FlytoPageHeaderProps) {
  const mb = bottomGap === 0 ? 'mb-0' : `mb-${bottomGap}`
  const header = (
    <Box
      className={`${tabs ? '' : mb} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}
      sx={{
        flexShrink: 0,
        py: 0.25,
      }}
    >
      <Box className="flex flex-auto flex-col gap-1 min-w-0">
        <Box className="flex items-center gap-3">
          <Typography
            component="h1"
            sx={{
              ...flytoTypography.pageTitle,
              // Long titles ellipsis-clip on narrow screens instead of
              // breaking the header into two awkward lines.
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {title}
          </Typography>
          {count != null && (
            <Box sx={{ flexShrink: 0 }}>{count}</Box>
          )}
        </Box>
        {subtitle && (
          <Typography
            color="text.secondary"
            sx={{ ...flytoTypography.pageSubtitle, mt: 0.25, ml: 0.5, maxWidth: flytoLayout.headerSubtitleMaxWidth }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && (
        <Box
          className="flex items-center"
          sx={{
            flexShrink: 1,
            flexWrap: 'wrap',
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            minWidth: 0,
            width: { xs: '100%', sm: 'auto' },
            gap: flytoSpacing.actionGap,
            '& > *': {
              minWidth: 0,
              maxWidth: '100%',
            },
          }}
        >
          {action}
        </Box>
      )}
    </Box>
  )

  if (!tabs) return header

  // Header + tab bar combined: the title row keeps its own spacing, the
  // tab bar sits below full-width, and the outer wrapper owns bottomGap.
  return (
    <Box className={mb === 'mb-0' ? '' : mb} sx={{ flexShrink: 0 }}>
      {header}
      <Box sx={{ mt: 2 }}>{tabs}</Box>
    </Box>
  )
}
