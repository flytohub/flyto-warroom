/**
 * FixQueueContext — global "open the fix wizard" entry point.
 *
 * Background: the dashboard / pulse showed counts and severity but
 * every CTA jumped to a list and dropped the operator there. This
 * context centralises a single right-side drawer that knows how
 * to walk one finding at a time: show the item, show WHY it ranks,
 * offer the recommended fix action, advance to the next one.
 *
 * Filters supported (`FixQueueFilter`):
 *   - 'all'      — every open finding, blast-radius order
 *   - 'autofix'  — autofix_eligible only
 *   - 'taint'    — taint_adjacency only (reachable from prod)
 *   - 'pr'       — open_prs_touching only
 *   - 'pentest'  — pentest_verdict only
 *
 * Usage from anywhere under FixQueueProvider:
 *
 *   const { open } = useFixQueue()
 *   <Button onClick={() => open({ filter: 'autofix' })}>
 *     Walk me through fixing
 *   </Button>
 *
 * Or open the queue scrolled to a specific item:
 *
 *   open({ filter: 'all', initialItemId: 'pulse-...' })
 */

import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react'

export type FixQueueFilter = 'all' | 'autofix' | 'taint' | 'pr' | 'pentest'

/** Restrict the queue to a specific asset (a repo or a domain).
 *  Used by Asset City building clicks so the operator opens the
 *  drawer on "everything affecting THIS building" instead of the
 *  full org-wide list. */
export interface AssetScope {
  kind: 'repo' | 'domain'
  /** repo id for `repo` scope, domain string for `domain` scope */
  value: string
}

export interface FixQueueOpenOptions {
  /** Which slice of the priority feed to walk through. Default 'all'. */
  filter?: FixQueueFilter
  /** Optional pulse-item id to land on first. If absent, the drawer
   *  starts on the highest-blast item that matches the filter. */
  initialItemId?: string
  /** Optional asset scope — narrow the queue to one repo / one
   *  domain. Combines with `filter`. */
  scope?: AssetScope
}

interface FixQueueState {
  open: boolean
  filter: FixQueueFilter
  initialItemId?: string
  scope?: AssetScope
}

interface FixQueueContextValue {
  state: FixQueueState
  open: (opts?: FixQueueOpenOptions) => void
  close: () => void
}

const FixQueueContext = createContext<FixQueueContextValue | null>(null)

export function FixQueueProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FixQueueState>({ open: false, filter: 'all' })

  const open = useCallback((opts?: FixQueueOpenOptions) => {
    setState({
      open: true,
      filter: opts?.filter ?? 'all',
      initialItemId: opts?.initialItemId,
      scope: opts?.scope,
    })
  }, [])

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }))
  }, [])

  const value = useMemo<FixQueueContextValue>(() => ({ state, open, close }), [state, open, close])

  return (
    <FixQueueContext.Provider value={value}>
      {children}
    </FixQueueContext.Provider>
  )
}

/**
 * useFixQueue — consume the provider. Throws if used outside a
 * FixQueueProvider; that's intentional so a missing provider doesn't
 * silently no-op (the user's "click here to fix" CTA would never
 * open the drawer and they'd lose trust in every CTA on the page).
 */
export function useFixQueue(): FixQueueContextValue {
  const ctx = useContext(FixQueueContext)
  if (!ctx) {
    throw new Error('useFixQueue must be called inside <FixQueueProvider>')
  }
  return ctx
}
