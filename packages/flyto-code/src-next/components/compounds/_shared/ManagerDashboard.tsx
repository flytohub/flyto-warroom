/**
 * ManagerDashboard — the manager-mode page layout primitive.
 *
 * A responsive stack with a per-page IDENTITY layer on top of the
 * shared skeleton:
 *   1. header (title + titleIcon + actions) — accent left rail
 *   2. hero  (the `hero` slot — the page's signature focal visual)
 *   3. KPI row    (the `kpis` slot — typically a row of <KpiCard/>)
 *   4. chart grid (the `charts` slot — auto responsive minmax grid)
 *   5. work items (the `workItems` slot)
 *   6. narrative  (the `narrative` slot — a callout/insight card)
 *
 * Differentiation is COMPOSITION, not forking: pass `accent` (a section
 * token hue) to tint the chrome, `hero` for the page's lead visual, and
 * `layout` to pick one of four named topologies. Every new prop degrades
 * to today's neutral output when omitted, so all existing pages are
 * backward-compatible.
 *
 * Dual-mode guard: `accent` only supplies a HUE. All surfaces still come
 * from the theme palette — alpha/gradient derivation lives here (same as
 * KpiCard's tone path), so a raw hue is never painted as a surface.
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'

/** Page accent (a section-token hue). Nested primitives (ChartCard,
 *  ManagerActionList) read this to tint their title/baseline instead of
 *  the fixed neutral. Undefined → neutral, fully backward-compatible. */
export const ManagerAccentContext = createContext<string | undefined>(undefined)
export function useManagerAccent(): string | undefined {
  return useContext(ManagerAccentContext)
}

export type ManagerLayout = 'dashboard' | 'hero-split' | 'full-bleed' | 'timeline'

export interface ManagerDashboardProps {
  title?: ReactNode
  subtitle?: ReactNode
  /** Top-right actions (filters, export, refresh). */
  actions?: ReactNode
  /** KPI row — render <KpiCard/>s here. Auto-wraps responsively. */
  kpis?: ReactNode
  /** Chart grid — render chart cards here. Auto minmax(340px,1fr). */
  charts?: ReactNode
  workItems?: ReactNode
  /** Narrative / insight callout rendered full-width at the bottom. */
  narrative?: ReactNode
  /** Minimum chart cell width before wrapping. Default 340. */
  chartMinWidth?: number
  /** Section-token hue (e.g. colors.section.exposure). Tints the header
   *  rail, hero frame, and (via context) nested cards. Omit → neutral. */
  accent?: string
  /** The page's signature focal visual — rendered prominently above the
   *  KPI row (or beside it in `hero-split`). This is the "重點". */
  hero?: ReactNode
  /** Layout topology. Default `dashboard` = today's waterfall.
   *  - `hero-split` : hero left, KPI column right
   *  - `full-bleed` : hero edge-to-edge, wide cap
   *  - `timeline`   : single column with a left accent spine */
  layout?: ManagerLayout
  /** lucide icon shown in an accent-tinted chip beside the title — gives
   *  each page a face. Best paired with `accent`. */
  titleIcon?: ReactNode
  /** Internal body scroll policy. Default keeps existing manager pages
   *  unchanged; fixed-workbench pages can set `hidden` and give scroll
   *  responsibility to their own tab panels. */
  contentOverflow?: 'auto' | 'hidden'
}

