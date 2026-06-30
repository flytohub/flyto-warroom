/**
 * SensorMapView smoke test — Phase 4.
 *
 * Verifies the page renders header + empty/populated bar chart.
 * The 3D globe is lazy-loaded via Suspense and uses three.js,
 * which jsdom can't run; we just assert the chart fallback path.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1' } }),
}))

// The view now calls useNavigate() (from 'react-router') for the
// "Run domain discovery" CTA on the no-attack-surface empty state.
// No Router wraps the test render, so stub the hook.
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const { mockMap, mockLedger } = vi.hoisted(() => ({ mockMap: vi.fn(), mockLedger: vi.fn() }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => ({
    data: (queryFn as () => unknown)(),
    isLoading: false, isError: false,
  }),
}))

vi.mock('@lib/engine', () => ({
  getSensorMap: mockMap,
  listSensorObservations: mockLedger,
}))

vi.mock('../ThreatIntelRefreshButton', () => ({
  ThreatIntelRefreshButton: () => null,
}))

// 3D globe is lazy-loaded; stub it so Suspense doesn't try to
// import three.js (jsdom can't render WebGL).
vi.mock('../WorldHeatGlobe', () => ({
  WorldHeatGlobe: () => null,
}))

import { SensorMapView } from '../SensorMapView'

describe('SensorMapView', () => {
  it('renders empty state when no countries reported', () => {
    // No observations + a non-surface empty_reason → the view renders the
    // honest "nothing seen yet … no geolocated threat observations" copy
    // (surface IS mapped, just no hits), distinct from the no-surface CTA.
    mockMap.mockReturnValue({ by_country: {}, empty_reason: 'no_iocs' })
    mockLedger.mockReturnValue({ observations: [], count: 0, stats: {}, limit: 6, offset: 0 })
    render(<SensorMapView />)
    expect(screen.getByRole('heading', { name: 'Sensor Intelligence' })).toBeTruthy()
    expect(screen.getByText(/no geolocated threat observations/i)).toBeTruthy()
    expect(screen.getByText(/not validation proof/i)).toBeTruthy()
  })

  it('renders ranked country bars when data is present', () => {
    // Valid ISO-2 codes only — none get bucketed to the "ZZ" unknown-origin
    // split, so all three appear in the ranked list / top-origin tile.
    mockMap.mockReturnValue({
      by_country: { US: 50, CN: 30, RU: 20 },
      empty_reason: '',
    })
    mockLedger.mockReturnValue({
      observations: [{
        id: 'obs-1',
        source: 'sensor-intel',
        indicator: '1.2.3.4',
        indicator_kind: 'ip',
        threat_category: 'botnet',
        observed_count: 7,
        confidence: 0.8,
        last_seen_at: '2026-06-16T00:00:00Z',
      }],
      count: 1,
      stats: {},
      limit: 6,
      offset: 0,
    })
    render(<SensorMapView />)
    // "United States" appears as the top-origin tile + as a bar
    // row; getAllByText guards against the multi-match.
    expect(screen.getAllByText(/United States/i).length).toBeGreaterThan(0)
    expect(screen.getByText('China')).toBeTruthy()
    expect(screen.getByText('Russia')).toBeTruthy()
    expect(screen.getByText('1.2.3.4')).toBeTruthy()
    expect(screen.getByText(/botnet/i)).toBeTruthy()
  })
})
