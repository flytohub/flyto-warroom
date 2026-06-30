import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExperienceProvider, useExperience } from '../ExperienceContext'

const useCapabilitiesMock = vi.hoisted(() => vi.fn())
const useProjectCapabilitiesMock = vi.hoisted(() => vi.fn())

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: useCapabilitiesMock,
}))

vi.mock('@hooks/useProjectCapabilities', () => ({
  useProjectCapabilities: useProjectCapabilitiesMock,
}))

function Probe() {
  const experience = useExperience()
  return <div data-testid="experience">{experience.mode}:{String(experience.resolved)}</div>
}

function renderExperience() {
  return render(
    <MemoryRouter initialEntries={['/projects/org-1/dashboard']}>
      <Routes>
        <Route
          path="/projects/:orgId/dashboard"
          element={(
            <ExperienceProvider>
              <Probe />
            </ExperienceProvider>
          )}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function makeStorage() {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => { data.delete(key) },
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

describe('ExperienceProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
    localStorage.clear()
  })

  afterEach(() => {
    useCapabilitiesMock.mockReset()
    useProjectCapabilitiesMock.mockReset()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('defaults operators to engineer mode using backend action tokens', async () => {
    useCapabilitiesMock.mockReturnValue({
      ready: true,
      canDoAction: (action: string) => action === 'scan:trigger' || action === 'autofix:open_pr',
    })
    useProjectCapabilitiesMock.mockReturnValue({
      ready: true,
      canUseAction: (action: string) => action === 'scan:trigger' || action === 'autofix:open_pr',
    })

    renderExperience()

    await waitFor(() => expect(screen.getByTestId('experience').textContent).toBe('engineer:true'))
  })
})
