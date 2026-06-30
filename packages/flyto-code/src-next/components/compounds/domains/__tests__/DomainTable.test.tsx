import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

import { render, screen } from '@testing-library/react'
import { DomainTable } from '../DomainTable'

const mockPaged = [
  {
    domain: 'example.com',
    url: 'https://example.com',
    type: 'pentest.frontend',
    project: { id: 'p1', org_id: 'org-1', name: 'Example', target_url: 'https://example.com', project_type: 'frontend', status: 'active', config: '{}' },
    issues: [
      { title: 'CSP not set', desc: 'Missing CSP header', severity: 'CRITICAL' as const },
    ],
    lastScan: '2026-04-18T10:00:00Z',
  },
  {
    domain: 'api.example.com',
    url: 'https://api.example.com',
    type: 'pentest.restApi',
    issues: [],
    lastScan: '',
  },
]

describe('DomainTable', () => {
  it('renders table with mock data', () => {
    render(
      <DomainTable
        paged={mockPaged}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('https://example.com')).toBeDefined()
    expect(screen.getByText('https://api.example.com')).toBeDefined()
  })

  it('renders header columns', () => {
    render(
      <DomainTable
        paged={mockPaged}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('Domain Name')).toBeDefined()
    expect(screen.getByText('Type')).toBeDefined()
  })

  it('fires onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(
      <DomainTable
        paged={mockPaged}
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByText('https://example.com'))
    expect(onSelect).toHaveBeenCalledWith('example.com')
  })
})
