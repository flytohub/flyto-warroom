/**
 * DomainAssetTierPicker — verifies:
 *   • renders the AssetTierPicker when attack_surface row exists
 *   • renders the "Discover to tag" CTA when no matching row
 *   • shows the "Tier…" placeholder while the query is loading
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => useQueryMock(args),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@lib/engine/code/pentest', () => ({ listAttackSurface: vi.fn() }))
vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    tierLabel: () => 'Internal',
    tierColor: () => '#94a3b8',
  }
})

import { DomainAssetTierPicker } from '../DomainAssetTierPicker'

describe('DomainAssetTierPicker', () => {
  it('shows the Discover-to-tag chip when no matching asset', () => {
    useQueryMock.mockReturnValue({
      data: { assets: [] },
      isLoading: false,
      isError: false,
    })
    render(<DomainAssetTierPicker orgId="org-1" domain="not-discovered.example.com" />)
    expect(screen.getByText('Discover to tag')).toBeTruthy()
  })

  it('shows the Tier… loading placeholder while query is loading', () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })
    render(<DomainAssetTierPicker orgId="org-1" domain="x.example.com" />)
    expect(screen.getByText('Tier…')).toBeTruthy()
  })

  it('renders an AssetTierPicker chip when a matching asset exists', () => {
    useQueryMock.mockReturnValue({
      data: { assets: [
        { id: 'a1', asset_type: 'domain', value: 'api.example.com', asset_tier: 'internal' },
      ] },
      isLoading: false,
      isError: false,
    })
    render(<DomainAssetTierPicker orgId="org-1" domain="api.example.com" />)
    // AssetTierPicker renders the tier label; we just need to see
    // "Internal" appear (not the fallback "Discover to tag").
    expect(screen.queryByText('Discover to tag')).toBeNull()
    expect(screen.getByText('Internal')).toBeTruthy()
  })
})
