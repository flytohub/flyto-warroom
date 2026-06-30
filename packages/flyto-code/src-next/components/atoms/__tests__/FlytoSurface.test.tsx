import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import type React from 'react'
import { FlytoSurface } from '../FlytoSurface'

function renderSurface(ui: React.ReactNode) {
  return render(
    <ThemeProvider theme={createTheme()}>
      {ui}
    </ThemeProvider>,
  )
}

describe('FlytoSurface', () => {
  it('renders the canonical surface header with title, subtitle, icon and action', () => {
    renderSurface(
      <FlytoSurface
        title="Evidence pipeline"
        subtitle="Replay, DOM, screenshot and network artifacts"
        icon={<span data-testid="surface-icon" />}
        action={<button type="button">Run</button>}
      >
        <div>Surface body</div>
      </FlytoSurface>,
    )

    expect(screen.getByText('Evidence pipeline')).toBeTruthy()
    expect(screen.getByText('Replay, DOM, screenshot and network artifacts')).toBeTruthy()
    expect(screen.getByTestId('surface-icon')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy()
    expect(screen.getByText('Surface body')).toBeTruthy()
  })

  it('keeps the full surface interactive without requiring bespoke card code', () => {
    const onClick = vi.fn()
    renderSurface(
      <FlytoSurface role="button" interactive onClick={onClick}>
        Open evidence
      </FlytoSurface>,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
