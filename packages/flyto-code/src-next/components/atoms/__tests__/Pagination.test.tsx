import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pagination } from '../Pagination'

// Mock i18n
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
}))

describe('Pagination', () => {
  it('renders nothing when totalPages <= 1', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} total={5} pageSize={10} onPageChange={() => {}} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders MUI pagination component', () => {
    const { container } = render(
      <Pagination page={1} totalPages={3} total={30} pageSize={10} onPageChange={() => {}} />
    )
    // MUI Pagination renders nav with pagination items
    const nav = container.querySelector('nav')
    expect(nav).not.toBeNull()
  })

  it('highlights active page via MUI Mui-selected class', () => {
    const { container } = render(
      <Pagination page={2} totalPages={3} total={30} pageSize={10} onPageChange={() => {}} />
    )
    // MUI marks the active page with Mui-selected class
    const selected = container.querySelector('.Mui-selected')
    expect(selected).not.toBeNull()
    expect(selected!.textContent).toBe('2')
  })

  it('calls onPageChange when a page button is clicked', async () => {
    const onChange = vi.fn()
    render(
      <Pagination page={1} totalPages={3} total={30} pageSize={10} onPageChange={onChange} />
    )
    const { fireEvent } = await import('@testing-library/react')
    // Find page 2 button
    const page2 = screen.getByText('2')
    fireEvent.click(page2)
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('shows correct range text', () => {
    render(
      <Pagination page={2} totalPages={3} total={25} pageSize={10} onPageChange={() => {}} />
    )
    // Should show "issues.showing 11-20 / 25"
    const text = screen.getByText(/11-20/i)
    expect(text).toBeDefined()
  })

  it('caps last page range to total', () => {
    render(
      <Pagination page={3} totalPages={3} total={25} pageSize={10} onPageChange={() => {}} />
    )
    // Page 3 should show 21-25 (not 21-30)
    const text = screen.getByText(/21-25/i)
    expect(text).toBeDefined()
  })
})
