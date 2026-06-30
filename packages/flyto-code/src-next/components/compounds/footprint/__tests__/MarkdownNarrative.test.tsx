/**
 * MarkdownNarrative — pin the inline markdown parser shape so
 * future LLM prompt tweaks don't silently regress rendering.
 *
 * The component is private (not exported) but accessible by
 * mounting through ReconBriefView. Here we test it indirectly by
 * passing markdown into the BriefNarrativeInline data path.
 *
 * Markdown features supported:
 *   - paragraph splits on \n\n
 *   - "1. ..." / "2. ..." numbered lists
 *   - "- ..." / "* ..." bullet lists
 *   - **bold** spans
 *
 * Anything else passes through as plain text.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useFrame: () => undefined,
}))
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Line: () => null,
  Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@lib/engine/code/footprintGraph', () => ({
  promotionTier: () => 'confirmed' as const,
  relationshipScore: () => 75,
  actionability: () => null,
  getFootprintGraph: vi.fn(),
  getFootprintTimeseries: vi.fn(),
  getFootprintPathScore: vi.fn(),
  getFootprintLatestRun: vi.fn(),
  getFootprintActionable: vi.fn(),
  getFootprintNarrative: vi.fn(),
  runFootprintExpansion: vi.fn(),
  openFootprintEvidencePack: vi.fn(),
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
  useConnectedRepos: () => ({ data: [] }),
}))

// Override the narrative query in useQuery so we control the
// markdown string that flows through MarkdownNarrative.
const TEST_NARRATIVE = `flyto2.com is a small SaaS brand operating in the financial sector.

The attacker's first move would be:

1. Search for **subdomains** via CT logs
2. Identify the GitHub org via name similarity
3. Probe **email format** and DMARC posture

Recommended next-step recon:

- Map the **lookalike domain** registration patterns
- Check **paste-site** activity for the seed domain
- Profile the WAF in front of the production stack`

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const k = String(queryKey[0])
    if (k === 'footprint-narrative') {
      return { data: { narrative: TEST_NARRATIVE, generated_at: '', cached: false }, isLoading: false, isFetching: false, refetch: vi.fn() }
    }
    return { data: null, isLoading: false, isFetching: false, refetch: vi.fn() }
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}))

import { NarrativePanel } from '../FootprintGraphView'

describe('MarkdownNarrative (via NarrativePanel)', () => {
  it('renders paragraphs', () => {
    render(<NarrativePanel orgId="org-1" entityCount={5} refreshKey={0} />)
    expect(screen.getByText(/small SaaS brand/i)).toBeTruthy()
  })

  it('renders numbered list items', () => {
    render(<NarrativePanel orgId="org-1" entityCount={5} refreshKey={0} />)
    expect(screen.getByText(/Search for/i)).toBeTruthy()
    expect(screen.getByText(/Identify the GitHub org/i)).toBeTruthy()
    expect(screen.getByText(/Probe/i)).toBeTruthy()
  })

  it('renders bullet list items', () => {
    render(<NarrativePanel orgId="org-1" entityCount={5} refreshKey={0} />)
    expect(screen.getByText(/Map the/i)).toBeTruthy()
    expect(screen.getByText(/Check/i)).toBeTruthy()
    expect(screen.getByText(/Profile the WAF/i)).toBeTruthy()
  })

  it('renders bold spans', () => {
    const { container } = render(<NarrativePanel orgId="org-1" entityCount={5} refreshKey={0} />)
    const strongs = container.querySelectorAll('strong')
    // 5 ** marks in TEST_NARRATIVE: subdomains, email format, lookalike domain, paste-site, (no fifth — re-count)
    // Actually 4: subdomains / email format / lookalike domain / paste-site
    expect(strongs.length).toBeGreaterThanOrEqual(3)
  })

  it('hides itself when entityCount=0', () => {
    const { container } = render(<NarrativePanel orgId="org-1" entityCount={0} refreshKey={0} />)
    // NarrativePanel returns null when entityCount=0
    expect(container.firstChild).toBeNull()
  })
})
