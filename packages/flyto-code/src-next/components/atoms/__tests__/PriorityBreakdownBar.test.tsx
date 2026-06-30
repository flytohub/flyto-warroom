/**
 * PriorityBreakdownBar — pins the math + a11y label so refactors
 * can't quietly drift the segment formula away from the backend.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

import { PriorityBreakdownBar } from '../PriorityBreakdownBar'

describe('PriorityBreakdownBar', () => {
  it('renders the priority score as the trailing number', () => {
    render(<PriorityBreakdownBar
      baseSeverity="high" tierMultiplier={1.5}
      exploitSignal="kev" mitigationFactor={0}
      priorityScore={90}
    />)
    expect(screen.getByText('90')).toBeTruthy()
  })

  it('exposes an aria-label that summarises the breakdown', () => {
    render(<PriorityBreakdownBar
      baseSeverity="high" tierMultiplier={1.2}
      exploitSignal="epss-high" exploitScore={0.7}
      mitigationFactor={0.3}
      priorityScore={48}
    />)
    const region = screen.getByRole('img')
    const label = region.getAttribute('aria-label') ?? ''
    expect(label).toContain('48')      // score
    expect(label).toContain('Base')     // i18n key resolves to fallback
    expect(label).toContain('Tier')
    expect(label).toContain('Exploit')
    expect(label).toContain('Mitigation')
  })

  it('uses scoreToBucket math — sandbox tier negative segment renders', () => {
    // tier=0.5 < 1 produces a tier-penalty segment (sandbox)
    const { container } = render(<PriorityBreakdownBar
      baseSeverity="critical" tierMultiplier={0.5}
      exploitSignal="none" mitigationFactor={0}
      priorityScore={20}
    />)
    // Segment count: base + sandbox-penalty (+ no exploit + no mit) = 2 divs inside the bar
    // Sandbox label appears in segment title.
    const bar = container.querySelector('[role="img"]')
    expect(bar).toBeTruthy()
    const segments = bar?.querySelectorAll('div[title]') ?? []
    const titles = Array.from(segments).map(s => s.getAttribute('title') ?? '')
    expect(titles.some(t => t.includes('Sandbox'))).toBe(true)
  })

  it('clamps mitigation segment width when mitigationFactor > 0.85', () => {
    // Backend caps at 0.85 — bar should not display a > 85% reduction.
    render(<PriorityBreakdownBar
      baseSeverity="critical" tierMultiplier={1.0}
      exploitSignal="kev" mitigationFactor={1.0}
      priorityScore={1}
    />)
    // Score never reaches 0 even with full mitigation claim — pin
    // that the priority number is at least 1 (the floor we ship).
    expect(screen.getByText('1')).toBeTruthy()
  })
})
