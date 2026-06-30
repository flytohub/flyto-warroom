/**
 * SurfacePlaceholder — the honest destination for a surface that is
 * advertised on the platform but whose backend isn't wired yet
 * (status: 'soon' in projectModules). Instead of a dead link or a blank
 * page, the surface lands here: a clear "this is configured / coming
 * soon" panel, optionally pointing the user at the one action they CAN
 * take today (e.g. connect an IdP in Settings → Integrations).
 *
 * Pure presentation — no data fetching. Dual-mode (semantic tokens),
 * lucide icon, violet brand accent, per the design rules.
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import { alpha, useTheme } from '@mui/material/styles'
import type { LucideIcon } from 'lucide-react'
import { Activity, ArrowRight, DatabaseZap, Radar, Sparkles, Workflow } from 'lucide-react'
import { t, tOr } from '@lib/i18n';

export interface SurfacePlaceholderProps {
  Icon: LucideIcon
  title: string
  description: string
  /** Status pill text — defaults to "Coming soon". */
  badge?: string
  /** Secondary line under the description (e.g. what's needed to enable). */
  note?: string
  /** The single action available today, if any. */
  cta?: { label: string; onClick: () => void; icon?: LucideIcon }
}

const statusRows = [
  { icon: Radar, label: 'Signal', value: 'Source pending', valueKey: 'surface.statusRow.signalStatus' },
  { icon: DatabaseZap, label: 'Evidence', value: 'Waiting for data', valueKey: 'surface.statusRow.evidenceStatus' },
  { icon: Workflow, label: 'Loop', value: 'Ready to attach', valueKey: 'surface.statusRow.loopStatus' },
] as const

export function SurfacePlaceholder({ Icon, title, description, badge, note, cta }: SurfacePlaceholderProps) {
  const theme = useTheme()
  const CtaIcon = cta?.icon
  const accent = theme.palette.info.main
  const accentSoft = alpha(accent, theme.palette.mode === 'dark' ? 0.18 : 0.1)
  const border = alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.1)

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        px: { xs: 2, md: 4 },
        py: { xs: 2, md: 3 },
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 980,
          mx: 'auto',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 300px' },
          gap: { xs: 2, md: 3 },
          alignItems: 'stretch',
          border: '1px solid',
          borderColor: border,
          borderRadius: 1,
          bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.62 : 0.86),
          boxShadow: theme.palette.mode === 'dark' ? 'none' : `0 18px 48px ${alpha(theme.palette.common.black, 0.06)}`,
        }}
      >
        <Box sx={{ p: { xs: 2.25, md: 3 }, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: accentSoft,
                border: '1px solid',
                borderColor: alpha(accent, 0.24),
                color: accent,
                flexShrink: 0,
              }}
            >
              <Icon size={21} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Chip
                size="small"
                icon={<Sparkles size={13} />}
                label={badge ?? t('projects.coverage.soon')}
                sx={{
                  height: 24,
                  fontWeight: 700,
                  fontSize: 12,
                  bgcolor: accentSoft,
                  color: accent,
                  border: '1px solid',
                  borderColor: alpha(accent, 0.2),
                }}
              />
            </Box>
          </Box>

          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1.18 }}>{title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 640, lineHeight: 1.55 }}>
              {description}
            </Typography>
            {note && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, maxWidth: 640, lineHeight: 1.45 }}>
                {note}
              </Typography>
            )}
          </Box>

          {cta && (
            <Box>
              <Button
                variant="contained"
                onClick={cta.onClick}
                startIcon={CtaIcon ? <CtaIcon size={16} /> : undefined}
                endIcon={<ArrowRight size={15} />}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1, px: 2.5, boxShadow: 'none' }}
              >
                {cta.label}
              </Button>
            </Box>
          )}
        </Box>

        <Box
          sx={{
            borderLeft: { md: '1px solid' },
            borderTop: { xs: '1px solid', md: 0 },
            borderColor: border,
            p: { xs: 2, md: 2.5 },
            bgcolor: alpha(theme.palette.action.hover, theme.palette.mode === 'dark' ? 0.42 : 0.54),
          }}
        >
          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Activity size={15} style={{ color: accent }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('surface.statusLabel')}
              </Typography>
            </Box>
            <Divider />
            {statusRows.map((row) => {
              const RowIcon = row.icon
              return (
                <Box key={row.label} sx={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 1.25, alignItems: 'center' }}>
                  <Box sx={{ color: alpha(theme.palette.text.primary, 0.58), display: 'flex' }}>
                    <RowIcon size={16} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.1 }}>
                      {row.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
                      {tOr(row.valueKey, row.value)}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
