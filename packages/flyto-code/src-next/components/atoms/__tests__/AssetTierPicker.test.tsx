/**
 * AssetTierPicker — verifies the chip click → menu open → mutation
 * fire flow. Both `target="repo"` and `target="asset"` go through
 * different mutation paths; both are exercised.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

const { mockSetRepoTier, mockSetAssetTier } = vi.hoisted(() => ({
  mockSetRepoTier:  vi.fn().mockResolvedValue({ asset_tier: 'crown_jewel' }),
  mockSetAssetTier: vi.fn().mockResolvedValue({ asset_tier: 'customer_facing' }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn, onSuccess }: any) => ({
    mutate: vi.fn(async (arg: any) => {
      const r = await mutationFn(arg)
      onSuccess?.(r, arg)
    }),
    isPending: false,
  }),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    setRepoTier: mockSetRepoTier,
    setAssetTier: mockSetAssetTier,
    tierLabel: (t: string) => t === 'crown_jewel' ? 'Crown Jewel' : 'Internal',
    tierColor: () => '#fbbf24',
  }
})

import { AssetTierPicker } from '../AssetTierPicker'

describe('AssetTierPicker', () => {
  it('renders the current tier as a clickable chip', () => {
    render(<AssetTierPicker target="repo" orgId="org-1" id="repo-1" tier="internal" />)
    expect(screen.getByText('Internal')).toBeTruthy()
  })

  it('opens the menu on click and fires setRepoTier on selection', async () => {
    render(<AssetTierPicker target="repo" orgId="org-1" id="repo-1" tier="internal" />)
    fireEvent.click(screen.getByText('Internal'))
    const option = await screen.findByText('Crown Jewel')
    fireEvent.click(option)
    expect(mockSetRepoTier).toHaveBeenCalledWith('org-1', 'repo-1', 'crown_jewel')
  })

  it('routes through setAssetTier when target="asset"', async () => {
    render(<AssetTierPicker target="asset" orgId="org-1" id="asset-1" tier="internal" />)
    fireEvent.click(screen.getByText('Internal'))
    const option = await screen.findByText('Crown Jewel')
    fireEvent.click(option)
    expect(mockSetAssetTier).toHaveBeenCalledWith('org-1', 'asset-1', 'crown_jewel')
  })

  it('readonly mode does not open the menu', () => {
    render(<AssetTierPicker target="repo" orgId="org-1" id="repo-1" tier="internal" readonly />)
    fireEvent.click(screen.getByText('Internal'))
    // No menu items appear when readonly — there's only the one
    // visible "Internal" chip.
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
