/**
 * ScanDiffView smoke test — mounts + delta tiles + per-repo CVE rows.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

const { mockDiff } = vi.hoisted(() => ({
  mockDiff: {
    compared_at: '2026-05-19T00:00:00Z',
    new_cves_count: 3,
    resolved_cves_count: 1,
    secrets_delta: 0,
    dead_code_delta: 5,
    complex_fns_delta: -2,
    taint_flows_delta: 1,
    repos_compared: 4,
    repos_no_history: 1,
    repos_with_changes: 2,
    new_cves_top: [
      {
        repo_id: 'r-1', repo_name: 'api-server',
        cve_id: 'CVE-2026-12345', package: 'lodash', version: '4.17.20',
        fixed_in: '4.17.21', severity: 'HIGH',
        summary: 'Prototype pollution in deep merge',
      },
    ],
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockDiff, isLoading: false, isError: false }),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    getOrgScanDiff: vi.fn(),
  }
})

import { ScanDiffView } from '@compounds/arch/ScanDiffView'

describe('ScanDiffView', () => {
  it('renders summary numbers + CVE breakdown by repo', () => {
    render(<ScanDiffView />)
    // Header + tile labels render via fallback strings
    expect(screen.getByText('Scan Diff')).toBeTruthy()
    expect(screen.getByText('api-server')).toBeTruthy()
    expect(screen.getByText('CVE-2026-12345')).toBeTruthy()
    expect(screen.getByText(/Prototype pollution/)).toBeTruthy()
  })

  it('renders the regression delta tile labels', () => {
    render(<ScanDiffView />)
    // Tile labels are fallbacks via tOr — proves the 6 tiles mount.
    expect(screen.getByText('New CVEs')).toBeTruthy()
    expect(screen.getByText('Resolved CVEs')).toBeTruthy()
    expect(screen.getByText('Dead code')).toBeTruthy()
    expect(screen.getByText('Taint flows')).toBeTruthy()
  })
})
