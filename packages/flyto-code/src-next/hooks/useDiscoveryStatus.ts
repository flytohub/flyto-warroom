/**
 * useDiscoveryStatus — tracks which pentest projects have active
 * discoveries.
 *
 * Three signal sources, in priority order:
 *
 *   1. /discoveries/active fetched on mount (and as polling fallback)
 *      — authoritative server snapshot. Survives SSE reconnects and
 *      pod restarts.
 *   2. SSE discovery events (started/step/complete) — instant updates
 *      while the stream is up.
 *   3. Manual hints from cancel/start mutations.
 *
 * Module-level state so multiple components share the same set
 * without prop-drilling. useSyncExternalStore re-renders consumers
 * when the set changes.
 *
 * 2026-05-23 operator fix:
 *   - "進到頁面先確認是不是在卡掃描中" → useDiscoverySeed(orgId)
 *     hits /discoveries/active on mount.
 *   - "要有取消功能" → cancelDiscovery(orgId, projectId).
 *   - "不卡在那" → SSE complete or 30s poll fallback clears the set.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { request } from '@lib/engine/client'
import { qk } from '@lib/queryKeys'

// ── module-level state ──────────────────────────────────────────────

const scanning = new Set<string>()
let scanningSnapshot: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()
// Last server snapshot so consumers can render "started Ys ago" etc.
let lastServerSnapshot: ActiveDiscoveryRow[] = []

function notify() {
  for (const fn of listeners) fn()
}

function publishSnapshot() {
  // useSyncExternalStore compares snapshots with Object.is. Returning the
  // same mutable Set after in-place edits can suppress React re-renders, so
  // publish an immutable copy every time the store changes.
  scanningSnapshot = new Set(scanning)
  notify()
}

export interface ActiveDiscoveryRow {
  project_id: string
  target: string
  started_at: string
  elapsed_sec: number
}

export function markDiscoveryStarted(projectId: string) {
  if (!projectId || scanning.has(projectId)) return
  scanning.add(projectId)
  publishSnapshot()
}
export function markDiscoveryStep(projectId: string) {
  markDiscoveryStarted(projectId)
}
export function markDiscoveryComplete(projectId: string) {
  if (!projectId || !scanning.delete(projectId)) return
  publishSnapshot()
}

// Server seed — replaces the entire scanning set with what the
// backend reports. Called by useDiscoverySeed below.
export function seedScanningFromServer(rows: ActiveDiscoveryRow[]) {
  lastServerSnapshot = rows ?? []
  const next = new Set(lastServerSnapshot.map((r) => r.project_id))
  // Diff to avoid spurious notifies when the set is identical.
  let changed = next.size !== scanning.size
  if (!changed) {
    for (const id of next) if (!scanning.has(id)) { changed = true; break }
  }
  if (changed) {
    scanning.clear()
    for (const id of next) scanning.add(id)
  }
  // Always publish a fresh snapshot so elapsed metadata and server rows
  // stay live even when the set membership is unchanged.
  publishSnapshot()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
function getSnapshot(): ReadonlySet<string> {
  return scanningSnapshot
}

// ── primary consumer hook ───────────────────────────────────────────

export function useDiscoveryStatus() {
  const set = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    scanningSet: set,
    isScanning: (projectId: string) => set.has(projectId),
    scanningCount: set.size,
    serverRows: lastServerSnapshot,
  }
}

// ── server-side seed + polling fallback ─────────────────────────────

/**
 * useDiscoverySeed — call ONCE near the top of any page that
 * cares about scan state (Domains, Pentest, Dashboard). Hits
 * /discoveries/active on mount + every 30s as a fallback for
 * SSE drops. When the server says "nothing active", the local
 * "scanning" set clears — operator stops seeing the stuck chip.
 */
export function useDiscoverySeed(orgId: string | undefined) {
  const { data } = useQuery({
    queryKey: qk.exposure.discoveriesActive(orgId),
    queryFn: async () => {
      if (!orgId) return { active: [] as ActiveDiscoveryRow[] }
      return request<{ active: ActiveDiscoveryRow[]; count: number }>(
        'GET', `/api/v1/code/orgs/${orgId}/discoveries/active`,
      )
    },
    enabled: !!orgId,
    // Poll every 30s as fallback for missed SSE events. Cheap
    // endpoint (in-memory map walk).
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  })
  useEffect(() => {
    seedScanningFromServer(data?.active ?? [])
  }, [data])
}

/**
 * useCancelDiscovery — mutation hook for the "✕ 取消" button.
 * On success, clears the project from the local set immediately
 * (don't wait for SSE) so the chip disappears.
 */
export function useCancelDiscovery(orgId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      if (!orgId) throw new Error('missing org id')
      return request<{ cancelled: boolean }>(
        'POST', `/api/v1/code/orgs/${orgId}/discoveries/${projectId}/cancel`,
      )
    },
    onSuccess: (_data, projectId) => {
      markDiscoveryComplete(projectId)
      // Re-fetch active so the rest of the page state stays consistent.
      qc.invalidateQueries({ queryKey: qk.exposure.discoveriesActive(orgId) })
    },
  })
}
