/**
 * FindingRow — the recurring "left chip / icon · title + subtitle · metric / chevron"
 * row pattern, extracted into one primitive.
 *
 * Replaces hand-rolled versions in:
 *   - dashboard/DashboardView.tsx (PriorityActionRow, PulseRow)
 *   - pulse/PulseView.tsx (BentoCard's compact mode)
 *   - security/IssuesSidebar.tsx (CategoryItem)
 *   - + 4 more places
 *
 * Design contract:
 *   - Severity colour ONLY for the severity chip + (optional) metric.
 *     Source / type / repo are NOT severity — pass them as neutral chips.
 *   - fontSize floor: title 14px, subtitle 13px, chip 12px, metric 16px.
 *   - Truncation: title + subtitle clip with ellipsis; metric is
 *     fixed-width and right-aligned so columns line up.
 *   - Clickable: pass `onClick` to make the row a ButtonBase with
 *     hover state. Otherwise renders as a plain Box.
 */

import type { ReactNode, MouseEvent } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import ButtonBase from '@mui/material/ButtonBase'
import { ChevronRight } from 'lucide-react'
import { fontSize, severity as severityColors } from '@lib/tokens'

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | string

export interface FindingRowProps {
  /** Optional severity / category badge on the left. Pass a string
   *  like "CRITICAL" — severity colour is resolved from the value. */
  severity?: FindingSeverity
  /** Override the severity → colour map (rare). */
  severityColor?: string
  /** Optional leading index numeral ("1.", "2."). */
  index?: number | string
  /** Optional leading icon (in place of severity chip / index). */
  leading?: ReactNode
  /** Primary row label. */
  title: ReactNode
  /** Optional secondary line — repo path, CVE id, etc. */
  subtitle?: ReactNode
  /** Optional neutral chips (PY, Container, ...) — these are NOT severity. */
  neutralChips?: ReactNode[]
  /** Optional right-side metric — pass {value, label?, tone} for the
   *  blast number + flame icon pattern. */
  metric?: {
    value: number | string
    /** Tone drives colour: 'critical' | 'high' | 'medium' | 'low' | undefined. */
    tone?: FindingSeverity
    /** Optional icon adjacent to the metric. */
    icon?: ReactNode
    /** Sub-label (e.g. "blast"). */
    label?: string
  }
  /** Click handler. When provided, the row becomes interactive. */
  onClick?: () => void
  /** Show a trailing chevron when the row is clickable. */
  showChevron?: boolean
  /** Extra CSS classes (rare). */
  className?: string
}

function severityToColor(sev: string | undefined): string {
  switch ((sev ?? '').toLowerCase()) {
    case 'critical': return severityColors.critical
    case 'high':     return severityColors.high
    case 'medium':
    case 'moderate': return severityColors.medium
    case 'low':      return severityColors.low
    default:         return severityColors.neutral
  }
}

export function FindingRow({
  severity,
  severityColor,
  index,
  leading,
  title,
  subtitle,
  neutralChips,
  metric,
  onClick,
  showChevron = true,
  className,
}: FindingRowProps) {
  const sevColor = severityColor ?? severityToColor(severity)
  const metricColor = metric?.tone ? severityToColor(metric.tone) : 'text.secondary'

  const interactive = !!onClick
  const handleClick = onClick
    ? (_: MouseEvent<HTMLElement>) => onClick()
    : undefined

  return (
    <Box
      component={interactive ? ButtonBase : 'div'}
      className={className}
      onClick={handleClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        width: '100%',
        textAlign: 'left',
        px: 1.5,
        py: 1.25,
        borderRadius: 1.5,
        cursor: onClick ? 'pointer' : 'default',
        ...(onClick && {
          '&:hover': { bgcolor: 'action.hover' },
        }),
      }}
    >
      {/* Leading: index, leading slot, or severity chip — pick whichever
          props are set, in that order. */}
      {index !== undefined && (
        <Typography
          fontWeight={700}
          sx={{
            color: 'text.secondary',
            fontSize: fontSize.bodyLg,
            width: 20,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {typeof index === 'number' ? `${index}.` : index}
        </Typography>
      )}
      {leading}
      {severity && !leading && (
        <Chip
          label={severity.toString().toUpperCase()}
          size="small"
          sx={{
            height: 22,
            fontSize: fontSize.micro,
            fontWeight: 700,
            minWidth: 64,
            bgcolor: `${sevColor}22`,
            color: sevColor,
            flexShrink: 0,
          }}
        />
      )}

      {/* Centre block: title + subtitle. minWidth: 0 forces ellipsis to
          win over the column track. */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          fontWeight={600}
          noWrap
          color="text.primary"
          sx={{
            fontSize: fontSize.body,
            display: 'block',
            lineHeight: 1.4,
          }}
        >
          {title}
        </Typography>
        {(subtitle || (neutralChips && neutralChips.length > 0)) && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              mt: 0.25,
              minWidth: 0,
            }}
          >
            {subtitle && (
              <Typography
                color="text.secondary"
                noWrap
                sx={{ fontSize: fontSize.caption, minWidth: 0 }}
              >
                {subtitle}
              </Typography>
            )}
            {neutralChips}
          </Box>
        )}
      </Box>

      {/* Trailing metric — flame + number style. */}
      {metric && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexShrink: 0,
            color: metricColor,
          }}
        >
          {metric.icon}
          <Typography
            fontWeight={800}
            sx={{
              fontSize: fontSize.metric,
              color: metricColor,
              minWidth: 28,
              textAlign: 'right',
            }}
          >
            {metric.value}
          </Typography>
          {metric.label && (
            <Typography
              sx={{
                fontSize: fontSize.micro,
                color: 'text.secondary',
                ml: 0.25,
              }}
            >
              {metric.label}
            </Typography>
          )}
        </Box>
      )}

      {/* Trailing chevron — affordance for clickable rows. */}
      {onClick && showChevron && (
        <ChevronRight size={16} style={{ opacity: 0.45, flexShrink: 0 }} />
      )}
    </Box>
  )
}
