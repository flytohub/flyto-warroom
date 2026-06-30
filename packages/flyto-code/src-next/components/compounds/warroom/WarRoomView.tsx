import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, CircularProgress } from '@mui/material'
import { GitBranch, Compass, Plus, Play } from 'lucide-react'
import { useNavigate } from 'react-router'

import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { queryResolved } from '@lib/queryState'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import {
  getOrgHealthSummary, getOrgAPIDefinitions,
  type ConnectedRepo,
} from '@lib/engine'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { QueryError } from '@atoms/QueryError'

import {
  SECTION_REGISTRY, isKnownSection, sectionNeedsHealth,
  type SectionCtx,
} from './sectionRegistry'

interface WarRoomViewProps {
  activeSection: string
  onNavigate?: (section: string) => void
}

import type { OrgWarRoomData } from '@compounds/_shared/warroom'
// Re-exported so existing `import { OrgWarRoomData } from './WarRoomView'`
// consumers (e.g. sectionRegistry) keep working; the canonical home is
// @compounds/_shared/warroom.
export type { OrgWarRoomData }

/**
 * WarRoomView — section dispatcher.
 *
 * The actual "id → view" mapping lives in sectionRegistry.tsx; this
 * component only handles the cross-cutting concerns: fetching the
 * health summary on demand, applying the connected-repos / unknown-
 * section empty states, and forwarding cross-section nav events.
 *
 * Adding a new section now = one entry in sectionRegistry.tsx (and
 * the corresponding nav entry in types/sections.ts). No edits here.
 */
