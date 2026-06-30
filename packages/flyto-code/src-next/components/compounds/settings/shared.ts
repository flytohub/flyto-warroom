import type { SxProps, Theme } from '@mui/material/styles'

// Brand violet — matches @atoms/techConsole BRAND so the settings area reads
// as the same SOC-console family as the rest of the product.
const BRAND = '#8b5cf6'

// Section header: a glowing brand dot is prepended (as a flex pseudo-item)
// before the section icon, echoing the ConsoleSectionLabel used elsewhere.
export const sectionTitleSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  mb: 1.5,
  mt: 0.5,
  '&::before': {
    content: '""',
    width: 6,
    height: 6,
    borderRadius: '2px',
    backgroundColor: BRAND,
    boxShadow: `0 0 6px ${BRAND}`,
    flexShrink: 0,
  },
}

export const cardSx: SxProps<Theme> = {
  borderRadius: 3,
  p: 0,
  mb: 3,
  border: '1px solid',
  borderColor: 'divider',
  overflow: 'hidden',
  bgcolor: 'background.paper',
  backgroundImage: 'none',
  boxShadow: 1,
}

/** Card with colored left accent border matching the section icon color.
 *  Adds a top accent hairline + a soft colour-matched hover glow so the
 *  cards read as console panels (mirrors the techTile treatment). The
 *  ::before is a 2px top strip only — it never overlays card content. */
export const accentCardSx = (color: string): SxProps<Theme> => ({
  ...cardSx,
  position: 'relative',
  borderLeft: `3px solid ${color}`,
  transition: 'box-shadow .18s ease, border-color .18s ease',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: `linear-gradient(90deg, ${color}, ${color}00 70%)`,
    zIndex: 1,
  },
  '&:hover': {
    boxShadow: `0 0 0 1px ${color}22, 0 10px 26px -16px ${color}77`,
  },
})

export const rowSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  px: 2.5,
  py: 2.5,
  borderBottom: 1,
  borderColor: 'divider',
  transition: 'background 0.15s ease',
  '&:hover': { bgcolor: 'action.hover' },
  '&:last-child': { borderBottom: 0 },
}

export const iconBoxSx = (color: string) => ({
  width: 32,
  height: 32,
  borderRadius: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: `${color}15`,
  flexShrink: 0,
})

export const selectSx: SxProps<Theme> = {
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 2,
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'divider',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(167,139,250,0.4)',
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: '#a78bfa',
  },
}

export const switchSx: SxProps<Theme> = {
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: '#a78bfa',
    '& + .MuiSwitch-track': {
      bgcolor: 'rgba(167,139,250,0.5)',
    },
  },
}

export const integrationCardSx = (connected: boolean) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  p: 2.5,
  borderRadius: 3,
  border: '1px solid',
  borderColor: connected ? 'rgba(52,211,153,0.18)' : 'divider',
  bgcolor: 'background.paper',
  backgroundImage: 'none',
  transition: 'all 0.2s ease',
  '&:hover': {
    borderColor: connected ? 'rgba(52,211,153,0.3)' : 'rgba(167,139,250,0.3)',
    boxShadow: connected
      ? '0 2px 16px rgba(52,211,153,0.12)'
      : '0 2px 16px rgba(139,92,246,0.12)',
    bgcolor: 'action.hover',
  },
})

export const logoBoxSx = (bgColor: string) => ({
  width: 44,
  height: 44,
  borderRadius: 2.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: bgColor,
  flexShrink: 0,
})

export const statusDotSx = (connected: boolean) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  bgcolor: connected ? '#34d399' : 'text.disabled',
  boxShadow: connected ? '0 0 8px rgba(52,211,153,0.6)' : 'none',
  flexShrink: 0,
})

export const gradientBtnSx = (from: string, to: string, hoverFrom: string, hoverTo: string) => ({
  textTransform: 'none' as const,
  fontWeight: 700,
  borderRadius: 2,
  px: 2.5,
  py: 0.75,
  fontSize: 13,
  background: `linear-gradient(135deg, ${from}, ${to})`,
  color: '#fff',
  border: 'none',
  // No box-shadow glow — keeps these gradient CTAs flat like the rest of
  // the app (the earlier glow sweep missed this shared helper; SourceControlTab
  // consumes it).
  '&:hover': {
    background: `linear-gradient(135deg, ${hoverFrom}, ${hoverTo})`,
  },
})

/** Theme-aware input styling for MUI TextField */
export const inputSx: SxProps<Theme> = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    fontSize: 13,
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(167,139,250,0.4)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a78bfa' },
  },
  '& .MuiInputLabel-root': {
    '&.Mui-focused': { color: '#a78bfa' },
  },
}
