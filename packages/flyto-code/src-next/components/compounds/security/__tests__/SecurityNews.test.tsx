/**
 * SecurityNews smoke test — mounts + renders feed items.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

const { mockNews } = vi.hoisted(() => ({
  mockNews: {
    items: [
      {
        title: 'Critical RCE found in Acme Router firmware',
        link: 'https://example.com/news/1',
        source: 'BleepingComputer',
        published: '2026-05-19T00:00:00Z',
      },
      {
        title: 'Phishing campaign targets banking customers',
        link: 'https://example.com/news/2',
        source: 'The Hacker News',
        published: '2026-05-18T12:00:00Z',
      },
    ],
    cached_at: '2026-05-19T00:00:00Z',
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockNews, isLoading: false, isError: false }),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    getSecurityNews: vi.fn(),
  }
})

import { SecurityNews } from '@compounds/security/SecurityNews'

describe('SecurityNews', () => {
  it('renders news titles + source chips', () => {
    render(<SecurityNews />)
    expect(screen.getByText(/Critical RCE/)).toBeTruthy()
    expect(screen.getByText(/Phishing campaign/)).toBeTruthy()
    expect(screen.getByText('BleepingComputer')).toBeTruthy()
    expect(screen.getByText('The Hacker News')).toBeTruthy()
  })

  it('respects limit prop', () => {
    render(<SecurityNews limit={1} />)
    expect(screen.getByText(/Critical RCE/)).toBeTruthy()
    // Second item filtered out by limit
    expect(screen.queryByText(/Phishing campaign/)).toBeNull()
  })
})
