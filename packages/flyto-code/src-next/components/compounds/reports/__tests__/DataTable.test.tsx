import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataTable from '../charts/DataTable'

describe('DataTable', () => {
  it('renders useful scalar columns and hides internal/object fields', () => {
    render(
      <DataTable
        rows={[{
          id: 'internal-id',
          severity: 'high',
          commit_sha: '0123456789abcdef0123456789abcdef',
          tags: ['a', 'b'],
          nested: { ignored: true },
          verify_passed: true,
        }]}
      />,
    )

    expect(screen.getByText('Severity')).toBeTruthy()
    expect(screen.getByText('Commit')).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByText('HIGH')).toBeTruthy()
    expect(screen.getByText('01234567...')).toBeTruthy()
    expect(screen.getByText('yes')).toBeTruthy()
    expect(screen.queryByText('internal-id')).toBeNull()
    expect(screen.queryByText('nested')).toBeNull()
  })

  it('uses i18n for empty and row-limit states', () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ name: `row-${i}` }))

    const { rerender } = render(<DataTable rows={[]} />)
    expect(screen.getByText('No data')).toBeTruthy()

    rerender(<DataTable rows={rows} fields={['name']} />)
    expect(screen.getByText('Showing 100 of 101 rows')).toBeTruthy()
  })
})
