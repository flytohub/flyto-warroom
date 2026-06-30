// Shared constants, types, and helpers for the Red Team war-room.
// Split from RedTeamView.tsx (was 1191 LOC).

import type { PentestScan } from '@lib/engine'

// ── Scan-type colour taxonomy ─────────────────────────
//
// Values are design-token CSS variables (var(--flyto-*)), NOT raw hex.
// colorFor() returns a CSS color *string* (now a var() expression) so
// every call-site keeps working unchanged — sx `color`/`bgcolor` and
// the SVG stroke props all accept a var() string. Tokens auto-restrain
// on light mode via the design-tokens layer.

export const SCAN_TYPE_COLORS: Record<string, string> = {
  dast: 'var(--flyto-error)', sqli: 'var(--flyto-error)',
  xss: 'var(--flyto-orange-400)', ssrf: 'var(--flyto-orange-400)',
  idor: 'var(--flyto-purple-500)', rce: 'var(--flyto-error)',
  dns: 'var(--flyto-cyan-400)', ssl: 'var(--flyto-cyan-400)',
  whois: 'var(--flyto-text-tertiary)', waf: 'var(--flyto-purple-500)',
  tech: 'var(--flyto-success)', tls: 'var(--flyto-cyan-400)',
  discovery: 'var(--flyto-purple-500)', port: 'var(--flyto-orange-400)',
  subdomain: 'var(--flyto-cyan-400)', api: 'var(--flyto-cyan-400)',
  graphql: 'var(--flyto-pink-400)', pagespeed: 'var(--flyto-success)',
}

export function colorFor(scanType: string): string {
  const key = scanType.toLowerCase().replace(/_/g, '').split(/[-.]/).pop() || 'probe'
  for (const k of Object.keys(SCAN_TYPE_COLORS)) {
    if (key.includes(k)) return SCAN_TYPE_COLORS[k]
  }
  return 'var(--flyto-text-tertiary)'
}

export const SEVERITY_COLOR: Record<string, string> = {
  low: 'var(--flyto-text-tertiary)',
  medium: 'var(--flyto-orange-400)',
  high: 'var(--flyto-orange-400)',
  critical: 'var(--flyto-error)',
}

// ── Persistence model ─────────────────────────────────

export interface Campaign {
  projectId: string
  startedAt: number
  focusType?: string | null
}

export interface SavedState {
  activeId: string | null
  campaigns: Campaign[]
}

export const STORE_VERSION = 'v2'
// Merged log is bounded; UI only needs the recent window.
export const LOG_TAIL = 120

function storeKey(orgId?: string) { return orgId ? `flyto_redteam_${STORE_VERSION}_${orgId}` : null }
function legacyKey(orgId?: string) { return orgId ? `flyto_redteam_campaign_${orgId}` : null }

export function readSaved(orgId?: string): SavedState {
  const key = storeKey(orgId); if (!key) return { activeId: null, campaigns: [] }
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as SavedState
      // Expire campaigns older than 30 days.
      const fresh = parsed.campaigns.filter(c => Date.now() - c.startedAt < 30 * 86_400_000)
      return { activeId: parsed.activeId ?? fresh[0]?.projectId ?? null, campaigns: fresh }
    }
    // Migrate v1 (single-campaign) if present.
    const legacy = legacyKey(orgId)
    if (legacy) {
      const old = localStorage.getItem(legacy)
      if (old) {
        const parsed = JSON.parse(old) as Campaign
        localStorage.removeItem(legacy)
        if (parsed.projectId) {
          return { activeId: parsed.projectId, campaigns: [parsed] }
        }
      }
    }
  } catch { /* corrupted */ }
  return { activeId: null, campaigns: [] }
}

export function writeSaved(orgId: string, state: SavedState) {
  try { localStorage.setItem(storeKey(orgId)!, JSON.stringify(state)) } catch { /* private mode */ }
}

// ── Derived helpers ───────────────────────────────────

export interface LogLine { t: number; time: string; text: string; color: string }

interface PipelineLogPhase {
  phase: string
  status: string
  summary?: string
  error?: string
  evidence?: unknown[]
  tokensUsed?: { input?: number; output?: number }
}

interface PipelineLogInput {
  phases: PipelineLogPhase[]
  status: string
  preflight?: { ready?: boolean; message?: string; warnings?: string[] } | null
  error?: string | null
  evidenceCount?: number
  tokenCount?: number
  now?: number
}

