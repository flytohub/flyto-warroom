/**
 * Red-team campaign as a 5-phase state machine.
 *
 * Baseline → Probe → Verify → Recheck → Report
 *
 * Each phase has a FIXED-SCHEMA output (`intel: T`). The next phase
 * ONLY sees that intel, never the raw round-by-round history. This
 * bounds context to ~200-500 tokens per LLM call regardless of
 * how much probing happened — eliminates the context-inflation
 * hallucination mode the linear planner suffered from.
 *
 * Why not include a 6th "attack" phase: exploitation raises legal /
 * trust / insurance issues the product doesn't want to carry today.
 * Impact Simulation (proving a confirmed finding IS exploitable
 * under controlled payloads but without data exfil) is the right
 * v2 phase — recorded here for design continuity.
 */

export type Phase =
  | 'baseline'   // recon only; never sends payloads
  | 'probe'      // scanner-style, sends safe probes, ranks suspects
  | 'verify'     // focused payload per suspect, confirms with evidence
  | 'recheck'    // re-fire confirmed findings with payload + session variance
  | 'report'     // compress + prioritise + exec summary
  // v2 — not wired in MVP:
  // | 'impact_simulation'

export const PHASE_ORDER: Phase[] = ['baseline', 'probe', 'verify', 'recheck', 'report']

/** Next phase, or null when the campaign is complete. */
export function nextPhase(p: Phase): Phase | null {
  const idx = PHASE_ORDER.indexOf(p)
  if (idx < 0 || idx === PHASE_ORDER.length - 1) return null
  return PHASE_ORDER[idx + 1]
}

// ── Evidence (common across phases) ─────────────────────────────────

/** A single observable datapoint that backs a suspect / finding. */
export interface Evidence {
  url: string
  method: string
  status?: number
  timingMs?: number
  /** Short (≤300 char) response snippet that captures the signal. */
  snippet?: string
  /** When the probe used a custom payload, it's recorded here so the
   *  recheck phase can synthesize variations. */
  payload?: string
  /** Execution id (`campaign_executions.id`) the probe came from —
   *  lets the report link back to the dispatch record. */
  executionId?: string
}

// ── Intel schemas, phase by phase ───────────────────────────────────

export interface BaselineIntel {
  targetUrl: string
  /** Detected tech — user-facing framework names only, not versions. */
  tech: string[]
  /** Endpoints discovered by passive recon (sitemap, robots, OPTIONS
   *  responses, HEAD scans). No fuzzing here. */
  endpoints: string[]
  /** Paths smelling like authentication (/login, /oauth, /session). */
  authSurface: string[]
  envType: 'static' | 'dynamic-js' | 'spa' | 'api' | 'unknown'
  hasWAF: boolean
  wafSignature?: string
  /** Free-text one-liner for UI ("Express + MongoDB API behind Cloudflare"). */
  topology: string
}

export interface Suspect {
  id: string
  class: string            // category from flyto-ai's blueprint catalogue
  endpoint: string
  parameter?: string
  /** WHY we suspect — signals extracted from baseline + light probes. */
  signal: string
  /** 0-1; high-confidence ones go straight to verify, low can be dropped. */
  confidence: number
}

export interface ProbeIntel {
  suspects: Suspect[]
  /** Categories we actively tested but saw nothing — lets recheck /
   *  report honestly say "we checked A, B, C and they were clean". */
  testedCategoriesClean: string[]
}

export interface ConfirmedFinding {
  id: string
  class: string
  endpoint: string
  parameter?: string
  /** The payload that triggered the signal. */
  proofPayload: string
  /** Server response snippet that proves the finding (e.g. SQL error). */
  responseSnippet: string
  /** 0-1 confidence after verify phase — still not proven against
   *  false positives; recheck phase handles that. */
  confidence: number
  evidence: Evidence[]
}

export interface VerifyIntel {
  confirmed: ConfirmedFinding[]
  rejected: Array<{
    suspectId: string
    reason: string
  }>
}

export interface ProvenFinding extends ConfirmedFinding {
  /** Independent evidence across payload + session variance. */
  repro: Evidence[]
  /** True when signal survives clearing cookies / Authorization headers. */
  sessionIndependent: boolean
  /** True when signal survives payload mutations (not just one lucky string). */
  payloadIndependent: boolean
  /** Final post-recheck confidence 0-1. */
  strength: number
}

export interface RecheckIntel {
  proven: ProvenFinding[]
  flaky: Array<{
    finding: ConfirmedFinding
    reason: string   // "payload-specific" / "session-dependent" / "timing-flaky"
  }>
}

export interface ReportIntel {
  priorities: Array<{
    findingId: string
    class: string
    endpoint: string
    rationale: string      // one-line "why it matters"
    businessImpact: string // plain-English consequence
    fixBucket: 'this_week' | 'this_sprint' | 'backlog'
    chainHint?: string     // how this might combine with another finding
  }>
  executiveSummary: string   // markdown
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  totals: {
    suspects: number
    confirmed: number
    rejected: number
    proven: number
    flaky: number
  }
}

// ── Phase result envelope ───────────────────────────────────────────

export type IntelFor<P extends Phase> =
  P extends 'baseline' ? BaselineIntel :
  P extends 'probe' ? ProbeIntel :
  P extends 'verify' ? VerifyIntel :
  P extends 'recheck' ? RecheckIntel :
  P extends 'report' ? ReportIntel :
  never

export interface PhaseResult<P extends Phase = Phase> {
  phase: P
  /** 1-2 sentences, rendered verbatim in the UI's phase timeline. */
  summary: string
  intel: IntelFor<P>
  /** Raw evidence captured during the phase — persisted per-phase,
   *  NOT fed into the next phase's prompt. Keeps context bounded. */
  evidence: Evidence[]
  /** Controls the state machine:
   *   - continue: advance to next phase
   *   - stop:     terminate campaign cleanly (e.g. probe found nothing)
   *   - escalate: skip a phase because something worth flagging
   *               immediately (not common — future-proofing)
   *   - report:   jump straight to report phase */
  nextAction: 'continue' | 'stop' | 'escalate' | 'report'
  /** 0-1 aggregate confidence for the phase. */
  confidence: number
  tokensUsed: { input: number; output: number }
  durationMs: number
}

// ── Phase → model mapping ───────────────────────────────────────────

/**
 * Per-phase LLM model override. Recon / scanning phases burn lots of
 * prompt tokens on structured input and don't need deep reasoning —
 * gpt-4o-mini handles them. Verify / recheck / report require
 * careful judgement and get the larger model.
 *
 * Empirically saves 40-60% on per-campaign cost vs. using gpt-4o for
 * everything, with no drop in finding quality at the report layer.
 */
export const PHASE_MODELS: Record<Phase, string> = {
  baseline: 'gpt-4o-mini',
  probe:    'gpt-4o-mini',
  verify:   'gpt-4o',
  recheck:  'gpt-4o',
  report:   'gpt-4o',
}
