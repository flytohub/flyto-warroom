import type { FootprintRunRow } from './engine/code/footprintGraph'

export const FOOTPRINT_STALE_RUN_GRACE_MS = 5 * 60 * 1000
export const FOOTPRINT_DEFAULT_MAX_RUNTIME_SECS = 30 * 60

export function footprintRunDeadlineMs(run?: FootprintRunRow | null): number | null {
  if (!run?.started_at) return null
  const started = Date.parse(run.started_at)
  if (!Number.isFinite(started)) return null
  const runtimeSecs = run.max_runtime_secs && run.max_runtime_secs > 0
    ? run.max_runtime_secs
    : FOOTPRINT_DEFAULT_MAX_RUNTIME_SECS
  return started + runtimeSecs * 1000 + FOOTPRINT_STALE_RUN_GRACE_MS
}
export function isFootprintRunStale(run?: FootprintRunRow | null, nowMs = Date.now()): boolean {
  if (run?.status !== 'running') return false
  const deadline = footprintRunDeadlineMs(run)
  return deadline !== null && nowMs > deadline
}

export function isFootprintRunActive(run?: FootprintRunRow | null, nowMs = Date.now()): boolean {
  return run?.status === 'running' && !isFootprintRunStale(run, nowMs)
}
