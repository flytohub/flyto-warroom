/**
 * useCampaignPipeline — observer-only React hook for the engine-side
 * 5-phase red team pipeline (Phase C cut-over).
 *
 * The browser is NO LONGER the orchestrator. start() asks the engine
 * to spawn a goroutine, then this hook subscribes to:
 *   - localStorage (immediate, sub-frame UX)
 *   - GET /pipeline/runs/{id} snapshot (authoritative server state)
 *   - SSE pipeline_run.* events (live updates while the orchestrator runs)
 *
 * Browser-tab close: pipeline keeps running on the engine, you'll see
 * its final state next time you load the workspace.
 *
 * stop() is now a server-side cancel — the engine's goroutine sees the
 * flag at the next checkpoint and writes the 'stopped' final state.
 *
 * The five phases:
 *   Baseline → Probe → Verify → Recheck → Report
 *
 * Each phase has structured intel that the next phase consumes, so
 * context stays bounded (~700 tokens/call) regardless of how much
 * runner activity happened.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type Phase, PHASE_ORDER,
  type Evidence, type ReportIntel,
} from '@lib/cloud/phases'
import {
  createPipelineRun, stopPipelineRun as engineStopRun,
  retestPipelineRun as engineRetestRun,
  getActivePipelineForCampaign, getPipelineRun, getRedTeamPreflight,
  type PipelineSnapshot, type RedTeamPreflightResponse,
} from '@lib/engine/pipelineLog'
import { EngineRequestError } from '@lib/engine/client'
import { subscribePipelineEvents } from '@lib/cloud/pipelineEvents'

// ── Types ───────────────────────────────────────────────────────────

export type PhaseStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'

export interface PhaseState {
  phase: Phase
  status: PhaseStatus
  summary?: string
  intel?: unknown
  evidence: Evidence[]
  tokensUsed: { input: number; output: number }
  durationMs: number
  error?: string
}

export type CampaignStatus =
  | 'idle'
  | 'running'
  | 'complete'
  | 'stopped'
  | 'blocked'
  | 'error'
  | 'orphaned'   // engine restarted while run was in flight

export interface UseCampaignPipelineOpts {
  orgId?: string | null
}

export interface StartArgs {
  projectId: string
  targetUrl: string
  /** Pentest project's stored config blob (preserved for compat;
   *  engine reads auth/scope from its own DB). */
  projectConfig?: string
  environment?: string
}

export interface CampaignPipelineStartResult {
  started: boolean
  status: CampaignStatus
  runId?: string
  preflight?: RedTeamPreflightResponse
  error?: string
}

// ── Persistence (localStorage cache, server is authoritative) ───────
//
// We still keep a thin localStorage cache so reopening a tab paints
// last-known phases instantly while the engine snapshot fetch is in
// flight. Server data wins on conflict.

export interface PersistedCampaign {
  schema: 1
  projectId: string
  targetUrl: string
  startedAt: number
  status: CampaignStatus
  phases: PhaseState[]
  evidence: Evidence[]
  report?: ReportIntel
  runId?: string
  error?: string
  preflight?: RedTeamPreflightResponse
}

const STORAGE_PREFIX = 'flyto_pipeline_v1'

// Exported for unit tests — every pure helper below is unit-tested in
// useCampaignPipeline.helpers.test.ts. The hook itself uses them as
// private helpers; nothing outside the hook + its tests should import
// them.
export function storageKey(orgId: string, projectId: string): string {
  return `${STORAGE_PREFIX}:${orgId}:${projectId}`
}

