import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { DomainRow } from '../types'
import { GroupedDomainList } from '../GroupedDomainList'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@atoms/GatedButton', () => ({
  GatedIconButton: ({ children, action: _action, hideWhenDenied: _hideWhenDenied, ...props }: any) => (
    <button type="button" {...props}>{children}</button>
  ),
}))

vi.mock('@atoms/JellyCard', () => ({
  JellyCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

function row(domain: string): DomainRow {
  return {
    domain,
    url: `https://${domain}`,
    type: 'attack_surface',
    resourceId: `res-${domain}`,
    assets: [],
    issues: [],
    lastScan: new Date().toISOString(),
    verifierStatus: 'active',
    scopeBucket: 'core_owned',
  }
}

describe('GroupedDomainList', () => {
  it('delegates delete confirmation to the parent view', () => {
    const onDelete = vi.fn()

    render(
      <GroupedDomainList
        rows={[row('example.test')]}
        onSelect={vi.fn()}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByLabelText('Delete'))

    expect(onDelete).toHaveBeenCalledWith('example.test')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Delete domain')).toBeNull()
  })
})
