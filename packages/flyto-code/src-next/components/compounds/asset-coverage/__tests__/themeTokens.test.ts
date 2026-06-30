import { createTheme } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'

import {
  coverageBorder,
  coverageProgressTrack,
  coverageSubtleSurface,
  coverageSurface,
  coverageTintSurface,
} from '../themeTokens'

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    background: { paper: '#ffffff', default: '#f6f7f9' },
  },
})

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { paper: '#1E2125', default: '#121212' },
  },
})

describe('asset coverage theme tokens', () => {
  it('keeps light surfaces opaque and dark surfaces translucent over the dark shell', () => {
    expect(coverageSurface(lightTheme)).toBe('#ffffff')
    expect(coverageSurface(darkTheme)).toBe('rgba(30, 33, 37, 0.9)')
  })

  it('derives different borders and tracks for light and dark modes', () => {
    expect(coverageBorder(lightTheme)).toBe('rgba(0, 0, 0, 0.08)')
    expect(coverageBorder(darkTheme)).toBe('rgba(255, 255, 255, 0.16)')
    expect(coverageProgressTrack(lightTheme)).toBe('rgba(0, 0, 0, 0.08)')
    expect(coverageProgressTrack(darkTheme)).toBe('rgba(255, 255, 255, 0.16)')
  })

  it('separates muted row fills from semantic tints in both modes', () => {
    const tone = '#38bdf8'

    expect(coverageSubtleSurface(lightTheme)).toBe('rgba(0, 0, 0, 0.025)')
    expect(coverageSubtleSurface(darkTheme)).toBe('rgba(255, 255, 255, 0.045)')
    expect(coverageTintSurface(lightTheme, tone)).toBe('rgba(56, 189, 248, 0.065)')
    expect(coverageTintSurface(darkTheme, tone)).toBe('rgba(56, 189, 248, 0.1)')
  })
})
