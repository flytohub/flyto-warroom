import {
  flytoFontFamily,
  flytoFontWeight,
  flytoTextStyles,
  flytoTypography,
} from './visualSystem'

export const footprintText = {
  panelTitle: {
    ...flytoTypography.surfaceTitle,
    fontSize: 14,
    fontWeight: flytoFontWeight.strong,
  },
  sectionOverline: {
    ...flytoTypography.metricLabel,
    fontWeight: flytoFontWeight.emphasis,
    color: 'text.secondary',
    textTransform: 'uppercase',
  },
  panelSubtitle: {
    ...flytoTypography.surfaceSubtitle,
    fontSize: 13,
  },
  smallMuted: {
    ...flytoTypography.metricLabel,
    color: 'text.secondary',
  },
  smallStrong: {
    ...flytoTypography.metricLabel,
    fontWeight: flytoFontWeight.medium,
  },
  metricValue: {
    ...flytoTypography.metricValue,
    fontSize: 22,
    fontWeight: flytoFontWeight.strong,
  },
  metricValueSmall: {
    ...flytoTypography.metricValue,
    fontSize: 16,
    fontWeight: flytoFontWeight.medium,
  },
  panelButton: {
    ...flytoTypography.tab,
    fontWeight: flytoFontWeight.medium,
  },
  badge: {
    ...flytoTypography.tabCount,
    fontSize: 12,
  },
  indicator: {
    ...flytoTypography.tab,
    fontWeight: flytoFontWeight.strong,
    lineHeight: 1,
  },
  narrativeBody: {
    ...flytoTypography.surfaceSubtitle,
    fontSize: 14,
    lineHeight: 1.75,
    color: 'text.primary',
  },
  mono: {
    ...flytoTextStyles.codeSmall,
    fontFamily: flytoFontFamily.mono,
  },
  monoStrong: {
    ...flytoTextStyles.codeValue,
    fontFamily: flytoFontFamily.mono,
  },
} as const
