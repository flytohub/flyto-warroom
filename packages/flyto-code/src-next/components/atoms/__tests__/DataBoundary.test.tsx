import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type React from 'react'
import { DataBoundary } from '../DataBoundary'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

function renderBoundary(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('DataBoundary', () => {
  it('renders a first-load placeholder before data exists', () => {
    const { container } = renderBoundary(
      <DataBoundary isLoading hasData={false}>
        <div>Loaded</div>
      </DataBoundary>,
    )
    expect(container.firstElementChild).toBeTruthy()
    expect(screen.queryByText('Loaded')).toBeNull()
  })

  it('renders an empty state after a successful empty load', () => {
    renderBoundary(
      <DataBoundary hasData={false} emptyTitle="Nothing here" emptyDescription="Connect data first.">
        <div>Loaded</div>
      </DataBoundary>,
    )
    expect(screen.getByText('Nothing here')).toBeTruthy()
    expect(screen.getByText('Connect data first.')).toBeTruthy()
  })

  it('renders a blocking error when no stale data is available', () => {
    renderBoundary(
      <DataBoundary isError error={new Error('boom')} hasData={false} label="widgets">
        <div>Loaded</div>
      </DataBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
  })

  it('keeps stale data visible while refetching', () => {
    renderBoundary(
      <DataBoundary isFetching hasData>
        <div>Loaded</div>
      </DataBoundary>,
    )
    expect(screen.getByText('Loaded')).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })
})
