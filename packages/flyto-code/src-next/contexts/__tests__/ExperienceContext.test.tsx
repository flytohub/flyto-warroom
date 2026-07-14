import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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

function InteractiveProbe() {
  const experience = useExperience()
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <div data-testid="experience">{experience.mode}:{String(experience.resolved)}</div>
      <div data-testid="location">{location.pathname}{location.search}</div>
      <button type="button" onClick={() => experience.setMode('engineer')}>engineer</button>
      <button type="button" onClick={() => experience.setMode('manager')}>manager</button>
      <button type="button" onClick={() => navigate('/projects/org-1/mcp?mode=manager')}>mcp manager</button>
      <button type="button" onClick={() => navigate('/projects/org-1/agent-firewall/governance?mode=manager')}>governance manager</button>
    </div>
  )
}

function renderExperience(initialEntry = '/projects/org-1/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/projects/:orgId/*"
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

function renderInteractiveExperience(initialEntry = '/projects/org-1/agent-firewall/governance?mode=manager') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/projects/:orgId/*"
          element={(
            <ExperienceProvider>
              <InteractiveProbe />
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

  it('lets explicit URL mode win over stored manager mode on dual-mode pages', async () => {
    localStorage.setItem('flyto.experienceMode', 'manager')
    useCapabilitiesMock.mockReturnValue({
      ready: true,
      canDoAction: () => false,
    })
    useProjectCapabilitiesMock.mockReturnValue({
      ready: true,
      canUseAction: () => false,
    })

    renderExperience('/projects/org-1/posture-overview?mode=engineer')

    await waitFor(() => expect(screen.getByTestId('experience').textContent).toBe('engineer:true'))
    expect(localStorage.getItem('flyto.experienceMode')).toBe('engineer')
  })

  it('normalizes non-dual pages to engineer mode instead of carrying stale manager state', async () => {
    localStorage.setItem('flyto.experienceMode', 'manager')
    useCapabilitiesMock.mockReturnValue({
      ready: true,
      canDoAction: () => false,
    })
    useProjectCapabilitiesMock.mockReturnValue({
      ready: true,
      canUseAction: () => false,
    })

    renderExperience('/projects/org-1/mcp?mode=manager')

    await waitFor(() => expect(screen.getByTestId('experience').textContent).toBe('engineer:true'))
    expect(localStorage.getItem('flyto.experienceMode')).toBe('engineer')
  })

  it('keeps URL, storage, and rendered mode in sync while switching inside one mounted workspace', async () => {
    localStorage.setItem('flyto.experienceMode', 'manager')
    useCapabilitiesMock.mockReturnValue({
      ready: true,
      canDoAction: () => false,
    })
    useProjectCapabilitiesMock.mockReturnValue({
      ready: true,
      canUseAction: () => false,
    })

    renderInteractiveExperience()

    await waitFor(() => expect(screen.getByTestId('experience').textContent).toBe('manager:true'))

    fireEvent.click(screen.getByText('engineer'))

    await waitFor(() => {
      expect(screen.getByTestId('experience').textContent).toBe('engineer:true')
      expect(screen.getByTestId('location').textContent).toContain('mode=engineer')
    })
    expect(localStorage.getItem('flyto.experienceMode')).toBe('engineer')

    fireEvent.click(screen.getByText('manager'))

    await waitFor(() => {
      expect(screen.getByTestId('experience').textContent).toBe('manager:true')
      expect(screen.getByTestId('location').textContent).toContain('mode=manager')
    })
    expect(localStorage.getItem('flyto.experienceMode')).toBe('manager')
  })

  it('does not let non-dual route normalization block the next explicit manager URL', async () => {
    localStorage.setItem('flyto.experienceMode', 'manager')
    useCapabilitiesMock.mockReturnValue({
      ready: true,
      canDoAction: () => false,
    })
    useProjectCapabilitiesMock.mockReturnValue({
      ready: true,
      canUseAction: () => false,
    })

    renderInteractiveExperience('/projects/org-1/agent-firewall/governance?mode=manager')

    fireEvent.click(screen.getByText('mcp manager'))

    await waitFor(() => {
      expect(screen.getByTestId('experience').textContent).toBe('engineer:true')
      expect(screen.getByTestId('location').textContent).toContain('/mcp?mode=engineer')
    })

    fireEvent.click(screen.getByText('governance manager'))

    await waitFor(() => {
      expect(screen.getByTestId('experience').textContent).toBe('manager:true')
      expect(screen.getByTestId('location').textContent).toContain('/agent-firewall/governance?mode=manager')
    })
  })
})