export function load(orgId: string, projectId: string): PersistedCampaign | null {
  try {
    const raw = localStorage.getItem(storageKey(orgId, projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedCampaign
    return parsed.schema === 1 ? parsed : null
  } catch {
    return null
  }
}

export function save(orgId: string, projectId: string, c: PersistedCampaign) {
  try {
    localStorage.setItem(storageKey(orgId, projectId), JSON.stringify(c))
  } catch {
    /* quota / private mode — degrade silently */
  }
}

export function dropPersisted(orgId: string, projectId: string) {
  try {
    localStorage.removeItem(storageKey(orgId, projectId))
  } catch { /* noop */ }
}

// ── Initial phase state ─────────────────────────────────────────────

export function emptyPhases(): PhaseState[] {
  return PHASE_ORDER.map(p => ({
    phase: p,
    status: 'pending' as PhaseStatus,
    evidence: [],
    tokensUsed: { input: 0, output: 0 },
    durationMs: 0,
  }))
}

export function safeParse(s: string | undefined | null): unknown {
  if (!s) return undefined
  try { return JSON.parse(s) } catch { return undefined }
}

// snapshotToHookState — flatten a server snapshot into the hook's
// internal state shape. Phase ordering is enforced by re-keying on
// PHASE_ORDER so we don't depend on insertion order.
export function snapshotToHookState(snap: PipelineSnapshot): {
  runId: string
  projectId: string
  targetUrl: string
  status: CampaignStatus
  phases: PhaseState[]
  evidence: Evidence[]
  report: ReportIntel | null
  error: string | null
} {
  if (!snap.run) {
    throw new Error('snapshotToHookState: run is null (caller must guard)')
  }
  const byPhase = new Map<string, typeof snap.phases[number]>()
  for (const p of snap.phases) byPhase.set(p.phase, p)

  const phases: PhaseState[] = PHASE_ORDER.map(p => {
    const row = byPhase.get(p)
    if (!row) {
      return { phase: p, status: 'pending', evidence: [], tokensUsed: { input: 0, output: 0 }, durationMs: 0 }
    }
    const status = (row.status as PhaseStatus) ?? 'pending'
    const phaseEvidence: Evidence[] = snap.evidence
      .filter(e => e.phase === p)
      .map(e => ({
        url: e.url,
        method: e.method,
        status: e.statusCode ?? undefined,
        timingMs: e.timingMs ?? undefined,
        snippet: e.snippet ?? undefined,
        payload: e.payload ?? undefined,
        executionId: e.executionId ?? undefined,
      }))
    return {
      phase: p,
      status,
      summary: row.summary,
      intel: safeParse(row.intelJson),
      evidence: phaseEvidence,
      tokensUsed: { input: row.inputTokens, output: row.outputTokens },
      durationMs: row.durationMs,
      error: row.errorMessage ?? undefined,
    }
  })

  const allEvidence: Evidence[] = snap.evidence.map(e => ({
    url: e.url,
    method: e.method,
    status: e.statusCode ?? undefined,
    timingMs: e.timingMs ?? undefined,
    snippet: e.snippet ?? undefined,
    payload: e.payload ?? undefined,
    executionId: e.executionId ?? undefined,
  }))

  const reportRow = byPhase.get('report')
  const report = (reportRow && reportRow.status === 'done')
    ? (safeParse(reportRow.intelJson) as ReportIntel | null) ?? null
    : null

  // Map engine status → CampaignStatus literal.
  const statusMap: Record<string, CampaignStatus> = {
    running:  'running',
    complete: 'complete',
    stopped:  'stopped',
    error:    'error',
    orphaned: 'orphaned',
  }
  const status = statusMap[snap.run.status] ?? 'idle'

  return {
    runId: snap.run.id,
    projectId: snap.run.campaignId,
    targetUrl: snap.run.targetUrl,
    status,
    phases,
    evidence: allEvidence,
    report,
    error: snap.run.errorMessage ?? null,
  }
}

function preflightFromEngineError(err: unknown): RedTeamPreflightResponse | null {
  if (!(err instanceof EngineRequestError) || err.status !== 409) return null
  const body = err.body as { preflight?: RedTeamPreflightResponse } | null
  return body?.preflight ?? null
}

function startErrorMessage(err: unknown): string {
  if (err instanceof EngineRequestError && err.status === 404) {
    return 'Red-team preflight is unavailable on the connected engine. Restart flyto-engine with the latest build before starting this campaign.'
  }
  return err instanceof Error ? err.message : String(err)
}

// ── Hook ────────────────────────────────────────────────────────────

export function useCampaignPipeline(opts: UseCampaignPipelineOpts = {}) {
  const { orgId } = opts

  const [status, setStatus] = useState<CampaignStatus>('idle')
  const [target, setTarget] = useState<StartArgs | null>(null)
  const [phases, setPhases] = useState<PhaseState[]>(emptyPhases)
  const [report, setReport] = useState<ReportIntel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [allEvidence, setAllEvidence] = useState<Evidence[]>([])
  const [preflight, setPreflight] = useState<RedTeamPreflightResponse | null>(null)

  // Mirror current state into a ref so the periodic localStorage save
  // can read it without re-running the effect on every keystroke.
  const snapshotRef = useRef({
    target: null as StartArgs | null,
    phases: emptyPhases(),
    status: 'idle' as CampaignStatus,
    report: null as ReportIntel | null,
    evidence: [] as Evidence[],
    error: null as string | null,
    preflight: null as RedTeamPreflightResponse | null,
  })
  // Engine-side run id. Set on start() AND on snapshot hydrate so the
  // SSE listener can match incoming events to "our" run.
  const runIdRef = useRef<string | null>(null)
  // Stale-response guard for the hydrate fetch — see load() below.
  const hydrateProjectRef = useRef<string | null>(null)

  useEffect(() => {
    snapshotRef.current = {
      target, phases, status,
      report, evidence: allEvidence,
      error, preflight,
    }
  }, [target, phases, status, report, allEvidence, error, preflight])

  // localStorage cache (debounced 250ms). Server snapshot is the
  // authoritative source — this only buys instant-paint on tab reopen.
  useEffect(() => {
    if (!orgId || !target) return
    const id = setTimeout(() => {
      save(orgId, target.projectId, {
        schema: 1,
        projectId: target.projectId,
        targetUrl: target.targetUrl,
        startedAt: Date.now(),
        status: snapshotRef.current.status,
        phases: snapshotRef.current.phases,
        evidence: snapshotRef.current.evidence,
        report: snapshotRef.current.report ?? undefined,
        error: snapshotRef.current.error ?? undefined,
        preflight: snapshotRef.current.preflight ?? undefined,
        runId: runIdRef.current ?? undefined,
      })
    }, 250)
    return () => clearTimeout(id)
  }, [orgId, target, phases, status, report, allEvidence, error, preflight])

  /**
   * Start a new campaign. Asks the engine to spawn the orchestrator;
   * the rest of the pipeline run is driven server-side. The hook
   * surfaces progress via the snapshot fetch + SSE bridge.
   */
  const start = useCallback(async (args: StartArgs) => {
    if (!orgId) {
      setError('No org id; sign-in required')
      setStatus('error')
      return { started: false, status: 'error', error: 'No org id; sign-in required' } satisfies CampaignPipelineStartResult
    }
    dropPersisted(orgId, args.projectId)
    runIdRef.current = null
    setTarget(args)
    setPhases(emptyPhases())
    setReport(null)
    setError(null)
    setAllEvidence([])
    setPreflight(null)
    setStatus('idle')

    try {
      const readiness = await getRedTeamPreflight(orgId, {
        campaignId: args.projectId,
        targetUrl: args.targetUrl,
      })
      setPreflight(readiness)
      if (!readiness.ready) {
        setError(readiness.message || 'Red-team campaign preflight failed.')
        setStatus('blocked')
        return { started: false, status: 'blocked', preflight: readiness, error: readiness.message } satisfies CampaignPipelineStartResult
      }

      setStatus('running')
      const handle = await createPipelineRun({
        org_id: orgId,
        campaign_id: args.projectId,
        pentest_id: args.projectId,
        target_url: args.targetUrl,
      })
      runIdRef.current = handle.run_id
      let resultStatus: CampaignStatus = 'running'
      // Always hydrate by run id after start/resume. A fast terminal
      // failure can leave the active set before a campaign-level lookup
      // catches it, but /pipeline/runs/{id} remains authoritative.
      try {
        const snap = await getPipelineRun(handle.run_id)
        if (snap.run) {
          const merged = snapshotToHookState(snap)
          setPhases(merged.phases)
          setReport(merged.report)
          setAllEvidence(merged.evidence)
          setError(merged.error)
          setStatus(merged.status)
          resultStatus = merged.status
        }
      } catch {
        /* SSE / later hydrate will retry */
      }
      return { started: true, status: resultStatus, runId: handle.run_id, preflight: readiness } satisfies CampaignPipelineStartResult
    } catch (e) {
      const blocked = preflightFromEngineError(e)
      if (blocked) {
        setPreflight(blocked)
        setError(blocked.message || (e instanceof Error ? e.message : 'Red-team campaign preflight failed.'))
        setStatus('blocked')
        return { started: false, status: 'blocked', preflight: blocked, error: blocked.message } satisfies CampaignPipelineStartResult
      }
      const msg = startErrorMessage(e)
      setError(msg)
      setStatus('error')
      return { started: false, status: 'error', error: msg } satisfies CampaignPipelineStartResult
    }
  }, [orgId])

  /**
   * Soft-cancel — the engine goroutine notices the flag at the next
   * phase boundary and writes a 'stopped' final state. UI optimistically
   * flips to 'stopped' immediately; SSE will confirm.
   */
  const stop = useCallback(async () => {
    const runId = runIdRef.current
    if (!runId) {
      setStatus('stopped')
      return
    }
    try {
      await engineStopRun(runId)
      setStatus('stopped')
    } catch (e) {
      if (import.meta.env.DEV) {
         
        console.warn('[pipeline] stop failed:', e)
      }
    }
  }, [])

  /**
   * Re-fire prior proven findings against the (now-presumably-fixed)
   * target. The engine spawns a variant orchestrator that skips
   * baseline+probe and produces a Before/After report. UI flips to
   * 'running' once the new run takes; the caller's tab will see
   * progress via SSE just like a normal start().
   */
  const retest = useCallback(async () => {
    const runId = runIdRef.current
    if (!runId) {
      throw new Error('no completed run to retest')
    }
    try {
      const handle = await engineRetestRun(runId)
      runIdRef.current = handle.run_id
      setPreflight(null)
      setError(null)
      setReport(null)
      setAllEvidence([])
      setPhases(emptyPhases())
      setStatus('running')
      return handle
    } catch (e) {
      const blocked = preflightFromEngineError(e)
      if (blocked) {
        setPreflight(blocked)
        setError(blocked.message || (e instanceof Error ? e.message : 'Red-team campaign preflight failed.'))
        setStatus('blocked')
      }
      throw e
    }
  }, [])

  /** Wipe the current campaign + cached state. */
  const reset = useCallback(() => {
    if (orgId && target) dropPersisted(orgId, target.projectId)
    runIdRef.current = null
    setTarget(null)
    setPhases(emptyPhases())
    setReport(null)
    setError(null)
    setPreflight(null)
    setAllEvidence([])
    setStatus('idle')
  }, [orgId, target])

  /**
   * Hydrate when switching to a project tab. Two layers:
   *   1. localStorage — synchronous, last 250ms write
   *   2. engine GET /pipeline/runs — authoritative
   * Engine wins ties (it has more progress when the orchestrator has
   * advanced past what was last persisted client-side).
   */
  const loadProject = useCallback((projectId: string): boolean => {
    if (!orgId) return false
    const stored = load(orgId, projectId)
    let hydrated = false
    if (stored) {
      setTarget({
        projectId: stored.projectId,
        targetUrl: stored.targetUrl,
      })
      setPhases(stored.phases)
      setReport(stored.report ?? null)
      setError(stored.error ?? null)
      setPreflight(stored.preflight ?? null)
      setAllEvidence(stored.evidence)
      setStatus(stored.status)
      runIdRef.current = stored.runId ?? null
      hydrated = true
    } else {
      runIdRef.current = null
      setTarget(null)
      setPhases(emptyPhases())
      setReport(null)
      setError(null)
      setPreflight(null)
      setAllEvidence([])
      setStatus('idle')
    }

    hydrateProjectRef.current = projectId
    void getActivePipelineForCampaign(projectId)
      .then(snap => {
        if (hydrateProjectRef.current !== projectId) return
        if (!snap.run) return
        const merged = snapshotToHookState(snap)
        const engineProgress = merged.phases.filter(p => p.status !== 'pending').length
        const localProgress = stored
          ? stored.phases.filter(p => p.status !== 'pending').length
          : 0
        if (engineProgress < localProgress) return
        runIdRef.current = merged.runId
        setTarget({ projectId: merged.projectId, targetUrl: merged.targetUrl })
        setPhases(merged.phases)
        setReport(merged.report)
        setError(merged.error)
        setPreflight(null)
        setAllEvidence(merged.evidence)
        setStatus(merged.status)
      })
      .catch(() => { /* offline / 404 — localStorage stands */ })

    return hydrated
  }, [orgId])

  // SSE bridge — refetch the snapshot when the engine emits a
  // pipeline event for our active run. Debounced because evidence
  // events fire densely during a hot phase.
  useEffect(() => {
    if (!orgId) return
    let timer: ReturnType<typeof setTimeout> | null = null

    const refetch = async () => {
      timer = null
      const t = snapshotRef.current.target
      if (!t) return
      try {
        const snap = runIdRef.current
          ? await getPipelineRun(runIdRef.current)
          : await getActivePipelineForCampaign(t.projectId)
        if (!snap.run) return
        if (runIdRef.current && snap.run.id !== runIdRef.current) return
        const merged = snapshotToHookState(snap)
        runIdRef.current = merged.runId
        setPhases(merged.phases)
        setReport(merged.report)
        setError(merged.error)
        setPreflight(null)
        setAllEvidence(merged.evidence)
        setStatus(merged.status)
      } catch { /* offline / 404 — leave state alone */ }
    }

    const unsubscribe = subscribePipelineEvents(e => {
      if (e.orgId !== orgId) return
      const eventRunId = (e.payload as { run_id?: string }).run_id
      // Filter to our own run id when we know it; if we don't (e.g.
      // hydrate hasn't completed), accept any event for the org.
      if (runIdRef.current && eventRunId && eventRunId !== runIdRef.current) {
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(refetch, 600)
    })

    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [orgId])

  // Derived state.
  const currentPhase: Phase | null = (() => {
    const running = phases.find(p => p.status === 'running')
    if (running) return running.phase
    const done = [...phases].reverse().find(p => p.status === 'done')
    return done ? done.phase : null
  })()

  const totalTokens = phases.reduce(
    (acc, p) => ({
      input: acc.input + p.tokensUsed.input,
      output: acc.output + p.tokensUsed.output,
    }),
    { input: 0, output: 0 },
  )

  // Verify-phase evidence chain. The engine auto-ingests a completed pentest
  // scan's findings into the campaign evidence chain (it emits
  // `pipeline_run.evidence` with source:"pentest_scan"), and those rows land on
  // the verify / recheck phases — the phases that prove a finding. Surfacing
  // them here lets the Findings drill-down reflect ingested pentest evidence,
  // not just orchestrator-emitted evidence. The campaign_pipeline_evidence row
  // has no `source` column, so we key on phase (the BE writes ingested findings
  // under verify/recheck) rather than fabricating a provenance flag we don't
  // actually have from the snapshot.
  const verifyEvidence: Evidence[] = phases
    .filter(p => p.phase === 'verify' || p.phase === 'recheck')
    .flatMap(p => p.evidence)

  return {
    status,
    target,
    phases,
    currentPhase,
    report,
    error,
    preflight,
    allEvidence,
    /** Evidence captured during the verify + recheck phases — includes the
     *  pentest-scan findings the engine auto-ingests into the campaign
     *  evidence chain. Drives the verify-phase findings drill-down. */
    verifyEvidence,
    totalTokens,
    /** Engine-side run id; null until start() / load() resolves. */
    runId: runIdRef.current,
    isRunning: status === 'running',
    isComplete: status === 'complete',
    isBreached: report?.riskLevel === 'CRITICAL' || report?.riskLevel === 'HIGH',
    start,
    stop,
    retest,
    reset,
    load: loadProject,
  }
}
