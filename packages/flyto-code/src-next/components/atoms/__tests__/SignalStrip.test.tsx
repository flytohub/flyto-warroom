/**
 * SignalStrip — verifies the visible-cap + overflow popover.
 *
 * Behaviour pinned:
 *   • visible=2 with 5 signals → 2 chips + "+3" pill
 *   • pulse=true signals always win the visible slots
 *   • clicking the "+N" pill opens a Popover with the rest
 *   • nothing renders when signals=[]
 */
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SignalStrip } from '../SignalStrip'

describe('SignalStrip', () => {
  it('renders nothing when signals is empty', () => {
    const { container } = render(<SignalStrip signals={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('caps visible pills at the visible prop + shows overflow chip', () => {
    render(<SignalStrip visible={2} signals={[
      { tone: 'critical', label: 'KEV' },
      { tone: 'high',     label: 'EPSS 80%' },
      { tone: 'brand',    label: 'CROWN' },
      { tone: 'tech',     label: 'CF' },
      { tone: 'neutral',  label: 'Owner' },
    ]} />)
    // Two visible chips + a single +N pill.
    expect(screen.getByText('KEV')).toBeTruthy()
    expect(screen.getByText('EPSS 80%')).toBeTruthy()
    expect(screen.getByText('+3')).toBeTruthy()
    // Hidden ones should NOT be inline (they're in the popover).
    expect(screen.queryByText('CROWN')).toBeNull()
    expect(screen.queryByText('Owner')).toBeNull()
  })

  it('pulse signals win visible slots over higher-urgency static ones', () => {
    render(<SignalStrip visible={1} signals={[
      { tone: 'high', label: 'EPSS 80%' },                    // urgency 1, no pulse
      { tone: 'medium', label: 'CONCENTRATION', pulse: true }, // urgency 3 but pulses
    ]} />)
    // The pulsing label wins despite a worse base urgency.
    expect(screen.getByText('CONCENTRATION')).toBeTruthy()
  })

  it('opens overflow popover when +N is clicked', async () => {
    render(<SignalStrip visible={1} signals={[
      { tone: 'critical', label: 'KEV' },
      { tone: 'brand',    label: 'CROWN' },
      { tone: 'tech',     label: 'CF' },
    ]} />)
    const plusPill = screen.getByText('+2')
    fireEvent.click(plusPill)
    // jsdom doesn't compute popover positioning, but the chips
    // exist in the DOM after the click.
    expect(await screen.findByText('CROWN')).toBeTruthy()
    expect(await screen.findByText('CF')).toBeTruthy()
  })
})
