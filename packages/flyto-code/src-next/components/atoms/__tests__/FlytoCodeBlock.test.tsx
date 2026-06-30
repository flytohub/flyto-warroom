import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import type React from 'react'
import { FlytoCodeBlock } from '../FlytoCodeBlock'

function renderCodeBlock(ui: React.ReactNode) {
  return render(
    <ThemeProvider theme={createTheme()}>
      {ui}
    </ThemeProvider>,
  )
}

describe('FlytoCodeBlock', () => {
  it('renders labeled evidence content inside a pre region', () => {
    renderCodeBlock(
      <FlytoCodeBlock
        label="Evidence"
        detail="signed payload"
        value={'{"ok":true}'}
      />,
    )

    expect(screen.getByText('Evidence')).toBeTruthy()
    expect(screen.getByText('signed payload')).toBeTruthy()
    expect(screen.getByText('{"ok":true}').tagName).toBe('PRE')
  })

  it('supports dense unwrapped code blocks', () => {
    renderCodeBlock(
      <FlytoCodeBlock
        density="compact"
        wrap={false}
        value="GET /api/v1/code/orgs"
      />,
    )

    expect(screen.getByText('GET /api/v1/code/orgs').tagName).toBe('PRE')
  })
})
