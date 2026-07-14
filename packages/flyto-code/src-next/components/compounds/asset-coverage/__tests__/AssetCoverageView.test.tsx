import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssetCoverageResponse } from '@lib/engine/code/assetCoverage'
import { AssetCoverageEngineerView, AssetCoverageManagerView } from '../AssetCoverageView'
import { assetCoverageFixture } from './assetCoverageFixture'

const queryData = vi.hoisted(() => ({ current: undefined as AssetCoverageResponse | undefined }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: queryData.current, isLoading: false, isError: false }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ orgId: 'org-1' }),
  }
})

queryData.current = assetCoverageFixture

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('AssetCoverageView', () => {
  beforeEach(() => {
    queryData.current = assetCoverageFixture
  })

  it('renders manager coverage certainty without treating debt as absence', () => {
    renderWithRouter(<AssetCoverageManagerView orgId="org-1" />)

    expect(screen.getAllByText('Asset coverage')[0]).toBeTruthy()
    expect(screen.getAllByText('Uncertainty debt')[0]).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Worklist/i })).toBeTruthy()
    expect(screen.getByText('Manager decision')).toBeTruthy()
    expect(screen.getByText('Not ready to claim complete coverage')).toBeTruthy()
    expect(screen.getByText('Next actions')).toBeTruthy()
    expect(screen.getAllByText('Cathay Century Insurance')[0]).toBeTruthy()
    expect(screen.getAllByText(/Evidence debt, not absence/i)[0]).toBeTruthy()

    expect(screen.queryByText('Coverage worklist')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Worklist/i }))
    expect(screen.getByText('Coverage worklist')).toBeTruthy()
  })

  it('renders manager coverage when the scope ledger is missing entities', () => {
    queryData.current = {
      ...assetCoverageFixture,
      scope: {
        ...assetCoverageFixture.scope!,
        entities: undefined,
      } as unknown as AssetCoverageResponse['scope'],
    }

    renderWithRouter(<AssetCoverageManagerView orgId="org-1" />)

    expect(screen.getAllByText('Asset coverage')[0]).toBeTruthy()
    expect(screen.getByText('Manager decision')).toBeTruthy()
  })

  it('shows engineer policy, entity scope debt, missing credential groups, and quarantined candidates', () => {
    renderWithRouter(<AssetCoverageEngineerView orgId="org-1" />)

    expect(screen.getByRole('tab', { name: /^Resources\b/i })).toBeTruthy()
    expect(screen.getByText('Confirmed resource source-pairs')).toBeTruthy()
    expect(screen.queryByText('Evidence policy')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /Policy/i }))
    expect(screen.getByText('Evidence policy')).toBeTruthy()
    expect(screen.getByText('Quarantine until confirmed')).toBeTruthy()
    expect(screen.getByText('Evidence debt, not absence')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Scope/i }))
    expect(screen.getByText('Entity scope ledger')).toBeTruthy()
    expect(screen.getByText('Cathay Century Insurance')).toBeTruthy()
    expect(screen.getByText('Required entity has no confirmed linked assets.')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /^Sources\b/i }))
    expect(screen.getByText('SHODAN_API_KEY')).toBeTruthy()
    expect(screen.getByText('Connect credential')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /^Resources\b/i }))
    expect(screen.getAllByText('Partial answer').length).toBeGreaterThan(0)

    expect(screen.queryByText('cdn-example.net')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Quarantine/i }))
    expect(screen.getByText('cdn-example.net')).toBeTruthy()
  })

  it('opens a drawer with source claims for a resource that has evidence', async () => {
    renderWithRouter(<AssetCoverageEngineerView orgId="org-1" />)

    fireEvent.click(screen.getAllByText('api.example.com')[0])

    expect(await screen.findByText('Claims')).toBeTruthy()
    expect(screen.getAllByText('Certificate Transparency')[0]).toBeTruthy()
    expect(screen.getByText(/Present \/ dns.name \/ hostname \/ confidence 0.96/i)).toBeTruthy()
    expect(screen.getByText(/Source returned positive evidence/i)).toBeTruthy()
    expect(screen.getByText(/Missing claims or debt states do not prove/i)).toBeTruthy()
  })

  it('keeps resources with no returned claims as unknown, not clean', async () => {
    renderWithRouter(<AssetCoverageEngineerView orgId="org-1" />)

    fireEvent.click(screen.getAllByText('www.example.com')[0])

    expect(await screen.findByText('No claims returned for this resource.')).toBeTruthy()
    expect(screen.getByText(/do not prove that a resource is absent/i)).toBeTruthy()
  })
})
