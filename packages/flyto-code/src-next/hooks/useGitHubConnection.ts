/**
 * useGitHubConnection — checks if GitHub is connected for the current org.
 * Queries the engine's /github/status endpoint (token stored server-side only).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from './useOrg'
import { getGitHubStatus } from '@lib/engine'
import { qk } from '@lib/queryKeys'

export function useGitHubConnection() {
  const { org } = useOrg()
  const orgId = org?.id
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: qk.repos.githubConnection(orgId),
    queryFn: () => getGitHubStatus(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  return {
    connected: data?.connected ?? false,
    login: data?.login ?? '',
    loading: isLoading,
    /** Call after connectGitHub + saveOrgToken to refresh status */
    refresh: () => qc.invalidateQueries({ queryKey: qk.repos.githubConnection(orgId) }),
  }
}