export function buildLog(scans: PentestScan[]): LogLine[] {
  const out: LogLine[] = []
  const sorted = [...scans].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  for (const s of sorted) {
    const ts = new Date(s.created_at)
    const time = ts.toTimeString().slice(0, 8)
    const color = colorFor(s.scan_type)
    const label = s.scan_type.replace(/_/g, '-').padEnd(10).slice(0, 10)
    out.push({ t: ts.getTime(), time, color, text: `[run] ${label} dispatched` })
    if (['complete', 'completed', 'done'].includes(s.status)) {
      const findingsText = s.findings_count > 0
        ? `${s.findings_count} findings, ${s.critical_count} critical`
        : 'clean'
      const lineColor = s.critical_count > 0
        ? 'var(--rt-breach)'
        : s.findings_count > 0 ? 'var(--flyto-orange-400)' : 'var(--rt-ok)'
      out.push({ t: ts.getTime() + 1, time, color: lineColor, text: `[ok]  ${s.scan_type.slice(0, 10)} - ${findingsText}` })
      if (s.summary) {
        out.push({ t: ts.getTime() + 2, time, color: 'var(--flyto-text-tertiary)', text: `      ${s.summary.slice(0, 90)}` })
      }
    } else if (['failed', 'error'].includes(s.status)) {
      out.push({ t: ts.getTime() + 1, time, color: 'var(--flyto-orange-400)', text: `[err] ${s.scan_type.slice(0, 10)} failed` })
    } else if (['running', 'queued', 'pending'].includes(s.status)) {
      out.push({ t: ts.getTime() + 1, time, color: 'var(--rt-ready)', text: `[...] ${s.scan_type.slice(0, 10)} running` })
    }
  }
  return out.slice(-80)
}

export function buildPipelineLog(input: PipelineLogInput): LogLine[] {
  const base = input.now ?? Date.now()
  const out: LogLine[] = []
  const push = (offset: number, color: string, text: string) => {
    const t = base + offset
    const time = new Date(t).toTimeString().slice(0, 8)
    out.push({ t, time, color, text })
  }

  if (input.preflight) {
    if (input.preflight.ready === false) {
      push(0, 'var(--rt-warn)', `[hold] preflight blocked - ${trimLog(input.preflight.message || 'not ready')}`)
    } else {
      push(0, 'var(--rt-ok)', '[ok]  preflight ready')
    }
    for (const warning of input.preflight.warnings ?? []) {
      push(1 + out.length, 'var(--flyto-orange-400)', `[warn] ${trimLog(warning)}`)
    }
  }

  input.phases.forEach((phase, index) => {
    if (!phase || phase.status === 'pending') return
    const name = phase.phase.replace(/_/g, '-').padEnd(8).slice(0, 8)
    if (phase.status === 'running') {
      push(10 + index, 'var(--rt-ready)', `[...] ${name} running`)
    } else if (phase.status === 'done') {
      const evidence = phase.evidence?.length ?? 0
      const tokens = (phase.tokensUsed?.input ?? 0) + (phase.tokensUsed?.output ?? 0)
      push(20 + index, 'var(--rt-ok)', `[ok]  ${name} done · ${evidence} evidence · ${tokens} tok`)
      if (phase.summary) {
        push(30 + index, 'var(--flyto-text-tertiary)', `      ${trimLog(phase.summary)}`)
      }
    } else if (phase.status === 'skipped') {
      push(40 + index, 'var(--flyto-text-tertiary)', `[skip] ${name} skipped`)
    } else if (phase.status === 'error') {
      push(50 + index, 'var(--rt-breach)', `[err] ${name} ${trimLog(phase.error || 'failed')}`)
    }
  })

  if (input.status === 'running' && out.length === 0) {
    push(0, 'var(--rt-ready)', '[run] 5-phase pipeline accepted')
  }
  if (input.evidenceCount && input.evidenceCount > 0) {
    push(70, 'var(--rt-ok)', `[evi] campaign evidence captured · ${input.evidenceCount}`)
  }
  if (input.tokenCount && input.tokenCount > 0) {
    push(71, 'var(--rt-recon)', `[tok] AI analyst usage · ${input.tokenCount}`)
  }
  if (input.error && input.status !== 'running') {
    push(80, 'var(--rt-breach)', `[err] ${trimLog(input.error)}`)
  }

  return out.sort((a, b) => a.t - b.t).slice(-80)
}

export function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0'); const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function trimLog(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 110)
}

export function campaignStatus(scans: PentestScan[]): 'breach' | 'live' | 'ready' {
  const critical = scans.reduce((a, s) => a + s.critical_count, 0)
  if (critical > 0) return 'breach'
  const running = scans.some(s => ['running', 'queued', 'pending'].includes(s.status))
  if (running) return 'live'
  return 'ready'
}
