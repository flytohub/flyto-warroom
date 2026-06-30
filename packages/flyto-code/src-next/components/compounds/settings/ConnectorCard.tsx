import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { t } from '@lib/i18n';
import { integrationCardSx, logoBoxSx, statusDotSx } from './shared'

// ConnectorCard — the integration/connector row that SourceControlTab and
// IntegrationsTab both repeated ~40 lines of markup for, per provider.
// Presentational only: the connect/manage button is passed as `action`
// so the card stays decoupled from each provider's auth flow. Extracted
// verbatim from the existing markup (behaviour-neutral).

export interface ConnectorScope {
  label: string
  /** Provider tone (hex). Chip bg uses it at ~10% alpha. */
  color: string
}

export interface ConnectorCardProps {
  logo: ReactNode
  /** Background for the logo tile (e.g. 'action.selected' or 'rgba(...)'). */
  logoBg: string
  title: string
  description: string
  /** Connected → green status dot + scope chips; else grey "Disconnected". */
  connected?: boolean
  scopes?: ConnectorScope[]
  /** The connect / manage button (caller-owned). Omitted for comingSoon. */
  action?: ReactNode
  /** Dim + "Coming Soon" chip instead of a status dot; no action. */
  comingSoon?: boolean
  /** Accent (border+text) for the Coming Soon chip. */
  comingSoonColor?: string
}

export function ConnectorCard({
  logo, logoBg, title, description, connected = false,
  scopes, action, comingSoon = false, comingSoonColor = '#2684FF',
}: ConnectorCardProps) {
  return (
    <Box sx={comingSoon ? { ...integrationCardSx(false), opacity: 0.55, pointerEvents: 'none' } : integrationCardSx(connected)}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
        <Box sx={logoBoxSx(logoBg)}>{logo}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
            <Typography variant="body2" fontWeight={700} color="text.primary" sx={{ fontSize: 14 }}>
              {title}
            </Typography>
            {comingSoon ? (
              <Chip
                label={t('settings.comingSoon')}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: 12, fontWeight: 600, borderColor: `${comingSoonColor}4d`, color: comingSoonColor }}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={statusDotSx(connected)} />
                <Typography variant="caption" sx={{ fontWeight: 600, color: connected ? '#34d399' : 'text.secondary', fontSize: 12 }}>
                  {connected ? t('settings.connected') : t('settings.disconnected')}
                </Typography>
              </Box>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
            {description}
          </Typography>
          {connected && scopes && scopes.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
              {scopes.map(s => (
                <Chip key={s.label} label={s.label} size="small"
                  sx={{ height: 24, fontSize: 12, fontWeight: 600, bgcolor: `${s.color}1a`, color: s.color }} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
      {!comingSoon && action}
    </Box>
  )
}
