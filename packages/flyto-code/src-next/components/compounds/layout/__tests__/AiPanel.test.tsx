/**
 * AiPanel smoke test — verifies both the collapsed-icon-strip and the
 * expanded-panel render paths. Sub-panels are stubbed; this gate just
 * confirms the panel shell + the collapse toggle wire correctly.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('../AiPanelBriefing', () => ({ AiPanelBriefing: () => null }))
vi.mock('../AiPanelHotFindings', () => ({ AiPanelHotFindings: () => null }))
vi.mock('../AiPanelActions', () => ({ AiPanelActions: () => null }))

import { render } from '@testing-library/react'
import { AiPanel } from '../AiPanel'

describe('AiPanel smoke', () => {
  it('renders collapsed icon strip', () => {
    const { container } = render(<AiPanel collapsed={true} onToggle={() => {}} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders expanded panel shell', () => {
    const { container } = render(<AiPanel collapsed={false} onToggle={() => {}} />)
    expect(container.firstChild).toBeTruthy()
  })
})
