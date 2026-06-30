// Shared atoms for the scan-result war-room views.
// Split from ScanViews.tsx (was 673 LOC).
// Rewritten to use MUI components with theme-aware colors.

import { Box as LucideBox } from 'lucide-react'
import {
  Box,
  Chip,
} from '@mui/material'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'

// low = canonical SEVERITY_TONE.low (slate #64748b) — was #22d3ee cyan
export const SEV_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#64748b',
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#64748b',
}

const SEV_MUI_COLOR: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  CRITICAL: 'error',
  HIGH: 'warning',
  MEDIUM: 'warning',
  LOW: 'info',
  critical: 'error',
  high: 'warning',
  medium: 'warning',
  low: 'info',
}

export function Loading() {
  return <LoadingState variant="spinner" py={8} />
}

export function Empty({ icon: Icon, text, description, action }: {
  icon: typeof LucideBox
  text: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Box sx={{ width: '100%', minHeight: 168, display: 'grid', placeItems: 'center', p: { xs: 2, md: 3 } }}>
      <EmptyStateGuide
        icon={<Icon size={28} />}
        title={text}
        description={description}
        actionSlot={action}
        py={2}
      />
    </Box>
  )
}

// ── Shared layout wrappers ──────────────────────────────

/** Root container for all scan views. Pins its height to the parent
 *  flex slot and does NOT scroll — only child regions scroll. */
export function ScanViewRoot({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{
      height: '100%',
      minWidth: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      p: { xs: 2, md: 3 },
    }}>
      {children}
    </Box>
  )
}

/** Page header used by scan views and several arch/domain views.
 *
 *  Renders the Fuse typography hierarchy (text-3xl + text-md secondary)
 *  instead of the old gradient-icon-box. After the 2026-05-19 audit it
 *  turned out the gradient boxes were the single biggest visual-noise
 *  source on these pages — and the sidebar already carries section-
 *  level icon identity (`section.headerIcon`), so the per-page icon
 *  was duplicating that signal.
 *
 *  `icon` / `gradient` / `countColor` are kept in the signature so
 *  existing callers don't need a wholesale rewrite, but they are
 *  intentionally ignored. The optional `count` still renders as a
 *  subtle chip aligned to the right of the title block.
 */
export function ScanViewHeader({ title, subtitle, count }: {
  icon?: typeof LucideBox
  gradient?: string
  title: string
  subtitle: string
  count?: number
  countColor?: string
}) {
  return (
    <FlytoPageHeader
      title={title}
      subtitle={subtitle}
      count={
        count != null && count > 0 ? (
          <Chip
            label={count}
            size="small"
            sx={{
              fontWeight: 600,
              bgcolor: 'action.selected',
              color: 'text.primary',
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
        ) : undefined
      }
    />
  )
}

export function SevBadge({ severity }: { severity: string }) {
  const muiColor = SEV_MUI_COLOR[severity] ?? 'default'
  return (
    <Chip
      label={severity}
      size="small"
      color={muiColor}
      variant="outlined"
      sx={{ fontWeight: 600, fontSize: 12, height: 24 }}
    />
  )
}
