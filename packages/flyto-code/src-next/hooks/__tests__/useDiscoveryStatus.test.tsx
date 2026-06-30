import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  markDiscoveryComplete,
  markDiscoveryStarted,
  seedScanningFromServer,
  useDiscoveryStatus,
} from '../useDiscoveryStatus'

function DiscoveryProbe({ snapshots }: { snapshots: ReadonlySet<string>[] }) {
  const { scanningSet, scanningCount, isScanning } = useDiscoveryStatus()
  snapshots.push(scanningSet)
  return (
    <div>
      <span data-testid="count">{scanningCount}</span>
      <span data-testid="kr">{String(isScanning('kr-domain-1'))}</span>
    </div>
  )
}

describe('useDiscoveryStatus', () => {
  afterEach(() => {
    act(() => seedScanningFromServer([]))
  })

  it('publishes a new snapshot when discovery state changes', () => {
    const snapshots: ReadonlySet<string>[] = []
    render(<DiscoveryProbe snapshots={snapshots} />)

    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByTestId('kr').textContent).toBe('false')

    act(() => markDiscoveryStarted('kr-domain-1'))

    expect(screen.getByTestId('count').textContent).toBe('1')
    expect(screen.getByTestId('kr').textContent).toBe('true')
    expect(snapshots.at(-1)).not.toBe(snapshots[0])

    const runningSnapshot = snapshots.at(-1)
    act(() => markDiscoveryComplete('kr-domain-1'))

    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByTestId('kr').textContent).toBe('false')
    expect(snapshots.at(-1)).not.toBe(runningSnapshot)
  })

  it('seeds project-less kernel resource ids from the active-discoveries endpoint shape', () => {
    const snapshots: ReadonlySet<string>[] = []
    render(<DiscoveryProbe snapshots={snapshots} />)

    act(() => seedScanningFromServer([{
      project_id: 'kr-domain-1',
      target: 'scan.example.com',
      started_at: '2026-06-07T00:00:00Z',
      elapsed_sec: 3,
    }]))

    expect(screen.getByTestId('count').textContent).toBe('1')
    expect(screen.getByTestId('kr').textContent).toBe('true')
  })
})
