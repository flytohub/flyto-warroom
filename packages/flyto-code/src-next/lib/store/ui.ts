/**
 * lib/store/ui.ts — cross-cutting workspace UI state (zustand).
 *
 * The store for CLIENT state that is shared across views and survives
 * navigation — the counterpart to react-query, which owns SERVER state.
 * It deliberately holds ONLY genuinely cross-cutting UI state; ephemeral
 * per-component state (modal open, row expand, local form) stays `useState`,
 * and route-derived values stay in hooks (they read the router).
 *
 * First slice: the global repo filter (was RepoFilterContext — a Context +
 * provider + manual localStorage). zustand needs no provider, persists via
 * middleware, and only re-renders the components that select the changed
 * field. See hooks/useRepoFilter.tsx for the (unchanged) consumer API + the
 * URL sync that stays in a hook because it reads react-router.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  /** Global repo filter — '' = all repos. Shared across Issues / Pulse /
   *  Security views so a selection survives navigation. */
  repoId: string
  repoName: string
  setRepo: (id: string, name: string) => void
  clearRepo: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      repoId: '',
      repoName: '',
      setRepo: (id, name) => set({ repoId: id, repoName: name }),
      clearRepo: () => set({ repoId: '', repoName: '' }),
    }),
    {
      name: 'flyto-ui-store',
      partialize: (s) => ({ repoId: s.repoId, repoName: s.repoName }),
    },
  ),
)
