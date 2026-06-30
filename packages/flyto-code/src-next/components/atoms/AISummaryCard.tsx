/**
 * AISummaryCard — shared AI recommendations card.
 * Extracted from PulseView for reuse in AiPanel.
 */

import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { Sparkles } from 'lucide-react'
import { t } from '@lib/i18n';
import type { PulseAISummary } from '@lib/engine'
import { colors, softBg } from '@/styles/designTokens'

const PRIORITY_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  urgent:    { color: colors.semantic.danger, bg: softBg(colors.semantic.danger, 0.06), border: softBg(colors.semantic.danger, 0.2) },
  important: { color: colors.semantic.warning, bg: softBg(colors.semantic.warning, 0.06), border: softBg(colors.semantic.warning, 0.2) },
  suggested: { color: colors.tech, bg: softBg(colors.tech, 0.06), border: softBg(colors.tech, 0.2) },
}

interface Props {
  summary: PulseAISummary
  compact?: boolean
}

export function AISummaryCard({ summary, compact }: Props) {
  const recs = compact ? summary.recommendations.slice(0, 3) : summary.recommendations

  return (
    <Paper sx={{
      p: compact ? 1.5 : 2.5, borderRadius: 2, mb: 1,
      border: '1px solid', borderColor: softBg(colors.brandDeep, 0.2),
      background: `linear-gradient(135deg, ${softBg(colors.brandDeep, 0.04)} 0%, ${softBg(colors.semantic.info, 0.04)} 100%)`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Sparkles size={14} style={{ color: colors.brandDeep }} />
        <Typography variant={compact ? 'caption' : 'subtitle2'} fontWeight={700} color="text.primary">
          {t('studio.aiRecommendations')}
        </Typography>
      </Box>

      {!compact && summary.summary && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
          {summary.summary}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {recs.map((rec, i) => {
          const style = PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.suggested
          return (
            <Box key={i} sx={{
              display: 'flex', alignItems: 'flex-start', gap: 1,
              p: 1, borderRadius: 1.5,
              bgcolor: style.bg, border: `1px solid ${style.border}`,
            }}>
              <Chip
                label={rec.priority.toUpperCase()}
                size="small"
                sx={{
                  height: 20, fontSize: 12, fontWeight: 700,
                  // Soft tint + colored text (not white on a saturated
                  // colour) so the badge keeps contrast on orange/cyan in
                  // both light and dark mode.
                  bgcolor: alpha(style.color, 0.18), color: style.color,
                  flexShrink: 0, mt: 0.25,
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ fontSize: compact ? 12 : 14 }}>
                  {rec.action}
                </Typography>
                {!compact && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {rec.reason}
                  </Typography>
                )}
              </Box>
              {rec.affected_count > 0 && (
                <Chip label={rec.affected_count} size="small" variant="outlined" sx={{ fontWeight: 700, height: 20, fontSize: 12, flexShrink: 0 }} />
              )}
            </Box>
          )
        })}
      </Box>
    </Paper>
  )
}
