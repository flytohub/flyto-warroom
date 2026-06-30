/**
 * ThreatIntelEmptyState — shared "feed not populated yet" panel for the
 * threat-intel views (actors / malware / ransomware). Replaces the bland
 * outlined-Paper-with-text empty state that read as "broken / ugly" when
 * a feed hadn't ingested yet. Carries the same toned-glow signature as
 * the redesigned cards so an empty page still looks like the product.
 *
 * The admin-only ThreatIntelRefreshButton is embedded as the CTA; it
 * renders nothing for non-admins, so they just see the explainer.
 */
import { Box, Typography, Paper } from '@mui/material'
import type { ReactNode } from 'react'
import { softBg } from '@/styles/designTokens'
import { ThreatIntelRefreshButton } from './ThreatIntelRefreshButton'

export function ThreatIntelEmptyState({
  icon, tone, title, description, refreshSource,
}: {
  icon: ReactNode
  tone: string
  title: string
  description: string
  refreshSource?: 'mitre' | 'ransomware' | 'all'
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: { xs: 4, md: 8 } }}>
      <Paper
        elevation={0}
        sx={{
          maxWidth: 520, width: '100%', textAlign: 'center', borderRadius: 3,
          border: '1px dashed', borderColor: softBg(tone, 0.4),
          bgcolor: softBg(tone, 0.03),
          px: 4, py: { xs: 4, md: 6 },
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
        }}
      >
        <Box sx={{
          width: 64, height: 64, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: softBg(tone, 0.12), color: tone,
          boxShadow: `0 0 28px ${softBg(tone, 0.28)}, inset 0 0 0 1px ${softBg(tone, 0.3)}`,
        }}>
          {icon}
        </Box>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6, maxWidth: 400 }}>
          {description}
        </Typography>
        {refreshSource && (
          <Box sx={{ mt: 1 }}>
            <ThreatIntelRefreshButton source={refreshSource} />
          </Box>
        )}
      </Paper>
    </Box>
  )
}
