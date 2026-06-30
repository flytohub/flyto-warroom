/**
 * FixQueueDrawer smoke test — verifies the right-side guided fix drawer
 * mounts with empty pulse data. The drawer is the user's entry into
 * cross-dim findings triage, so a render regression here breaks the
 * "one CTA per finding" UX promise.
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
  useQuery: () => ({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
}))

vi.mock('react-router', async () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}))

vi.mock('@atoms/QueryError', () => ({ QueryError: () => null }))
vi.mock('@atoms/PRDialog', () => ({ PRDialog: () => null }))
vi.mock('@compounds/_shared/UniversalFindingPanel', () => ({
  UniversalFindingPanel: () => null,
}))
vi.mock('@compounds/security/AutofixPreviewModal', () => ({
  AutofixPreviewModal: () => null,
}))

import { render } from '@testing-library/react'
import { FixQueueDrawer } from '../FixQueueDrawer'
import { FixQueueProvider } from '@/contexts/FixQueueContext'

describe('FixQueueDrawer smoke', () => {
  it('mounts inside FixQueueProvider with empty pulse', () => {
    const { container } = render(
      <FixQueueProvider>
        <FixQueueDrawer />
      </FixQueueProvider>,
    )
    // Drawer is closed by default — body should still mount.
    expect(container).toBeTruthy()
  })
})
