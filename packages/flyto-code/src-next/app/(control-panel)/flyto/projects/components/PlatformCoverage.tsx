/**
 * PlatformCoverage — animated "what Warroom covers" showcase band.
 *
 * Surfaces the real breadth of the platform (the 8 data surfaces from
 * the project-module catalogue) so the projects landing page reflects
 * how much it now does, instead of a sparse 3-shortcut row. Each tile
 * is a create-CTA. Tasteful, tech-flavoured motion: staggered fade-up
 * entrance + hover lift/glow, all disabled under prefers-reduced-motion.
 *
 * Dual-mode (semantic palette tokens, no hardcoded surface colours),
 * lucide icons, violet brand accent — per the project design rules.
 */
import { keyframes } from '@emotion/react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { Code2, Globe, Cloud, Package, Bot, Eye, Bug, Fingerprint, ShieldCheck, type LucideIcon } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { PROJECT_MODULES } from './projectModules'

const BRAND = '#7c3aed'

const ICON: Record<string, LucideIcon> = {
  code_audit: Code2, ctem: Globe, cspm: Cloud, container: Package,
  mcp: Bot, dark_web: Eye, vuln_mgmt: Bug, identity: Fingerprint,
}

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
`
const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.6); }
`
const shimmer = keyframes`
  from { transform: translateX(-120%) skewX(-18deg); }
  to   { transform: translateX(320%) skewX(-18deg); }
`
const breathe = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.0); }
  50%      { box-shadow: 0 0 14px 1px rgba(124,58,237,0.35); }
`

export function PlatformCoverage({ onPick }: { onPick: (moduleId: string) => void }) {
  // The eight standalone data surfaces (exclude cross-cutting add-ons /
  // reporting — those layer on top rather than being their own surface).
  const surfaces = PROJECT_MODULES.filter((m) => !m.crossCutting)

  return (
    <Box sx={{ mb: 4 }}>
      {/* Section header with a live pulse dot for a subtle SOC feel. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.75 }}>
        <ShieldCheck size={15} style={{ color: BRAND }} />
        <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: '0.08em', color: 'text.secondary' }}>
          {t('projects.coverage.title')}
        </Typography>
        <Box
          aria-hidden
          sx={{
            width: 7, height: 7, borderRadius: '50%', bgcolor: '#22c55e',
            boxShadow: '0 0 0 3px rgba(34,197,94,0.18)',
            animation: `${pulse} 2.4s ease-in-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {t('projects.coverage.subtitle')}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1.5,
        }}
      >
        {surfaces.map((m, i) => {
          const Icon = ICON[m.id] ?? ShieldCheck
          const status = m.status ?? 'live'
          return (
            <Paper
              key={m.id}
              elevation={0}
              role="button"
              tabIndex={0}
              onClick={() => onPick(m.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(m.id) } }}
              sx={{
                position: 'relative',
                p: 2,
                borderRadius: 2.5,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                cursor: 'pointer',
                overflow: 'hidden',
                // staggered entrance
                animation: `${fadeUp} 0.5s ease both`,
                animationDelay: `${i * 0.055}s`,
                transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                // faint tech sheen (radial), only visible on hover
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(120% 100% at 100% 0%, ${BRAND}1f, transparent 60%)`,
                  opacity: 0,
                  transition: 'opacity 0.18s ease',
                  pointerEvents: 'none',
                },
                // glossy light bar that sweeps across on hover
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0, left: 0, width: '45%', height: '100%',
                  background: 'linear-gradient(115deg, transparent, rgba(255,255,255,0.22), transparent)',
                  transform: 'translateX(-120%) skewX(-18deg)',
                  pointerEvents: 'none',
                  zIndex: 2,
                },
                '&:hover, &:focus-visible': {
                  transform: 'translateY(-4px)',
                  borderColor: BRAND,
                  boxShadow: `0 14px 34px -12px ${BRAND}99, 0 0 0 1px ${BRAND}55`,
                  outline: 'none',
                  '&::after': { opacity: 1 },
                  '&::before': { animation: `${shimmer} 0.85s ease` },
                  '& .pc-icon': { transform: 'scale(1.12)', boxShadow: `0 0 18px 2px ${BRAND}66`, bgcolor: `${BRAND}26` },
                },
                '@media (prefers-reduced-motion: reduce)': {
                  animation: 'none',
                  '&:hover, &:focus-visible': { transform: 'none', '&::before': { animation: 'none' } },
                },
              }}
            >
              {status !== 'live' && (
                <Box
                  sx={{
                    position: 'absolute', top: 8, right: 8, zIndex: 3,
                    px: 0.85, py: 0.15, borderRadius: 1,
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: status === 'soon' ? 'text.secondary' : BRAND,
                    bgcolor: status === 'soon' ? 'action.hover' : `${BRAND}1a`,
                    border: status === 'soon' ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  {status === 'soon'
                    ? t('projects.coverage.soon')
                    : t('projects.coverage.beta')}
                </Box>
              )}
              <Box
                className="pc-icon"
                sx={{
                  position: 'relative', zIndex: 1,
                  width: 38, height: 38, borderRadius: 2, mb: 1.25,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: `${BRAND}15`, color: BRAND,
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease',
                  animation: `${breathe} 3.6s ease-in-out infinite`,
                  animationDelay: `${i * 0.28}s`,
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              >
                <Icon size={19} />
              </Box>
              <Typography variant="body2" fontWeight={700} sx={{ position: 'relative' }}>
                {tOr(m.titleKey, m.titleFallback)}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  position: 'relative', display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4, mt: 0.25, minHeight: 34,
                }}
              >
                {tOr(m.descKey, m.descFallback)}
              </Typography>
              {/* Vendor-agnostic on purpose — the platform is never tied to
                  any single product, so we never name a vendor here. Specific
                  providers are user-chosen options inside the create wizard. */}
              <Typography variant="caption" sx={{ position: 'relative', display: 'block', mt: 0.75, color: BRAND, fontWeight: 600, fontSize: 12 }}>
                {t('projects.coverage.flytoByo')}
              </Typography>
            </Paper>
          )
        })}
      </Box>
    </Box>
  )
}
