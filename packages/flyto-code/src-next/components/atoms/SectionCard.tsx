import type { ReactNode } from 'react'
import type { SxProps, Theme } from '@mui/material'
import { FlytoSurface } from './FlytoSurface'

/**
 * SectionCard — the one titled-panel primitive.
 *
 * Was previously: nearly every compound opened with the same boilerplate
 * — an outlined Paper (divider border, ~2.5 padding) wrapping a header row
 * of `<Icon/> + <Typography variant="subtitle1" fontWeight={700}>` and then
 * the body. Same shell, copy-pasted per file, drifting in padding and gap.
 *
 * This is that shell, once:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ ⬡  Title                          [action]  │  ← header (optional)
 *   ├─────────────────────────────────────────────┤
 *   │ children                                     │
 *   └─────────────────────────────────────────────┘
 *
 * `action` is pushed to the right of the header (the common "status chip
 * top-right" slot). Omit `title` to get just the bordered card shell.
 */

export interface SectionCardProps {
  title?: ReactNode
  /** Pre-rendered icon node, e.g. `<Plug size={16} />`. */
  icon?: ReactNode
  /** Right-aligned header slot (status chip, button, count…). */
  action?: ReactNode
  /** Inner padding (MUI spacing units). Default 2.5. */
  padding?: number
  children: ReactNode
  sx?: SxProps<Theme>
}

export function SectionCard({
  title, icon, action, padding = 2.5, children, sx,
}: SectionCardProps) {
  return (
    <FlytoSurface
      title={title}
      icon={icon}
      action={action}
      density={padding <= 1.75 ? 'compact' : padding >= 2.5 ? 'spacious' : 'regular'}
      noHeaderDivider
      sx={sx}
      bodySx={(title != null || icon != null || action != null) ? { pt: 0 } : undefined}
    >
      {children}
    </FlytoSurface>
  )
}
