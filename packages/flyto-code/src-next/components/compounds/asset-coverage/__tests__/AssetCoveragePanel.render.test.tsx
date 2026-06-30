import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AssetCoveragePanel } from '../AssetCoveragePanel'
import { assetCoverageFixture } from './assetCoverageFixture'

const routerState = vi.hoisted(() => ({ navigate: vi.fn() }))
const queryState = vi.hoisted((): { data: unknown; isLoading: boolean; isError: boolean } => ({
  data: undefined,
  isLoading: false,
  isError: false,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => queryState,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => routerState.navigate,
  }
})

beforeEach(() => {
  routerState.navigate.mockClear()
  queryState.data = undefined
  queryState.isLoading = false
  queryState.isError = false
})

describe('AssetCoveragePanel rendering', () => {
  it('renders compact coverage debt and deep-links to the full page', () => {
    render(<AssetCoveragePanel orgId="org-1" data={assetCoverageFixture} compact />)

    expect(screen.getByText('Asset coverage')).toBeTruthy()
    expect(screen.getByText('Known answer coverage')).toBeTruthy()
    expect(screen.getAllByText('Group scope')[0]).toBeTruthy()
    expect(screen.getByText('Declared entity coverage')).toBeTruthy()
    expect(screen.getByText('Cathay Century Insurance')).toBeTruthy()
    expect(screen.getByText(/never rendered as clean absence/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /open/i }))

    expect(routerState.navigate).toHaveBeenCalledWith('/projects/org-1/asset-coverage')
  })

  it('renders quarantine details only in the full ledger panel', () => {
    render(<AssetCoveragePanel orgId="org-1" data={assetCoverageFixture} />)

    expect(screen.getByText('Asset coverage ledger')).toBeTruthy()
    expect(screen.getByText('Quarantine')).toBeTruthy()
    expect(screen.getByText('cdn-example.net')).toBeTruthy()
    expect(screen.getByText(/not counted as confirmed inventory/i)).toBeTruthy()
  })

  it('shows an explicit warning when the ledger query fails', () => {
    queryState.isError = true

    render(<AssetCoveragePanel orgId="org-1" />)

    expect(screen.getByText(/Coverage ledger unavailable/i)).toBeTruthy()
    expect(screen.getByText(/coverage certainty cannot be evaluated/i)).toBeTruthy()
  })
})
