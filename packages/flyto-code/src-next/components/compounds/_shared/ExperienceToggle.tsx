/**
 * ExperienceToggle — segmented control switching manager / engineer
 * experience mode. Lives in the workspace top bar (ContentToolbar).
 *
 * Writes through useExperience().setMode, which persists to
 * localStorage + reflects into the URL. A motion "pill" slides under
 * the active segment.
 */

import { useExperience, type ExperienceMode } from '@/contexts/ExperienceContext'
import { tOr } from '@lib/i18n'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { useTheme, alpha } from '@mui/material/styles'
import { LayoutDashboard, Wrench } from 'lucide-react'
import { motion } from 'motion/react'

interface Segment {
  mode: ExperienceMode
  labelKey: string
  fallback: string
  icon: typeof LayoutDashboard
}

// Label text is resolved through tOr at render time (translations live in
// flyto-i18n under code.experience.*); the English fallback shows until the
// locale loads. Built here as a const of keys + fallbacks, never resolved
// strings, so it is safe at module scope.
const SEGMENTS: Segment[] = [
  { mode: 'manager', labelKey: 'experience.manager', fallback: 'Manager', icon: LayoutDashboard },
  { mode: 'engineer', labelKey: 'experience.engineer', fallback: 'Engineer', icon: Wrench },
]

export function ExperienceToggle() {
  const { mode, setMode } = useExperience()
  const theme = useTheme()
  const accent = theme.palette.primary.main

  return (
    <Box
      role="tablist"
      aria-label="experience mode"
      sx={{
        position: 'relative',
        display: 'inline-flex',
        p: 0.5,
        gap: 0.5,
        borderRadius: 999,
        bgcolor: alpha(theme.palette.text.primary, 0.06),
        border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
      }}
    >
      {SEGMENTS.map((seg) => {
        const active = seg.mode === mode
        const Icon = seg.icon
        return (
          <ButtonBase
            key={seg.mode}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(seg.mode)}
            sx={{
              position: 'relative',
              px: 1.5,
              py: 0.5,
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
              color: active ? theme.palette.getContrastText(accent) : theme.palette.text.secondary,
              transition: 'color .2s ease',
              zIndex: 1,
            }}
          >
            {active && (
              <motion.span
                layoutId="experience-toggle-pill"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 999,
                  background: accent,
                  zIndex: -1,
                }}
              />
            )}
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <Icon size={14} />
              {tOr(seg.labelKey, seg.fallback)}
            </Box>
          </ButtonBase>
        )
      })}
    </Box>
  )
}
