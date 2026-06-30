type QueryStateLike = {
  isSuccess?: boolean
  isError?: boolean
  isLoading?: boolean
  isPending?: boolean
  isFetching?: boolean
}

export type QueryBoundaryState = 'disabled' | 'loading' | 'error' | 'success'

export function queryBoundaryState(query: QueryStateLike, enabled = true): QueryBoundaryState {
  if (!enabled) return 'disabled'
  if (query.isSuccess === true) return 'success'
  if (query.isError === true) return 'error'
  return 'loading'
}

export function queryResolved(query: QueryStateLike, enabled = true): boolean {
  if (!enabled) return true
  return query.isSuccess === true || query.isError === true
}

export function queryUnresolved(query: QueryStateLike, enabled = true): boolean {
  return !queryResolved(query, enabled)
}

export function querySucceeded(query: QueryStateLike, enabled = true): boolean {
  return enabled && query.isSuccess === true
}

export function queryFailed(query: QueryStateLike, enabled = true): boolean {
  return enabled && query.isError === true
}

export function emptyStateReady(query: QueryStateLike, enabled = true): boolean {
  return querySucceeded(query, enabled)
}

export function resolvedList<T>(items: T[] | null | undefined, query: QueryStateLike, enabled = true): T[] {
  return querySucceeded(query, enabled) ? (items ?? []) : []
}
