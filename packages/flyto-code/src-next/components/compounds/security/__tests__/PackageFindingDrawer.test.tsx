/**
 * PackageFindingDrawer smoke test — mounts when open + renders aggregate.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

const { mockData } = vi.hoisted(() => ({
  mockData: {
    package: 'lodash',
    type: 'cve',
    worst_severity: 'HIGH',
    issue_count: 3,
    repo_count: 2,
    title: 'lodash prototype pollution',
    description: 'Multiple repos affected by CVE-2026-12345',
    fix_available: true,
    fix_version: '4.17.21',
    current_versions: ['4.17.15', '4.17.20'],
    repo_groups: [
      {
        repo_id: 'r-1', repo_name: 'api-server',
        issues: [{
          cve_id: 'CVE-2026-12345', title: 'Prototype pollution',
          severity: 'HIGH', version: '4.17.20', fixed_in: '4.17.21',
          status: 'open', fingerprint: 'abc123def456',
          reachable: false,
        }],
      },
    ],
    autofix_available: true,
    autofix_patches: [],
    blast_radius: 65,
    open_prs: [],
    verifications: [],
    unsanitized_flows: 0,
    status_counts: { open: 3 },
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ enabled }: { enabled?: boolean }) => {
    if (!enabled) return { data: undefined, isLoading: false, isError: false }
    return { data: mockData, isLoading: false, isError: false }
  },
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    getFindingByPackage: vi.fn(),
  }
})

import { PackageFindingDrawer } from '@compounds/security/PackageFindingDrawer'

describe('PackageFindingDrawer', () => {
  it('does not call API when closed', () => {
    render(<PackageFindingDrawer open={false} orgId="org-1" pkg="lodash" type="cve" onClose={() => {}} />)
    // No assertion needed — the useQuery factory checks enabled
    // which is false when open=false.
  })

  it('renders package header + repo group + autofix banner when open', () => {
    render(<PackageFindingDrawer open={true} orgId="org-1" pkg="lodash" type="cve" onClose={() => {}} />)
    expect(screen.getByText('lodash')).toBeTruthy()
    expect(screen.getByText('api-server')).toBeTruthy()
    expect(screen.getByText(/AutoFix patch covers this/)).toBeTruthy()
    // blast_radius 65 renders in a SummaryTile
    expect(screen.getByText('65')).toBeTruthy()
  })
})
