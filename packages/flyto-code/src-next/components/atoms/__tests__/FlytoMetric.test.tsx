import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import type React from 'react'
import { FlytoMetricGrid, FlytoMetricTile } from '../FlytoMetric'

function renderMetric(ui: React.ReactNode) {
  return render(
    <ThemeProvider theme={createTheme()}>
      {ui}
    </ThemeProvider>,
  )
}

describe('FlytoMetric', () => {
  it('renders a metric tile with label, value and icon', () => {
    renderMetric(
      <FlytoMetricTile
        label="Active runs"
        value="3"
        icon={<span data-testid="metric-icon" />}
      />,
    )

    expect(screen.getByText('Active runs')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByTestId('metric-icon')).toBeTruthy()
  })

  it('renders a metric grid from declarative items', () => {
    renderMetric(
      <FlytoMetricGrid
        items={[
          { label: 'Coverage', value: '92%' },
          { label: 'Evidence', value: 'signed' },
        ]}
      />,
    )

    expect(screen.getByText('Coverage')).toBeTruthy()
    expect(screen.getByText('92%')).toBeTruthy()
    expect(screen.getByText('Evidence')).toBeTruthy()
    expect(screen.getByText('signed')).toBeTruthy()
  })
})
