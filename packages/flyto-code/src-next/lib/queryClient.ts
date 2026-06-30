import { QueryClient, QueryCache, MutationCache, keepPreviousData, type Mutation } from '@tanstack/react-query'
import { captureError } from './sentry'
import { formatEngineError } from './engine/errors'

/**
 * Global mutation error handler — surfaces failures as a DOM event so
 * the SnackbarProvider (or any listener) can show a toast without every
 * mutation needing its own onError.
 *
 * Mutations that already have a local onError will still fire this, but
 * the convention is: local onError handles domain-specific messages,
 * global handler provides the safety net for mutations that forgot.
 */
function onMutationError(error: Error, _variables: unknown, _context: unknown, mutation?: Mutation) {
  // Skip if the mutation already has a local onError (it handled it).
  const opts = mutation?.options as { onError?: unknown } | undefined
  if (typeof opts?.onError === 'function') return

  const msg = formatEngineError(error, 'Operation failed')
  window.dispatchEvent(new CustomEvent('flyto:mutation-error', { detail: msg }))
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: onMutationError as never,
  }),
  // Every query failure ships to Sentry tagged with the queryKey
  // root (e.g. "findings", "ioc-lookup"). When VITE_SENTRY_DSN is
  // unset this is a console.error no-op, so no behaviour change in
  // dev without the secret.
  queryCache: new QueryCache({
    onError: (error, query) => {
      const root = Array.isArray(query.queryKey) ? String(query.queryKey[0]) : 'unknown'
      captureError(error, { queryKey: root, queryHash: query.queryHash })
    },
  }),
  defaultOptions: {
    queries: {
      // Stale-while-revalidate horizon. Anything queried within
      // 5 min reuses the cached value without re-firing the
      // network call.
      staleTime: 5 * 60 * 1000,
      // Cache retention horizon. Operator 2026-05-22: "資訊渲染
      // 有點慢" — switching between dashboard tabs was evicting
      // cached fetches every 5 min (TanStack default gcTime), so
      // returning to the dashboard re-paid the 9-parallel-query
      // cost. 30 min keeps the dashboard hot for a full work
      // session without unbounded memory growth.
      gcTime: 30 * 60 * 1000,
      // Show last fetched data immediately while a re-fetch runs
      // in the background. Without this, the cards flicker to
      // skeleton/empty during any refetch (filter change, tab
      // return, etc.) even though we have perfectly good prior
      // data to show. Same UX a streaming dashboard expects.
      placeholderData: keepPreviousData,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})
