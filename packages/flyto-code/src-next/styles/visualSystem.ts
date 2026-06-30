import { colors, gradients, softBg } from './designTokens'

type VisualDensity = 'compact' | 'regular' | 'spacious'

export const flytoFontFamily = {
  ui: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
} as const

export const flytoFontWeight = {
  regular: 400,
  medium: 600,
  strong: 700,
  emphasis: 800,
  heavy: 850,
} as const

export const flytoTypography = {
  pageTitle: {
    fontFamily: flytoFontFamily.ui,
    fontSize: 24,
    lineHeight: 1.18,
    fontWeight: flytoFontWeight.strong,
    letterSpacing: 0,
  },
  pageSubtitle: {
    fontFamily: flytoFontFamily.ui,
    fontSize: 15,
    lineHeight: 1.45,
    fontWeight: flytoFontWeight.medium,
    letterSpacing: 0,
  },
  surfaceTitle: {
    fontFamily: flytoFontFamily.ui,
    fontSize: 14,
    lineHeight: 1.25,
    fontWeight: flytoFontWeight.heavy,
    letterSpacing: 0,
  },
  surfaceSubtitle: {
    fontFamily: flytoFontFamily.ui,
    fontSize: 13,
    lineHeight: 1.5,
    fontWeight: flytoFontWeight.regular,
    letterSpacing: 0,
  },
  tab: {
    fontFamily: flytoFontFamily.ui,
    fontSize: 13,
    lineHeight: 1.2,
    fontWeight: flytoFontWeight.medium,
    letterSpacing: 0,
    textTransform: 'none',
  },
  tabCount: {
    fontFamily: flytoFontFamily.ui,
    fontSize: 12,
    lineHeight: 1,
    fontWeight: flytoFontWeight.strong,
    letterSpacing: 0,
  },
  metricLabel: {
    fontFamily: flytoFontFamily.ui,
    fontSize: 12,
    lineHeight: 1.2,
    fontWeight: flytoFontWeight.medium,
    letterSpacing: 0,
  },
  metricValue: {
    fontFamily: flytoFontFamily.ui,
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: flytoFontWeight.strong,
    letterSpacing: 0,
  },
  code: {
    fontFamily: flytoFontFamily.mono,
    fontSize: 12,
    lineHeight: 1.55,
    fontWeight: flytoFontWeight.regular,
    letterSpacing: 0,
  },
} as const

