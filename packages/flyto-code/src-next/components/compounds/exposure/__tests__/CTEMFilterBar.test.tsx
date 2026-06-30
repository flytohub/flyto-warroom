/**
 * CTEMFilterBar — verifies the toolbar's behaviour without the
 * surrounding view: search input echoes back via onChange, filter
 * toggles add chips, "Clear all" wipes the state.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

import { CTEMFilterBar, EMPTY_FILTER } from '../CTEMFilterBar'

describe('CTEMFilterBar', () => {
  it('echoes search input via onChange', () => {
    const onChange = vi.fn()
    render(<CTEMFilterBar state={EMPTY_FILTER} onChange={onChange} total={10} shown={10} />)
    const input = screen.getByPlaceholderText('Search by title, domain, category, threat actor…') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'api.acme' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'api.acme' }))
  })

  it('shows the filtered counter when shown < total', () => {
    render(<CTEMFilterBar state={EMPTY_FILTER} onChange={vi.fn()} total={42} shown={7} />)
    expect(screen.getByText('7 / 42')).toBeTruthy()
  })

  it('shows the single-number counter when shown === total', () => {
    render(<CTEMFilterBar state={EMPTY_FILTER} onChange={vi.fn()} total={42} shown={42} />)
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('renders active filter chips with delete handlers', () => {
    const onChange = vi.fn()
    render(<CTEMFilterBar
      state={{ ...EMPTY_FILTER, tiers: ['crown_jewel'], breachedOnly: true }}
      onChange={onChange}
      total={5} shown={2}
    />)
    expect(screen.getByText('crown jewel')).toBeTruthy()
    expect(screen.getByText('Breached')).toBeTruthy()
    // Click "Clear all" — onChange fires with EMPTY_FILTER.
    fireEvent.click(screen.getByText('Clear all'))
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTER)
  })
})
