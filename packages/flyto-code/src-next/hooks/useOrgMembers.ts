/**
 * useOrgMembers — fetch GitHub org members via engine proxy.
 */

import { useQuery } from '@tanstack/react-query'
import { useOrg } from './useOrg'
import { getGitHubUserOrgs, getGitHubOrgMembers, type GitHubOrgMember } from '@lib/engine'
import { qk } from '@lib/queryKeys'

export interface OrgMemberInfo {
  login: string
  avatarUrl: string
  openPRs: number
}

export function useGitHubOrg() {
  const { org } = useOrg()
  const orgId = org?.id

  return useQuery({
    queryKey: qk.repos.githubOrgs(orgId),
    queryFn: async () => {
      if (!orgId) return []
      const data = await getGitHubUserOrgs(orgId)
      return data.orgs ?? []
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  })
}

export function useGitHubOrgMembers(orgLogin: string | undefined) {
  const { org } = useOrg()
  const orgId = org?.id

  return useQuery({
    queryKey: qk.repos.githubOrgMembers(orgId, orgLogin),
    queryFn: async () => {
      if (!orgId || !orgLogin) return []
      const data = await getGitHubOrgMembers(orgId, orgLogin)
      const members: OrgMemberInfo[] = (data.members ?? []).map((m: GitHubOrgMember) => ({
        login: m.login,
        avatarUrl: m.avatar_url ?? '',
        openPRs: 0,
      }))
      return members
    },
    enabled: !!orgId && !!orgLogin,
    staleTime: 5 * 60_000,
  })
}