export const flytoTextStyles = {
  codeTiny: {
    ...flytoTypography.code,
    fontSize: 12,
  },
  codeSmall: {
    ...flytoTypography.code,
    fontSize: 12,
  },
  codeLabel: {
    ...flytoTypography.code,
    fontSize: 12,
    fontWeight: flytoFontWeight.emphasis,
  },
  codeStrong: {
    ...flytoTypography.code,
    fontWeight: flytoFontWeight.strong,
  },
  codeValue: {
    ...flytoTypography.code,
    fontWeight: flytoFontWeight.strong,
    overflowWrap: 'anywhere',
  },
  codeWrap: {
    ...flytoTypography.code,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
} as const

export const flytoRadii = {
  surface: 1,
  control: 1,
  icon: 1,
  denseIcon: 1,
  chart: 1,
  pill: 999,
} as const

export const flytoSpacing = {
  pageX: { xs: 2, sm: 3, md: 4 },
  pageY: { xs: 2, md: 3 },
  surfacePadding: {
    compact: 1.5,
    regular: 2,
    spacious: 2.5,
  } satisfies Record<VisualDensity, number>,
  surfaceHeaderPaddingY: {
    compact: 1.1,
    regular: 1.35,
    spacious: 1.35,
  } satisfies Record<VisualDensity, number>,
  surfaceHeaderHeight: {
    compact: 53,
    regular: 61,
    spacious: 61,
  } satisfies Record<VisualDensity, number>,
  surfaceGap: 1.25,
  actionGap: 1,
  gridGap: 1.5,
} as const

export const flytoIconSizing = {
  surfaceBox: {
    compact: 30,
    regular: 34,
    spacious: 34,
  } satisfies Record<VisualDensity, number>,
  surfaceGlyph: {
    compact: 15,
    regular: 17,
    spacious: 17,
  } satisfies Record<VisualDensity, number>,
} as const

export const flytoSurfaceAlpha = {
  activeBgDark: 0.035,
  activeBgLight: 0.025,
  headerActiveBg: 0.055,
  headerNeutralBg: 0.025,
  iconBg: 0.11,
  iconBorder: 0.18,
  selectedBorder: 0.55,
  selectedRail: 0.9,
  activeRail: 0.62,
  selectedRing: 0.18,
  hoverRing: 0.16,
} as const

export const flytoMotion = {
  hoverTransition: 'border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease',
} as const

export const flytoLayout = {
  headerSubtitleMaxWidth: 880,
  tableMaxBodyHeight: 520,
  metricCardMinWidth: 190,
  chartMinWidth: 340,
} as const

export const flytoTone = {
  brand: {
    fg: colors.brand,
    bg: softBg(colors.brand, 0.1),
    bgStrong: colors.brand,
    border: softBg(colors.brand, 0.28),
    hoverBg: softBg(colors.brand, 0.16),
    hoverFg: colors.brandDeep,
    gradient: gradients.architecture,
    gradientHover: `linear-gradient(135deg, ${colors.brandDeep}, ${colors.brandDarkest})`,
  },
  tech: {
    fg: colors.tech,
    bg: softBg(colors.tech, 0.12),
    bgStrong: colors.techDeep,
    border: softBg(colors.tech, 0.3),
    hoverBg: softBg(colors.tech, 0.2),
    hoverFg: colors.techDeep,
    gradient: `linear-gradient(135deg, ${colors.tech}, ${colors.techDeep})`,
    gradientHover: `linear-gradient(135deg, ${colors.techDeep}, ${colors.tech})`,
  },
  success: {
    fg: colors.semantic.success,
    bg: softBg(colors.semantic.success, 0.1),
    bgStrong: colors.semantic.success,
    border: softBg(colors.semantic.success, 0.35),
    hoverBg: softBg(colors.semantic.success, 0.16),
    hoverFg: colors.semantic.success,
    gradient: `linear-gradient(135deg, ${colors.semantic.success}, ${colors.tech})`,
    gradientHover: `linear-gradient(135deg, ${colors.semantic.success}, ${colors.techDeep})`,
  },
  warning: {
    fg: colors.semantic.warning,
    bg: softBg(colors.semantic.warning, 0.1),
    bgStrong: colors.semantic.warning,
    border: softBg(colors.semantic.warning, 0.3),
    hoverBg: softBg(colors.semantic.warning, 0.18),
    hoverFg: colors.semantic.warning,
    gradient: `linear-gradient(135deg, ${colors.semantic.warning}, ${colors.severity.medium})`,
    gradientHover: `linear-gradient(135deg, ${colors.semantic.warning}, ${colors.semantic.danger})`,
  },
  danger: {
    fg: colors.semantic.danger,
    bg: softBg(colors.semantic.danger, 0.1),
    bgStrong: colors.semantic.danger,
    border: softBg(colors.semantic.danger, 0.35),
    hoverBg: softBg(colors.semantic.danger, 0.14),
    hoverFg: colors.semantic.danger,
    gradient: gradients.security,
    gradientHover: `linear-gradient(135deg, ${colors.semantic.danger}, ${colors.semantic.warning})`,
  },
  neutral: {
    fg: 'text.secondary',
    bg: 'action.hover',
    bgStrong: 'action.selected',
    border: 'divider',
    hoverBg: 'action.selected',
    hoverFg: 'text.primary',
    gradient: gradients.architecture,
    gradientHover: gradients.architecture,
  },
} as const

export type FlytoTone = keyof typeof flytoTone

export const flytoSectionLabelSx = {
  ...flytoTypography.metricLabel,
  color: 'text.secondary',
  textTransform: 'uppercase',
  letterSpacing: 0,
} as const

export const flytoSmallControlSx = {
  ...flytoTypography.surfaceSubtitle,
  borderRadius: flytoRadii.control,
} as const

export const flytoCompactMetricValueSx = {
  ...flytoTypography.metricValue,
  fontSize: 18,
} as const

export const flytoTabBarSx = {
  px: 2,
  minHeight: 44,
  '& .MuiTab-root': {
    ...flytoTypography.tab,
    minHeight: 44,
  },
} as const

export const flytoInputSlotSx = {
  ...flytoTypography.surfaceSubtitle,
  borderRadius: flytoRadii.control,
} as const

export const flytoEmptyIconStyle = {
  color: 'var(--mui-palette-text-disabled)',
  opacity: 0.3,
  marginBottom: 8,
} as const

export function flytoToneIconStyle(tone: FlytoTone, opacity = 0.9) {
  return { color: flytoTone[tone].fg, opacity } as const
}

export function flytoIconBoxSx(tone: FlytoTone, size = 32) {
  return {
    width: size,
    height: size,
    borderRadius: flytoRadii.icon,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: flytoTone[tone].bg,
    flexShrink: 0,
  } as const
}

export function flytoCircleIconBoxSx(size = 80) {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    mb: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: 'action.hover',
  } as const
}

export function flytoChipSx(tone: FlytoTone = 'neutral', height = 24) {
  const palette = flytoTone[tone]
  return {
    height,
    ...flytoTypography.tabCount,
    bgcolor: palette.bg,
    color: palette.fg,
    border: tone === 'neutral' ? undefined : `1px solid ${palette.border}`,
    '& .MuiChip-icon': { color: palette.fg },
  } as const
}

export function flytoContainedActionSx(tone: FlytoTone = 'brand') {
  const palette = flytoTone[tone]
  return {
    textTransform: 'none',
    fontWeight: flytoFontWeight.strong,
    borderRadius: flytoRadii.control,
    bgcolor: palette.bgStrong,
    boxShadow: 'none',
    '&:hover': { bgcolor: palette.hoverFg, boxShadow: 'none' },
  } as const
}

export function flytoGradientActionSx(tone: FlytoTone = 'brand') {
  const palette = flytoTone[tone]
  return {
    textTransform: 'none',
    fontWeight: flytoFontWeight.strong,
    borderRadius: flytoRadii.control,
    background: palette.gradient,
    boxShadow: 'none',
    '&:hover': { background: palette.gradientHover, boxShadow: 'none' },
  } as const
}

export function flytoOutlinedActionSx(tone: FlytoTone = 'brand') {
  const palette = flytoTone[tone]
  return {
    textTransform: 'none',
    fontWeight: flytoFontWeight.strong,
    borderRadius: flytoRadii.control,
    borderColor: palette.border,
    color: palette.hoverFg,
    '&:hover': { borderColor: palette.fg, bgcolor: palette.hoverBg },
  } as const
}

export function flytoHoverIconButtonSx(tone: FlytoTone) {
  const palette = flytoTone[tone]
  return {
    color: 'text.secondary',
    '&:hover': { color: palette.hoverFg, bgcolor: palette.hoverBg },
  } as const
}
