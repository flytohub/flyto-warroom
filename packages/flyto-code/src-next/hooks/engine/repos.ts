/**
 * hooks/engine/repos.ts — typed react-query hooks for the repos domain.
 *
 * This is the worked example of the target API architecture (arch Phase 2):
 * components call THESE hooks, never `useQuery` with an inline literal key or
 * a raw engine fetcher. Each hook owns its `qk.repos.*` key (so reads and the
 * useOrgEvents invalidations stay in sync) and its data type is inferred from
 * the underlying lib/engine fetcher — no hand-maintained generics.
 *
 * Mutations centralise their cache invalidation here (via the same qk keys),
 * so a component just calls `.mutate()` and the right queries refresh.
 *
 * Only fetchers that actually exist in lib/engine/code/repos.ts are wrapped;
 * the domain grows as more reads/mutations move onto the factory.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '@lib/queryKeys'
import {
  listRepoScans, getRepoProfile, getFixPlan,
  getOrgHealthSummary, triggerScan, cancelScan,
} from '@lib/engine/code/repos'

// NOTE: useConnectedRepos lives in hooks/useOrg.ts (key-migrated to
// qk.repos.connected); not duplicated here.

// ── Reads ────────────────────────────────────────────────────────

export function useOrgHealthSummary(orgId: string | undefined) {
  return useQuery({
    queryKey: qk.repos.healthSummary(orgId),
    queryFn: () => getOrgHealthSummary(orgId!),
    enabled: !!orgId,
  })
}

export function useRepoScans(repoId: string | undefined) {
  return useQuery({
    queryKey: qk.repos.scans(repoId),
    queryFn: () => listRepoScans(repoId!),
    enabled: !!repoId,
    refetchOnMount: 'always',
  })
}

export function useRepoProfile(repoId: string | undefined) {
  return useQuery({
    queryKey: qk.repos.profile(repoId),
    queryFn: () => getRepoProfile(repoId!),
    enabled: !!repoId,
    staleTime: 5 * 60_000,
  })
}

export function useFixPlan(repoId: string | undefined) {
  return useQuery({
    queryKey: qk.repos.fixPlan(repoId),
    queryFn: () => getFixPlan(repoId!),
    enabled: !!repoId,
  })
}

// ── Mutations (own their invalidation) ───────────────────────────

/** Trigger a scan; refreshes that repo's scans + health + profile. */
export function useTriggerScan(repoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => triggerScan(repoId!, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.repos.scans(repoId) })
      qc.invalidateQueries({ queryKey: qk.repos.health(repoId) })
      qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) })
    },
  })
}

export function useCancelScan(repoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scanId: string) => cancelScan(scanId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.repos.scans(repoId) }),
  })
}

