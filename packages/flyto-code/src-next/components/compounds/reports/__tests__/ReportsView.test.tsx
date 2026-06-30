/**
 * ReportsView smoke test — verifies the report center mounts and the
 * preset catalog renders even when the engine API is unavailable
 * (the placeholderData localStorage fallback is the load-bearing path).
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

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: () => {
    const pages = new Set([
      'reports',
      'repos',
      'issues',
      'pulse',
      'warroom_architecture',
      'autofix',
      'warroom_cicd',
      'containers',
      'cspm',
      'mcp',
      'scoring',
      'compliance',
      'domains',
      'pentest',
    ])
    const actions = new Set(['report:view', 'report:export', 'report:manage'])
    return {
      ready: true,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      canSeePage: (page: string) => pages.has(page),
      canOpenPage: (page: string) => pages.has(page),
      pageState: (page: string) => ({ state: pages.has(page) ? 'enabled' : 'hidden' }),
      canDoAction: (action: string) => actions.has(action),
      canUseAction: (action: string) => action === 'report.export' || action === 'report:export' ? true : actions.has(action),
      actionAccess: (action: string) => (
        action === 'report.export' || action === 'report:export'
          ? { state: 'allowed', billing_behavior: 'included' }
          : undefined
      ),
      paywallFor: () => undefined,
      hasFeature: (feature: string) => pages.has(feature),
    }
  },
}))

// Partial @lib/engine mock — datasources.ts imports many constants
// from there, so we need importOriginal to keep the other exports.
vi.mock('@lib/engine', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    listReportTemplates: vi.fn().mockResolvedValue({ templates: [] }),
    createReportTemplate: vi.fn(),
    updateReportTemplate: vi.fn(),
    deleteReportTemplate: vi.fn(),
    listReportComponents: vi.fn().mockResolvedValue({ components: [] }),
    createReportComponent: vi.fn(),
    deleteReportComponent: vi.fn(),
    polishReport: vi.fn(),
  }
})

// Stub datasources.ts entirely — its REPORT_SOURCES re-exports
// hit engine fetchers that we don't need for a render smoke test.
vi.mock('../datasources', () => ({
  DATA_SOURCE_MAP: {},
  canUseDataSource: () => true,
}))

// buildSections is pure (no engine fetchers) so we let the real
// module run. The export handler isn't exercised by the smoke test,
// but importing it must not crash.

// Mutable query state so individual tests can flip the saved-reports
// query into placeholder (localStorage-fallback) mode and back.
const queryState = vi.hoisted(() => ({ isPlaceholderData: false }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { templates: [], components: [] }, isLoading: false, isPlaceholderData: queryState.isPlaceholderData }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQueries: () => [],
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

vi.mock('@atoms/FlytoPageHeader', () => ({
  FlytoPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

// Heavy children — stubbed so the smoke gate stays focused on
// ReportsView orchestration, not its sub-views.
vi.mock('../ReportCatalog', () => ({
  ReportCatalog: () => <div data-testid="catalog" />,
}))
vi.mock('../ReportPreview', () => ({
  ReportPreview: () => <div data-testid="preview" />,
}))
vi.mock('../ReportToolbar', () => ({
  ReportToolbar: () => <div data-testid="toolbar" />,
}))
vi.mock('../CustomBuilder', () => ({
  CustomBuilder: () => null,
}))
vi.mock('../JoinCanvas', () => ({
  JoinCanvas: () => null,
}))

// Pin the experience to 'engineer' — this smoke test asserts the engineer
// surface (raw catalog + preview + toolbar + local-draft banner). The
// manager surface is a separate audience-aware view, and the default resolved
// mode is 'manager', so the mode must be forced here.
vi.mock('@/contexts/ExperienceContext', () => ({
  useExperience: () => ({ mode: 'engineer', setMode: vi.fn(), resolved: true }),
}))

import { render, screen } from '@testing-library/react'
import { ReportsView } from '../ReportsView'

describe('ReportsView smoke', () => {
  it('renders catalog + preview + toolbar shell without crashing', () => {
    queryState.isPlaceholderData = false
    render(<ReportsView />)
    // getByTestId throws if not found — the truthy check just makes
    // the intent explicit. We're not asserting visibility / mounting
    // semantics, only that the shell composes without errors.
    expect(screen.getByTestId('catalog')).toBeTruthy()
    expect(screen.getByTestId('preview')).toBeTruthy()
    expect(screen.getByTestId('toolbar')).toBeTruthy()
  })

  it('hides the local-draft banner when saved reports come from the API', () => {
    queryState.isPlaceholderData = false
    render(<ReportsView />)
    // Real API data → reports are server-backed → no masking warning.
    expect(screen.queryByTestId('reports-local-draft-banner')).toBeNull()
  })

  it('shows the local-draft banner when only localStorage fallback is available', () => {
    // API down / report_templates table missing → placeholderData served.
    // The catalog must visibly warn the list is not server-backed instead
    // of silently looking persisted (REPORTS_AUDIT_2026_06_01 §3/§4).
    queryState.isPlaceholderData = true
    render(<ReportsView />)
    expect(screen.getByTestId('reports-local-draft-banner')).toBeTruthy()
    queryState.isPlaceholderData = false
  })
})
