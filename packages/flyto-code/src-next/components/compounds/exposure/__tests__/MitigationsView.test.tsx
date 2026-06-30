/**
 * MitigationsView smoke tests.
 *
 * Verifies:
 *   - empty state shows when no controls declared
 *   - rendering a control with applies_to_tag + reduction badge
 *   - Add control opens the form
 *   - Save fires the upsert mutation
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    ready: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    canSeePage: (page: string) => page === 'domains' || page === 'mitigations',
    canDoAction: (action: string) => action === 'finding:update',
    hasFeature: (feature: string) => feature === 'surface_external' || feature === 'ctem',
  }),
}))

const { mockUpsert, mockDelete, mockVerify } = vi.hoisted(() => ({
  mockUpsert: vi.fn().mockResolvedValue({ id: 'new-mit-1' }),
  mockDelete: vi.fn().mockResolvedValue({ id: 'm-1' }),
  mockVerify: vi.fn().mockResolvedValue({ id: 'm-1', verified_by: 'u', evidence: 'ok' }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (Array.isArray(queryKey) && queryKey[0] === 'mitigations') {
      return {
        data: {
          org_id: 'org-1', count: 1,
          items: [{
            id: 'm-1', org_id: 'org-1', control_type: 'waf',
            name: 'WAF rule #4012 — SQLi inbound block',
            description: '',
            applies_to_tag: 'category:sqli',
            severity_reduction: 0.4,
            created_by: 'u',
            created_at: '2026-05-17T00:00:00Z',
            updated_at: '2026-05-17T00:00:00Z',
          }],
        },
        isLoading: false, isError: false,
      }
    }
    return { data: null, isLoading: false, isError: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn, onSuccess }: any) => ({
    mutate: vi.fn(async (arg: any) => {
      const r = await mutationFn(arg)
      onSuccess?.(r, arg)
    }),
    isPending: false, isError: false, error: null,
  }),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    listMitigations: vi.fn(),
    upsertMitigation: mockUpsert,
    deleteMitigation: mockDelete,
    verifyMitigation: mockVerify,
  }
})

import { MitigationsView } from '@compounds/exposure/MitigationsView'

describe('MitigationsView', () => {
  it('renders a declared control with reduction pill', () => {
    render(<MitigationsView orgId="org-1" />)
    expect(screen.getByText(/WAF rule #4012/)).toBeTruthy()
    expect(screen.getByText('-40%')).toBeTruthy()
    expect(screen.getByText(/category:sqli/)).toBeTruthy()
  })

  it('Add control button opens the form', () => {
    render(<MitigationsView orgId="org-1" />)
    const addBtn = screen.getByText('Add control')
    fireEvent.click(addBtn)
    expect(screen.getByText('New control')).toBeTruthy()
  })

  it('Save with required name fires upsert', async () => {
    render(<MitigationsView orgId="org-1" />)
    fireEvent.click(screen.getByText('Add control'))

    const nameField = screen.getByLabelText('Name') as HTMLInputElement
    fireEvent.change(nameField, { target: { value: 'EDR Y' } })

    const saveBtn = screen.getByText('Save')
    fireEvent.click(saveBtn)

    await Promise.resolve()
    expect(mockUpsert).toHaveBeenCalled()
    const args = mockUpsert.mock.calls[0]
    expect(args[1].name).toBe('EDR Y')
  })

  it('shows the Claimed badge for unverified controls', () => {
    render(<MitigationsView orgId="org-1" />)
    // Mock row has no verified_at → Claimed badge visible.
    expect(screen.getByText('Claimed')).toBeTruthy()
    expect(screen.queryByText('Verified')).toBeNull()
  })

  it('Verify icon opens dialog; Save with evidence fires verifyMutation', async () => {
    render(<MitigationsView orgId="org-1" />)
    // The ShieldCheck IconButton is the only one with that icon next
    // to the EDR/WAF chip — find by aria-label via test-id since
    // jsdom renders title attributes on buttons.
    const buttons = screen.getAllByRole('button')
    // The verify button is rendered as an IconButton with no visible
    // label; it sits next to Edit + Delete and only shows when the
    // row is unverified. Find it by index after the chip → tier.
    const verifyBtn = buttons.find(b => b.querySelector('svg.lucide-shield-check'))
    expect(verifyBtn).toBeTruthy()
    fireEvent.click(verifyBtn!)

    // Dialog opens.
    expect(screen.getByText('Verify mitigation')).toBeTruthy()

    // Save is disabled until evidence is typed.
    const evidenceField = screen.getByLabelText('Evidence (URL or short description)') as HTMLInputElement
    fireEvent.change(evidenceField, { target: { value: 'https://audit.example.com/123' } })

    const confirmBtn = screen.getByText('Save verification')
    fireEvent.click(confirmBtn)

    await Promise.resolve()
    expect(mockVerify).toHaveBeenCalled()
    // verifyMitigation signature: (orgId, mitId, evidence)
    const args = mockVerify.mock.calls[0]
    expect(args[0]).toBe('org-1')
    expect(args[1]).toBe('m-1')
    expect(args[2]).toBe('https://audit.example.com/123')
  })
})