export function ManagerDashboard({
  title,
  subtitle,
  actions,
  kpis,
  charts,
  workItems,
  narrative,
  chartMinWidth = 340,
  accent,
  hero,
  layout = 'dashboard',
  titleIcon,
  contentOverflow = 'auto',
}: ManagerDashboardProps) {
  const theme = useTheme()
  const location = useLocation()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const dark = theme.palette.mode === 'dark'
  const neutralBorder = alpha(theme.palette.text.primary, dark ? 0.14 : 0.08)
  const border = accent ? alpha(accent, dark ? 0.4 : 0.32) : neutralBorder
  const paperBg = alpha(theme.palette.background.paper, dark ? 0.5 : 0.86)

  const isFullBleed = layout === 'full-bleed'
  const isHeroSplit = layout === 'hero-split'
  const isTimeline = layout === 'timeline'

  useEffect(() => {
    const node = bodyRef.current
    if (!node) return
    node.scrollTop = 0
    node.scrollLeft = 0
  }, [location.pathname, location.search])

  const header = (title || actions) && (
    <Box sx={{
      flexShrink: 0,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 2,
      flexWrap: 'wrap',
      minWidth: 0,
      border: '1px solid',
      borderColor: border,
      borderLeft: accent ? `3px solid ${accent}` : '1px solid',
      borderLeftColor: accent ?? border,
      borderRadius: 1,
      px: { xs: 2, md: 2.5 },
      py: 1.75,
      bgcolor: paperBg,
      ...(accent && {
        backgroundImage: `linear-gradient(90deg, ${alpha(accent, dark ? 0.1 : 0.06)} 0%, transparent 46%)`,
      }),
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
        {titleIcon && (
          <Box sx={{
            width: 38, height: 38, borderRadius: 1.5, flexShrink: 0, mt: 0.25,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: alpha(accent ?? theme.palette.text.primary, dark ? 0.16 : 0.1),
            color: accent ?? theme.palette.text.secondary,
            ...(accent && { boxShadow: `inset 0 0 0 1px ${alpha(accent, 0.3)}` }),
          }}>
            {titleIcon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          {title && (
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800, lineHeight: 1.18 }}>
              {title}
            </Typography>
          )}
          {subtitle && (
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mt: 0.5, maxWidth: 880 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%', alignItems: 'center' }}>{actions}</Box>}
    </Box>
  )

  // Hero frame — an accent-topped card the page fills with its signature
  // visual. Kept light: just framing; the hero content owns its layout.
  const heroFrame = hero && (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      alignItems: 'stretch',
      borderRadius: 1,
      border: '1px solid',
      borderColor: border,
      borderTop: accent ? `2px solid ${accent}` : '1px solid',
      borderTopColor: accent ?? border,
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.5 : 0.92),
      ...(accent && {
        backgroundImage: `linear-gradient(135deg, ${alpha(accent, dark ? 0.07 : 0.05)} 0%, transparent 55%)`,
      }),
      p: { xs: 1.5, md: 2 },
      minWidth: 0,
      maxWidth: '100%',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {hero}
    </Box>
  )

  const kpiGrid = kpis && (
    <Box sx={{
      display: 'grid',
      gap: 1.5,
      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      minWidth: 0,
      flexShrink: 0,
    }}>
      {kpis}
    </Box>
  )

  // In hero-split, the KPIs stack vertically beside the hero.
  const kpiStack = kpis && (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, flexShrink: 0 }}>
      {kpis}
    </Box>
  )

  const chartGrid = charts && (
    <Box sx={{
      display: 'grid',
      gap: 1.5,
      gridTemplateColumns: {
        xs: 'minmax(0, 1fr)',
        sm: isTimeline ? '1fr' : `repeat(auto-fit, minmax(${chartMinWidth}px, 1fr))`,
      },
      alignItems: 'stretch',
      minWidth: 0,
      ...(contentOverflow !== 'hidden' && { flexShrink: 0 }),
      ...(contentOverflow === 'hidden' && {
        flex: { xs: '0 0 auto', lg: '1 1 0' },
        minHeight: { xs: 'auto', lg: 0 },
        gridAutoRows: { xs: 'auto', lg: 'minmax(0, 1fr)' },
      }),
    }}>
      {charts}
    </Box>
  )

  const workItemsGrid = workItems && (
    <Box sx={{
      display: 'grid',
      gap: 1.5,
      gridTemplateColumns: {
        xs: 'minmax(0, 1fr)',
        sm: isTimeline ? '1fr' : 'repeat(auto-fit, minmax(340px, 1fr))',
      },
      minWidth: 0,
      flexShrink: 0,
    }}>
      {workItems}
    </Box>
  )

  const narrativeCard = narrative && (
    <Card sx={{
      p: 2,
      borderRadius: 1,
      border: `1px solid ${border}`,
      borderLeft: accent ? `3px solid ${alpha(accent, 0.7)}` : `1px solid ${border}`,
      boxShadow: 'none',
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.5 : 0.9),
      flexShrink: 0,
    }}>
      {narrative}
    </Card>
  )

  // Top band — hero + KPI placement varies by layout.
  const topBand = (heroFrame || kpis) && (
    isHeroSplit && heroFrame ? (
      <Box sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' },
        alignItems: 'stretch',
        minWidth: 0,
      }}>
        {heroFrame}
        {kpiStack}
      </Box>
    ) : (
      <>
        {heroFrame}
        {kpiGrid}
      </>
    )
  )

  return (
    <ManagerAccentContext.Provider value={accent}>
      <Box sx={{
        height: '100%',
        minHeight: 0,
        overflow: { xs: contentOverflow === 'hidden' ? 'auto' : 'hidden', lg: 'hidden' },
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: { xs: 1.5, md: 2.5 },
        maxWidth: isFullBleed ? 1760 : 1440,
        mx: 'auto',
        width: '100%',
        boxSizing: 'border-box',
        '& *': { boxSizing: 'border-box' },
      }}>
        {header}

        <Box ref={bodyRef} sx={{
          flex: { xs: contentOverflow === 'hidden' ? '0 0 auto' : 1, lg: 1 },
          minHeight: { xs: contentOverflow === 'hidden' ? 'auto' : 0, lg: 0 },
          overflow: { xs: contentOverflow === 'hidden' ? 'visible' : contentOverflow, lg: contentOverflow },
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          scrollbarGutter: 'stable',
          display: 'flex', flexDirection: 'column', gap: 2,
          pr: { md: 0.5 }, pb: 2,
          minWidth: 0,
          // Timeline spine — a left accent rail running down the scroll
          // column gives the page a chronological "flow" identity.
          ...(isTimeline && accent && {
            borderLeft: `2px solid ${alpha(accent, 0.4)}`,
            pl: { xs: 2, md: 2.5 },
            ml: 0.5,
          }),
        }}>
          {topBand}
          {chartGrid}
          {workItemsGrid}
          {narrativeCard}
        </Box>
      </Box>
    </ManagerAccentContext.Provider>
  )
}

/** Convenience chart cell: a titled card sized for the chart grid.
 *  Inherits the page accent (via ManagerAccentContext) to tint its title
 *  + a subtle top edge, so chart cards read as part of the page identity
 *  instead of uniform grey. Neutral when no accent is in context. */
export function ChartCard({ title, children }: { title?: ReactNode; children: ReactNode }) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const accent = useManagerAccent()
  const border = alpha(theme.palette.text.primary, dark ? 0.14 : 0.08)
  return (
    <Card sx={{
      p: 2,
      borderRadius: 1,
      border: `1px solid ${border}`,
      ...(accent && { borderTop: `2px solid ${alpha(accent, 0.55)}` }),
      boxShadow: 'none',
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.5 : 0.92),
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden',
    }}>
      {title && (
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700, mb: 1.5,
            color: accent ?? theme.palette.text.secondary,
          }}
        >
          {title}
        </Typography>
      )}
      {children}
    </Card>
  )
}
