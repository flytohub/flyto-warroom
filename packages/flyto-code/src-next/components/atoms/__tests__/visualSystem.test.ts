import { describe, expect, it } from 'vitest'
import {
  flytoFontFamily,
  flytoChipSx,
  flytoContainedActionSx,
  flytoGradientActionSx,
  flytoIconBoxSx,
  flytoRadii,
  flytoSpacing,
  flytoTextStyles,
  flytoTone,
  flytoTypography,
} from '@/styles/visualSystem'
import { footprintText } from '@/styles/footprintVisual'
import { colors } from '@/styles/designTokens'
import { brand, palette, severity } from '@lib/tokens'
import { RAW, SEVERITY_TONE } from '@lib/tokens/severity'

describe('visualSystem tokens', () => {
  it('keeps page and surface typography centralized and unsqueezed', () => {
    expect(flytoTypography.pageTitle.fontFamily).toBe(flytoFontFamily.ui)
    expect(flytoTypography.pageTitle.letterSpacing).toBe(0)
    expect(flytoTypography.pageSubtitle.letterSpacing).toBe(0)
    expect(flytoTypography.surfaceTitle.letterSpacing).toBe(0)
    expect(flytoTypography.tab.textTransform).toBe('none')
  })

  it('keeps enterprise surfaces at 8px radius or less', () => {
    expect(flytoRadii.surface).toBeLessThanOrEqual(1)
    expect(flytoRadii.control).toBeLessThanOrEqual(1)
    expect(flytoRadii.icon).toBeLessThanOrEqual(1)
  })

  it('defines density keys for every reusable surface mode', () => {
    expect(Object.keys(flytoSpacing.surfacePadding).sort()).toEqual(['compact', 'regular', 'spacious'])
    expect(Object.keys(flytoSpacing.surfaceHeaderPaddingY).sort()).toEqual(['compact', 'regular', 'spacious'])
    expect(Object.keys(flytoSpacing.surfaceHeaderHeight).sort()).toEqual(['compact', 'regular', 'spacious'])
  })

  it('keeps code and evidence text on the shared mono stack', () => {
    expect(flytoTextStyles.codeSmall.fontFamily).toBe(flytoTypography.code.fontFamily)
    expect(flytoTextStyles.codeTiny.fontFamily).toBe(flytoTypography.code.fontFamily)
    expect(flytoTextStyles.codeValue.overflowWrap).toBe('anywhere')
  })

  it('keeps shared typography at the 12px minimum floor', () => {
    const allSizes = [
      ...Object.values(flytoTypography).map((style) => style.fontSize),
      ...Object.values(flytoTextStyles).map((style) => style.fontSize),
    ].filter((size): size is number => typeof size === 'number')

    expect(Math.min(...allSizes)).toBeGreaterThanOrEqual(12)
  })

  it('derives the style token bridge from canonical product tokens', () => {
    expect(colors.brand).toBe(brand.light)
    expect(colors.brandDeep).toBe(brand.base)
    expect(colors.brandDarkest).toBe(palette.purple[900])
    expect(colors.tech).toBe(palette.cyan[500])
    expect(colors.techDeep).toBe(palette.cyan[600])
    expect(colors.semantic.success).toBe(RAW.green500)
    expect(colors.semantic.warning).toBe(RAW.orange500)
    expect(colors.semantic.danger).toBe(RAW.red500)
    expect(colors.severity.critical).toBe(severity.critical)
    expect(colors.severity.high).toBe(severity.high)
    expect(colors.severity.medium).toBe(severity.medium)
    expect(colors.severity.low).toBe(severity.low)
    expect(colors.severity.info).toBe(SEVERITY_TONE[''].tone)
  })

  it('derives reusable tone helpers from shared semantic colors', () => {
    expect(flytoTone.success.fg).toBe(colors.semantic.success)
    expect(flytoTone.warning.fg).toBe(colors.semantic.warning)
    expect(flytoTone.danger.fg).toBe(colors.semantic.danger)
    expect(flytoTone.tech.fg).toBe(colors.tech)

    expect(flytoChipSx('success').fontSize).toBe(flytoTypography.tabCount.fontSize)
    expect(flytoIconBoxSx('tech').borderRadius).toBe(flytoRadii.icon)
    expect(flytoContainedActionSx('brand').borderRadius).toBe(flytoRadii.control)
    expect(flytoGradientActionSx('danger').background).toBe(flytoTone.danger.gradient)
  })

  it('keeps footprint typography on shared visual tokens', () => {
    expect(footprintText.panelTitle.fontFamily).toBe(flytoFontFamily.ui)
    expect(footprintText.mono.fontFamily).toBe(flytoFontFamily.mono)
    expect(footprintText.narrativeBody.lineHeight).toBe(1.75)
  })
})
