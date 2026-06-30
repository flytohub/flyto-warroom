/**
 * useRepoDetails — fetches GitHub data via engine proxy (no frontend token).
 */

import { useQuery } from '@tanstack/react-query'
import { useOrg } from './useOrg'
import { useGitHubConnection } from './useGitHubConnection'
import { getGitHubRepoDetail } from '@lib/engine'
import { qk } from '@lib/queryKeys'

export interface RepoDetail {
  description: string | null
  stars: number
  forks: number
  openIssues: number
  topics: string[]
  pushedAt: string
  size: number
  ci: { conclusion: string; name: string; updatedAt: string; htmlUrl: string } | null
}

export function useRepoDetail(owner: string, repoName: string) {
  const { org } = useOrg()
  const github = useGitHubConnection()
  const orgId = org?.id

  return useQuery({
    queryKey: qk.repos.detail(orgId, owner, repoName),
    queryFn: async (): Promise<RepoDetail | null> => {
      if (!orgId) return null
      let data
      try {
        data = await getGitHubRepoDetail(orgId, owner, repoName)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/no github credentials/i.test(message)) return null
        throw error
      }
      return {
        description: data.description,
        stars: data.stars,
        forks: data.forks,
        openIssues: data.openIssues,
        topics: [],
        pushedAt: data.updatedAt,
        size: 0,
        ci: data.ci ? {
          conclusion: data.ci.conclusion,
          name: data.ci.name,
          updatedAt: data.ci.createdAt,
          htmlUrl: data.ci.htmlUrl,
        } : null,
      }
    },
    enabled: !!orgId && !!owner && !!repoName && github.connected,
    placeholderData: null,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  })
}
