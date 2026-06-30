import { useQuery } from '@tanstack/react-query'
import { useOrg } from './useOrg'
import { getGitHubPRActivity } from '@lib/engine'
import { qk } from '@lib/queryKeys'

export interface PRItem {
  title: string
  url: string
  author: string
  authorAvatar: string
  repo: string
  createdAt: string
  updatedAt: string
  isDraft: boolean
  labels: Array<{ name: string; color: string }>
}

export interface PRSummary {
  openCount: number
  mergedThisWeek: number
  openPRs: PRItem[]
  stalePRs: PRItem[]
  avgAge: number
}

export function usePRActivity(orgLogin: string | undefined) {
  const { org } = useOrg()
  const orgId = org?.id

  return useQuery({
    queryKey: qk.repos.prActivity(orgId, orgLogin),
    queryFn: async (): Promise<PRSummary> => {
      if (!orgId || !orgLogin) return { openCount: 0, mergedThisWeek: 0, openPRs: [], stalePRs: [], avgAge: 0 }

      const data = await getGitHubPRActivity(orgId, orgLogin)

      // TODO(backend-truth, M13): "stale" window (7d) is a product
      // decision and `avg_age_days * 24` is a mechanical conversion
      // that should ship from the engine as hours directly. Browser
      // clock drift currently shifts "stale" definition per device.
      // See FRONTEND_LOGIC_AUDIT_2026_05_24.md#M13
      const now = Date.now()
      const weekMs = 7 * 24 * 60 * 60 * 1000
      const openPRs: PRItem[] = (data.open_prs ?? []).map((pr) => {
        const repoName = pr.repository_url?.split('/').slice(-1)[0] ?? ''
        return {
          title: pr.title,
          url: pr.html_url,
          author: pr.user?.login ?? '',
          authorAvatar: pr.user?.avatar_url ?? '',
          repo: repoName,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          isDraft: pr.draft ?? false,
          labels: pr.labels ?? [],
        }
      })
      const stalePRs = openPRs.filter(pr => now - new Date(pr.createdAt).getTime() > weekMs)

      return {
        openCount: data.open_count,
        mergedThisWeek: data.merged_this_week,
        openPRs,
        stalePRs,
        avgAge: data.avg_age_days * 24,
      }
    },
    enabled: !!orgId && !!orgLogin,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}
