/**
 * AutofixView smoke test — verifies the AutoFix tabs shell mounts with
 * empty findings + rules. Tab children are stubbed; we're only checking
 * the orchestrator's Tabs / Tab / RunButton / page header compose.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org', isAdmin: false } }),
}))

vi.mock('@lib/engine', () => ({
  listAutofixFindings: vi.fn().mockResolvedValue({ findings: [] }),
  listAutofixRules: vi.fn().mockResolvedValue({ rules: [] }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { findings: [], rules: [] }, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@compounds/_shared/AutofixFindingsView', () => ({
  AutofixFindingsView: () => <div data-testid="findings" />,
}))

vi.mock('@atoms/FlytoPageHeader', () => ({
  FlytoPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('../RunButton', () => ({ RunButton: () => null }))
vi.mock('../AuditTab', () => ({ AuditTab: () => null }))
vi.mock('../PromotionTab', () => ({ PromotionTab: () => null }))
vi.mock('../SettingsTab', () => ({ SettingsTab: () => null }))

import { render, screen } from '@testing-library/react'
import { AutofixView } from '../AutofixView'
import { FixQueueProvider } from '@/contexts/FixQueueContext'

describe('AutofixView smoke', () => {
  it('mounts with empty findings + rules', () => {
    render(
      <FixQueueProvider>
        <AutofixView />
      </FixQueueProvider>,
    )
    expect(screen.getAllByRole('heading').length).toBeGreaterThan(0)
  })
})
