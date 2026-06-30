import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionGate, GatedButton } from '../GatedButton'

const capsState = vi.hoisted(() => ({
  ready: true,
  allowed: false,
  reason: 'Report export requires payment.',
}))
const projectCapsState = vi.hoisted(() => ({
  ready: true,
  allowed: true,
  reason: 'Module is disabled for this project.',
}))

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    ready: capsState.ready,
    canUseAction: vi.fn(() => capsState.allowed),
    canDoAction: vi.fn(() => capsState.allowed),
    actionAccess: vi.fn(() => (
      capsState.ready
        ? {
          state: capsState.allowed ? 'allowed' : 'payment_required',
          billing_behavior: capsState.allowed ? 'included' : 'addon_required',
          reason: capsState.reason,
        }
        : undefined
    )),
  }),
}))

vi.mock('@hooks/useProjectCapabilities', () => ({
  useProjectCapabilities: () => ({
    ready: projectCapsState.ready,
    canUseAction: vi.fn(() => projectCapsState.allowed),
    actionAccess: vi.fn(() => (
      projectCapsState.ready
        ? {
          state: projectCapsState.allowed ? 'allowed' : 'blocked',
          billing_behavior: projectCapsState.allowed ? 'included' : 'blocked',
          reason: projectCapsState.reason,
        }
        : undefined
    )),
  }),
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

function renderInOrg(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/projects/org-1/reports']}>
      <Routes>
        <Route path="/projects/:orgId/reports" element={ui} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GatedButton', () => {
  afterEach(() => {
    capsState.ready = true
    capsState.allowed = false
    capsState.reason = 'Report export requires payment.'
    projectCapsState.ready = true
    projectCapsState.allowed = true
    projectCapsState.reason = 'Module is disabled for this project.'
  })

  it('enables commercial dotted actions only when the backend allows them', () => {
    capsState.allowed = true

    renderInOrg(<GatedButton action="report.export">Export</GatedButton>)

    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('fails closed by disabling denied commercial actions', () => {
    capsState.allowed = false

    renderInOrg(<GatedButton action="report.export">Export</GatedButton>)

    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not render denied actions when hideWhenDenied is set', () => {
    capsState.allowed = false

    renderInOrg(<GatedButton action="report.export" hideWhenDenied>Export</GatedButton>)

    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull()
  })

  it('fails closed when the project module registry denies the action', () => {
    capsState.allowed = true
    projectCapsState.allowed = false

    renderInOrg(<GatedButton action="report.export">Export</GatedButton>)

    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps hideWhenDenied actions visible but disabled while capabilities are unresolved', () => {
    capsState.ready = false
    capsState.allowed = false

    renderInOrg(<GatedButton action="report.export" hideWhenDenied>Export</GatedButton>)

    expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('hides arbitrary children through ActionGate when action is denied', () => {
    capsState.allowed = false

    renderInOrg(<ActionGate action="report.export"><span>Export panel</span></ActionGate>)

    expect(screen.queryByText('Export panel')).toBeNull()
  })
})
