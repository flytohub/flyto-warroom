import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) => {
    const dict: Record<string, string> = {
      'autofix.manager.backlogSubtitle': 'Highest severity eligible fixes waiting for preview, PR, or verification',
      'autofix.manager.chartCategoryLabel': 'Findings',
      'autofix.manager.findingFallbackTitle': 'AutoFix finding',
      'autofix.manager.kpiAutofixRuns': 'AutoFix Runs',
      'autofix.manager.kpiEligibleBacklog': 'Eligible Backlog',
      'autofix.manager.kpiPatchesPassed': 'Patches Passed',
      'autofix.manager.kpiPRsOpened': 'PRs Opened',
      'autofix.manager.kpiVerifyPassRate': 'Verify Pass-Rate',
      'autofix.manager.subtitle': 'Automated remediation throughput',
      'autofix.manager.title': 'AutoFix',
      'autofix.manager.verifiedSummary': '{passed}/{total} verified patches passed across {runs} run(s).',
      'autofix.status.findingResolved.label': 'Resolved',
      'autofix.statusPROpened': 'PR opened',
      'common.severity': 'Severity',
      'common.status': 'Status',
      'severity.critical': 'Critical',
      'severity.high': 'High',
      'severity.low': 'Low',
      'severity.medium': 'Medium',
      'warroom.repoName': 'Repository',
    }
    return (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? `{${k}}`))
  },
  tOr: (_key: string, fallback: string, params?: Record<string, string | number>) =>
    fallback.replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? `{${k}}`)),
}))

vi.mock('@lib/engine/code/autofix', () => ({
  listAutofixFindings: vi.fn().mockResolvedValue({
    findings: [
      {
        id: 'finding-1',
        repo_id: 'repo-1',
        repo_name: 'flytohub/flyto-code',
        rule_id: 'dependency-bump',
        rule_title: 'Dependency bump',
        rule_category: 'dependencies',
        file_path: 'package.json',
        line_number: 1,
        severity: 'critical',
        title: 'Bump vulnerable package',
        patch_status: 'no_preview',
        verify_passed: false,
        detected_at: '2026-07-04T00:00:00Z',
      },
    ],
  }),
  listAutofixRuns: vi.fn().mockResolvedValue({
    runs: [
      {
        ID: 'run-1',
        OrgID: 'org-1',
        RepoID: 'repo-1',
        TriggeredBy: 'manual',
        Actor: 'codex',
        StartedAt: '2026-07-04T00:00:00Z',
        FinishedAt: '2026-07-04T00:01:00Z',
        DurationMs: 60000,
        FindingsCount: 1,
        PatchesPassed: 1,
        PatchesFailed: 0,
        PRsOpened: 1,
        Error: '',
      },
    ],
  }),
}))

import { AutofixManagerView } from '../AutofixManagerView'

function renderManager() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <AutofixManagerView orgId="org-1" />
    </QueryClientProvider>,
  )
}

describe('AutofixManagerView', () => {
  it('renders the manager repair queue from backend AutoFix rows', async () => {
    renderManager()

    expect(await screen.findByText('Priority repair queue')).toBeTruthy()
    expect(await screen.findByText('Bump vulnerable package')).toBeTruthy()
    expect((await screen.findAllByText('Awaiting preview')).length).toBeGreaterThan(0)
    expect(screen.getByText('Recent automation runs')).toBeTruthy()
  })
})