export function WarRoomView({ activeSection, onNavigate }: WarRoomViewProps) {
  const { org, ready: orgReady, notFound: orgNotFound, error: orgError } = useOrg()
  const orgId = org?.id
  const nav = useNavigate()
  const reposQ = useConnectedRepos(orgId)
  const repoList = useMemo(() => reposQ.data ?? [], [reposQ.data])

  const def = SECTION_REGISTRY[activeSection]
  const needsHealth = sectionNeedsHealth(activeSection)

  // Cross-section nav — descendant views fire `flyto:navigate-section`
  // CustomEvents instead of prop-drilling the setter through 4 layers.
  useEffect(() => {
    if (!onNavigate) return
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ sectionId?: string }>
      const next = ce.detail?.sectionId
      if (next && typeof next === 'string') onNavigate(next)
    }
    window.addEventListener('flyto:navigate-section', handler as EventListener)
    return () => window.removeEventListener('flyto:navigate-section', handler as EventListener)
  }, [onNavigate])

  // Health summary — fetched only for sections that declare needsHealth.
  const { data: healthData, isLoading: healthLoading, isError: healthError, error: healthErr, refetch: refetchHealth } = useQuery({
    queryKey: qk.repos.healthSummary(orgId),
    queryFn: () => getOrgHealthSummary(orgId!),
    enabled: !!orgId && needsHealth && reposQ.isSuccess && repoList.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  // API definitions — only the arch-api section needs them.
  const { data: apiData } = useQuery({
    queryKey: qk.repos.apiDefinitions(orgId),
    queryFn: () => getOrgAPIDefinitions(orgId!),
    enabled: !!orgId && activeSection === 'arch-api',
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const healthRepos = useMemo(() => healthData?.repos ?? [], [healthData])
  const repoNameMap = useMemo(() => {
    const map: Record<string, ConnectedRepo> = {}
    for (const r of repoList) map[r.id] = r
    return map
  }, [repoList])

  const orgData: OrgWarRoomData = useMemo(() => ({
    healthRepos,
    repos: repoList,
    apis: apiData?.apis ?? [],
    apiTotal: apiData?.total ?? 0,
  }), [healthRepos, repoList, apiData])

  // ── Empty-state branches ──────────────────────────────────────

  if (!isKnownSection(activeSection)) {
    return (
      <Box className="p-4">
        <EmptyStateGuide
          icon={<Compass size={28} />}
          title={t('warroom.noData')}
          description={t('warroom.noDataDesc')}
          primaryAction={orgId ? {
            label: t('warroom.goRepos'),
            icon: <GitBranch size={16} />,
            onClick: () => nav(`/projects/${orgId}/repos`),
          } : undefined}
        />
      </Box>
    )
  }

  if (needsHealth && (orgError || orgNotFound)) {
    return (
      <Box sx={{ height: '100%', overflow: 'auto' }}>
        <QueryError
          error={orgError ?? new Error('Workspace not found')}
          label={t('warroom.orgLabel')}
        />
      </Box>
    )
  }

  if (needsHealth && (!orgReady || !queryResolved(reposQ, !!orgId))) {
    return (
      <Box sx={{ height: '100%', overflow: 'hidden' }}>
        <Box className="flex items-center justify-center py-16">
          <CircularProgress size={20} />
        </Box>
      </Box>
    )
  }

  if (needsHealth && reposQ.isError) {
    return (
      <Box sx={{ height: '100%', overflow: 'auto' }}>
        <QueryError
          error={reposQ.error}
          onRetry={reposQ.refetch}
          label={t('warroom.reposLabel')}
        />
      </Box>
    )
  }

  // Health-dependent sections require connected repos. Self-fetch
  // sections don't — they render their own empty states when their
  // own query returns nothing.
  if (needsHealth && repoList.length === 0) {
    return (
      <Box className="p-4">
        <EmptyStateGuide
          icon={<GitBranch size={28} />}
          title={t('warroom.noRepos')}
          description={t('warroom.noReposDesc')}
          steps={[
            { label: t('warroom.stepConnect'), hint: t('warroom.stepConnectHint') },
            { label: t('warroom.stepScan'), hint: t('warroom.stepScanHint') },
            { label: t('warroom.stepReview') },
          ]}
          primaryAction={orgId ? {
            label: t('warroom.connectRepos'),
            icon: <Plus size={16} />,
            onClick: () => nav(`/projects/${orgId}/repos`),
          } : undefined}
        />
      </Box>
    )
  }

  if (needsHealth && healthLoading) {
    return (
      <Box sx={{ height: '100%', overflow: 'hidden' }}>
        <Box className="flex items-center justify-center py-16">
          <CircularProgress size={20} />
        </Box>
      </Box>
    )
  }

  if (needsHealth && healthError) {
    return (
      <Box sx={{ height: '100%', overflow: 'auto' }}>
        <QueryError
          error={healthErr}
          onRetry={refetchHealth}
          label={t('warroom.healthLabel')}
        />
      </Box>
    )
  }

  // Health-summary lag fallback: when needsHealth + has repos but
  // healthRepos comes back empty (observed in prod with 24 repos
  // having profile data but health-summary still 0), surface a
  // "run scan" CTA instead of letting the view render an empty
  // dashboard. Self-fetch sections handle their own empties.
  if (needsHealth && healthData && healthRepos.length === 0) {
    return (
      <Box sx={{ p: 4 }}>
        <EmptyStateGuide
          icon={<Compass size={28} />}
          title={t('warroom.noData')}
          description={t('warroom.noDataDesc')}
          primaryAction={orgId ? {
            label: t('warroom.runScan'),
            icon: <Play size={16} />,
            onClick: () => nav(`/projects/${orgId}/repos`),
          } : undefined}
        />
      </Box>
    )
  }

  // ── Render ───────────────────────────────────────────────────

  const ctx: SectionCtx = { orgId, orgData, repoNameMap, onNavigate }
  const view = def!.render(ctx)

  // bareLayout sections (ScoringView's 2-panel) manage their own
  // height + scroll. Everything else gets a height-100% wrapper.
  if (def!.bareLayout) {
    return <>{view}</>
  }

  return <Box sx={{ height: '100%', overflow: 'hidden' }}>{view}</Box>
}
