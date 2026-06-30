/**
 * useOrg — manages the current organization based on URL param.
 * Reads :orgId from the route and finds the matching org.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useAuth } from './useAuth'
import { listOrgs, updateOrg, listConnectedRepos } from '@lib/engine'
import { qk } from '@lib/queryKeys'

export function useOrg() {
  const { user } = useAuth()
  const { orgId } = useParams<{ orgId: string }>()
  const qc = useQueryClient()

  // Fetch orgs
  const orgsQuery = useQuery({
    queryKey: qk.platform.orgs(),
    queryFn: listOrgs,
    enabled: !!user,
    retry: 1,
  })

  const orgs = orgsQuery.data?.organizations ?? []
  const currentOrg = orgId && orgsQuery.isSuccess
    ? (orgs.find((o) => o.id === orgId) ?? null)
    : null
  const notFound = !!orgId && orgsQuery.isSuccess && !currentOrg
  const status = orgsQuery.isError
    ? 'error'
    : !orgsQuery.isSuccess
      ? 'loading'
      : notFound
        ? 'not_found'
        : 'ready'

  const renameOrg = useMutation({
    mutationFn: (name: string) => {
      if (!currentOrg) throw new Error('No org')
      return updateOrg(currentOrg.id, { name })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform.orgs() }),
  })

  return {
    org: currentOrg,
    orgs,
    loading: orgsQuery.isLoading || orgsQuery.isFetching,
    /** true only after the first successful fetch */
    ready: orgsQuery.isSuccess,
    notFound,
    status,
    error: orgsQuery.error,
    renameOrg: renameOrg.mutate,
    renaming: renameOrg.isPending,
  }
}

export function useConnectedRepos(orgId: string | undefined) {
  return useQuery({
    queryKey: qk.repos.connected(orgId),
    queryFn: () => listConnectedRepos(orgId!),
    enabled: !!orgId,
    select: (data) => data.repos,
  })
}
