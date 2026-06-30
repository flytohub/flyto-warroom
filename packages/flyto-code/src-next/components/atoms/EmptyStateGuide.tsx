import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import type { ReactNode } from 'react'
import { colors, softBg } from '@/styles/designTokens'

export type EmptyStateGuideStep = {
  label: string
  hint?: string
}

export type EmptyStateGuideProps = {
  /** lucide-react icon component, rendered at ~28px in a slate-tinted square */
  icon?: ReactNode
  title: string
  /** One short paragraph; keep under ~120 chars so the empty state stays scannable. */
  description?: string
  /** Optional 2–4 short bullets the user can mentally check off. */
  steps?: EmptyStateGuideStep[]
  /** Primary action — the one thing we want the user to do next. */
  primaryAction?: { label: string; onClick: () => void; icon?: ReactNode }
  /** Optional secondary (lower-priority) action. */
  secondaryAction?: { label: string; onClick: () => void; icon?: ReactNode }
  /** Escape hatch for an existing composed action control. Prefer primaryAction for new code. */
  actionSlot?: ReactNode
  /** Override the outer container's vertical padding. */
  py?: number
}

/**
 * EmptyStateGuide — replaces the previous "No data, connect repos first"
 * generic placeholder with something the user can actually act on. The
 * shape is intentionally rigid: ONE icon, ONE title, ONE primary CTA,
 * optionally a numbered step list. Pages that adopt this should put the
 * primary action exactly where the user's eye lands first.
 *
 * Design rules (see feedback_ui_grounded_palette.md):
 *  - Icon background is slate-tinted at low opacity — not a saturated
 *    brand colour. Brand violet is reserved for the CTA button.
 *  - Steps are numbered with subtle bullets, not coloured pills.
 *  - Single semantic colour appears only inside the icon glyph (not its
 *    background) and even there, neutral by default.
 */
export function EmptyStateGuide({
  icon,
  title,
  description,
  steps,
  primaryAction,
  secondaryAction,
  actionSlot,
  py = 8,
}: EmptyStateGuideProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py,
        px: 3,
        gap: 2,
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 2,
            bgcolor: softBg(colors.semantic.neutral),
            color: 'text.secondary',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1,
          }}
        >
          {icon}
        </Box>
      )}

      <Typography variant="h6" fontWeight={700} className="tracking-tight">
        {title}
      </Typography>

      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 480 }}
        >
          {description}
        </Typography>
      )}

      {steps && steps.length > 0 && (
        <Box
          component="ol"
          sx={{
            listStyle: 'none',
            p: 0,
            m: 0,
            mt: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            textAlign: 'left',
            maxWidth: 420,
          }}
        >
          {steps.map((s, i) => (
            <Box
              key={i}
              component="li"
              sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  bgcolor: 'rgba(148, 163, 184, 0.16)',
                  color: 'text.secondary',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  mt: 0.25,
                }}
              >
                {i + 1}
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {s.label}
                </Typography>
                {s.hint && (
                  <Typography variant="caption" color="text.secondary">
                    {s.hint}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {(primaryAction || secondaryAction) && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
          {primaryAction && (
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={primaryAction.icon}
              onClick={primaryAction.onClick}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="outlined"
              size="large"
              startIcon={secondaryAction.icon}
              onClick={secondaryAction.onClick}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              {secondaryAction.label}
            </Button>
          )}
        </Box>
      )}

      {actionSlot && <Box sx={{ mt: primaryAction || secondaryAction ? 0 : 2 }}>{actionSlot}</Box>}
    </Box>
  )
}

export default EmptyStateGuide
