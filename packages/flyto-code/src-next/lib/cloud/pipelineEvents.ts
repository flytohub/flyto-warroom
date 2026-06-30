/**
 * Tiny module-level pub/sub for pipeline SSE events.
 *
 * Why exists:
 *   useOrgEvents is mounted once at WorkspacePage root and pushes
 *   updates into React Query via invalidateQueries. The pipeline
 *   hook (useCampaignPipeline) doesn't yet use React Query (it has
 *   its own imperative state machine), so the SSE bridge needs a
 *   different conduit. This file is that conduit.
 *
 * Once the orchestrator moves engine-side (Phase C) and the hook
 * becomes a thin observer over React Query, this can collapse into
 * a normal queryClient.setQueryData() flow and we'll delete the file.
 *
 * Why not window CustomEvent: same-origin window events propagate
 * across iframes and could confuse tooling (Sentry, devtools). A
 * plain ref-counted listener set is enough for in-process delivery
 * and adds no global mutation.
 */

export type PipelineEventType =
  | 'pipeline_run.created'
  | 'pipeline_run.phase'
  | 'pipeline_run.evidence'
  | 'pipeline_run.finalized'

export interface PipelineEvent {
  type: PipelineEventType
  /** Org id the event belongs to. Listeners filter on this. */
  orgId: string
  /** Decoded payload from the SSE frame. Shape depends on type. */
  payload: Record<string, unknown>
}

type Listener = (e: PipelineEvent) => void
const listeners = new Set<Listener>()

/** Subscribe; returns an unsubscribe function. Safe to call from
 *  React effects — the cleanup return mirrors the pattern. */
export function subscribePipelineEvents(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Emit synchronously to all subscribers. Errors in one listener
 *  must not stop the rest — wrap each in try/catch. */
export function emitPipelineEvent(e: PipelineEvent): void {
  for (const fn of listeners) {
    try { fn(e) }
    catch (err) {
      if (import.meta.env.DEV) {
         
        console.warn('[pipeline-events] listener threw:', err)
      }
    }
  }
}
