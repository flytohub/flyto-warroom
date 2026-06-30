/**
 * useRepoFilter — global repo filter, backed by the zustand UI store.
 *
 * The state lives in `lib/store/ui.ts` (persisted, provider-free). This hook
 * is the unchanged consumer API (repoId / repoName / setRepo / clearRepo) so
 * the ~dozen call sites didn't change. `setRepo` mirrors the selection into the
 * URL (?repo=) so it's shareable/deep-linkable; the URL→store direction (a user
 * navigating to a link with ?repo=xxx) is synced once by `RepoFilterProvider`,
 * which is now a sync-only wrapper — it no longer provides a Context.
 *
 * Was: a Context + provider + manual localStorage. zustand removed the
 * provider plumbing and the localStorage code (persist middleware), and means
 * only components that read repoId/repoName re-render when it changes.
 */
import { useCallback, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUiStore } from '@lib/store/ui'

interface RepoFilterState {
  repoId: string
  repoName: string
  setRepo: (id: string, name: string) => void
  clearRepo: () => void
}

export function useRepoFilter(): RepoFilterState {
  const repoId = useUiStore((s) => s.repoId)
  const repoName = useUiStore((s) => s.repoName)
  const setRepoState = useUiStore((s) => s.setRepo)
  const [, setSearchParams] = useSearchParams()

  const setRepo = useCallback((id: string, name: string) => {
    setRepoState(id, name)
    // Mirror into the URL (replace, not push) so the filter is shareable.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) { next.set('repo', id); next.set('repoName', name) }
      else { next.delete('repo'); next.delete('repoName') }
      return next
    }, { replace: true })
  }, [setRepoState, setSearchParams])

  const clearRepo = useCallback(() => setRepo('', ''), [setRepo])

  return { repoId, repoName, setRepo, clearRepo }
}

/**
 * RepoFilterProvider — sync-only wrapper (kept so App's tree is unchanged).
 * Reads ?repo= from the URL on navigation and pushes it into the store; it no
 * longer provides a Context (the store is global). Mount once near the root.
 */
export function RepoFilterProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams()
  const setRepoState = useUiStore((s) => s.setRepo)
  const currentId = useUiStore((s) => s.repoId)

  useEffect(() => {
    const urlRepo = searchParams.get('repo') ?? ''
    if (urlRepo && urlRepo !== currentId) {
      setRepoState(urlRepo, searchParams.get('repoName') ?? urlRepo)
    }
  }, [searchParams, currentId, setRepoState])

  return <>{children}</>
}
