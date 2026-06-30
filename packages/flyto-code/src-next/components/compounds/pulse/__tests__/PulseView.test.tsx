/**
 * PulseView smoke test — verifies the page mounts with empty engine data
 * and renders the empty state without crashing. Pulse is the cross-dim
 * integration spine so a render regression here breaks the whole product
 * thesis; a smoke gate prevents shipping it.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

vi.mock('@lib/engine', () => ({
  getOrgPulse: vi.fn().mockResolvedValue({ items: [], window: 'all', total: 0 }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { items: [], window: 'all', total: 0 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  keepPreviousData: undefined,
}))

vi.mock('@atoms/FlytoSelect', () => ({
  FlytoSelect: (props: { value: string; options: Array<{ value: string; label: string }> }) => (
    <select value={props.value} onChange={() => {}}>
      {props.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}))

vi.mock('@atoms/FlytoPageHeader', () => ({
  FlytoPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@atoms/PRDialog', () => ({ PRDialog: () => null }))
vi.mock('@atoms/QueryError', () => ({ QueryError: () => null }))
vi.mock('@atoms/ContextStrip', () => ({ ContextStrip: () => null }))
vi.mock('@compounds/_shared/UniversalFindingPanel', () => ({
  UniversalFindingPanel: () => null,
}))

import { render, screen } from '@testing-library/react'
import { PulseView } from '../PulseView'
import { FixQueueProvider } from '@/contexts/FixQueueContext'

function renderPulse() {
  return render(
    <FixQueueProvider>
      <PulseView />
    </FixQueueProvider>,
  )
}

describe('PulseView smoke', () => {
  it('renders empty-data without crashing', () => {
    renderPulse()
    // FlytoPageHeader gets a title — h1 should be in the doc.
    expect(screen.getAllByRole('heading').length).toBeGreaterThan(0)
  })
})
