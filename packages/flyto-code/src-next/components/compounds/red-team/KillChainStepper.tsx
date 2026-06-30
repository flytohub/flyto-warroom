/**
 * KillChainStepper — the at-a-glance attack-path band.
 *
 * Five nodes (recon → exploit → verify → remediate → rescore) mapped
 * onto the REAL engine pipeline. NO new fetch: every signal is derived
 * from state the parent already holds (pipeline.phases / currentPhase /
 * report / allEvidence, stats, activeScans). The CampaignPipelinePanel
 * remains the detailed 5-phase timeline; this is the lit-up mirror.
 *
 * Honesty note (reflects the backend audit): the REMEDIATE node carries
 * a tooltip making explicit that infra/pentest findings are remediated
 * *outside* the AutoFix loop — the engine's auto-fix doesn't cover this
 * island. We light the node from `pipeline.report` presence (fix buckets
 * exist) but never imply a one-click fix that doesn't exist.
 */

import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import {
  Radar, Swords, ShieldCheck, Wrench, Gauge, type LucideIcon,
} from 'lucide-react'
import { tOr } from '@lib/i18n'
import type { PhaseState } from '@hooks/useCampaignPipeline'
import styles from './RedTeamView.module.css'

export type NodeState = 'pending' | 'running' | 'done' | 'breach'

export interface KillChainInputs {
  empty: boolean
  loading: boolean
  currentPhase: string | null
  phases: PhaseState[]
  hasReport: boolean
  evidenceCount: number
  activeScanCount: number
  running: number
  complete: number
  critical: number
}

interface NodeDef {
  key: 'recon' | 'exploit' | 'verify' | 'remediate' | 'rescore'
  icon: LucideIcon
  labelKey: string
  fallback: string
  /** Maps onto these engine PHASE_ORDER phases for the "running" hint. */
  phaseRunning?: string[]
  note?: { key: string; fallback: string }
}

const NODES: NodeDef[] = [
  { key: 'recon', icon: Radar, labelKey: 'warroom.killChain.recon', fallback: 'RECON', phaseRunning: ['baseline'] },
  { key: 'exploit', icon: Swords, labelKey: 'warroom.killChain.exploit', fallback: 'EXPLOIT', phaseRunning: ['baseline', 'probe'] },
  { key: 'verify', icon: ShieldCheck, labelKey: 'warroom.killChain.verify', fallback: 'VERIFY', phaseRunning: ['verify', 'recheck'] },
  {
    key: 'remediate', icon: Wrench, labelKey: 'warroom.killChain.remediate', fallback: 'REMEDIATE',
    note: { key: 'warroom.killChain.remediateNote', fallback: 'Infra / pentest findings are remediated outside the automated fix loop.' },
  },
  { key: 'rescore', icon: Gauge, labelKey: 'warroom.killChain.rescore', fallback: 'RESCORE' },
]

function phaseStatus(phases: PhaseState[], phase: string): string | undefined {
  return phases.find(p => p.phase === phase)?.status
}

/** Map a single backend phase status onto a node state. `skipped` is treated
 *  as terminal-done (the phase ran and produced nothing, not "still pending");
 *  `error` lights as done so a stalled phase doesn't read as never-started. */
function nodeFromPhase(status: string | undefined): NodeState | null {
  switch (status) {
    case 'running': return 'running'
    case 'done':
    case 'skipped':
    case 'error': return 'done'
    default: return null // pending / missing → unknown, defer to hints
  }
}

/**
 * Derive each node's state. Precedence is strict: backend phaseStatus is the
 * source of truth and wins FIRST. Scan-count / evidence heuristics are only a
 * hint, consulted when the governing phase(s) are unknown (pending / absent).
 * A scan count can never flip a backend-confirmed phase (P1-18).
 */
function deriveStates(i: KillChainInputs): Record<NodeDef['key'], NodeState> {
  const { currentPhase, phases, hasReport, evidenceCount, activeScanCount, running, complete, critical } = i

  // currentPhase is itself a backend signal — fold it in so a phase the server
  // says is current reads as running even if its row hasn't flushed yet.
  const ps = (phase: string): string | undefined =>
    currentPhase === phase && phaseStatus(phases, phase) == null
      ? 'running'
      : phaseStatus(phases, phase)

  // RECON — governed by the baseline phase. Backend truth wins; only when
  // baseline is still unknown may an in-flight scan hint at running, or an
  // existing discovery scan hint at done.
  const recon: NodeState =
    nodeFromPhase(ps('baseline')) ??
    (running > 0 && activeScanCount === 0
      ? 'running'
      : activeScanCount > 0
        ? 'done'
        : 'pending')

  // EXPLOIT — governed by the probe phase (baseline running also counts as
  // "exploit warming"). Backend wins; scan counts only fill the gap.
  const exploit: NodeState =
    nodeFromPhase(ps('probe')) ??
    (ps('baseline') === 'running' || running > 0
      ? 'running'
      : complete > 0
        ? 'done'
        : 'pending')

  // VERIFY — governed by verify, then recheck. The first KNOWN of the two
  // wins; evidence count is only a hint when BOTH are still unknown.
  const verify: NodeState =
    nodeFromPhase(ps('verify')) ??
    nodeFromPhase(ps('recheck')) ??
    (evidenceCount > 0 ? 'done' : 'pending')

  // REMEDIATE — governed by the report phase; presence of a report means fix
  // buckets exist (lit, never breach). No scan-count hint here.
  const remediate: NodeState =
    nodeFromPhase(ps('report')) ??
    (hasReport ? 'done' : 'pending')

  // RESCORE — terminal, score-moving. A confirmed critical is the one signal
  // allowed to escalate to breach regardless of phase (it reflects a verified
  // finding, not a phase guess). Otherwise the report phase governs; complete
  // scans only hint when report is unknown.
  const rescore: NodeState =
    critical > 0
      ? 'breach'
      : (nodeFromPhase(ps('report')) ??
        (hasReport || complete > 0 ? 'done' : 'pending'))

  return { recon, exploit, verify, remediate, rescore }
}

const STATE_COLOR: Record<NodeState, string> = {
  pending: 'var(--rt-muted)',
  running: 'var(--rt-ready)',
  done: 'var(--rt-ok)',
  breach: 'var(--rt-breach)',
}

const STATE_GLOW: Record<NodeState, string> = {
  pending: 'none',
  running: 'var(--rt-glow-ready)',
  done: 'var(--rt-glow-ok)',
  breach: 'var(--rt-glow-breach)',
}

export function KillChainStepper(props: KillChainInputs) {
  const states = useMemo(() => deriveStates(props), [props])

  return (
    <Box
      className={`${styles.scanlines} ${styles.grid}`}
      sx={{
        mx: { xs: 2, sm: 3 }, mb: 2,
        px: { xs: 1, sm: 2.5 }, py: { xs: 1, sm: 1.75 },
        borderRadius: 'var(--flyto-radius-lg)',
        // Faint hairline (was the MUI `divider`, a near-white line on dark —
        // too stark). The kill-chain is a strip, not a heavy boxed panel.
        border: '1px solid',
        borderColor: 'var(--rt-hair)',
        bgcolor: 'color-mix(in srgb, var(--rt-ready) 4%, transparent)',
        position: 'relative',
        minHeight: { xs: 150, sm: 'auto' },
        overflow: { xs: 'visible', sm: 'hidden' },
      }}
    >
      <Box
        className={styles.aboveDecoration}
        sx={{
          display: { xs: 'grid', sm: 'flex' },
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'none' },
          alignItems: { xs: 'start', sm: 'stretch' },
          gap: { xs: 0.75, sm: 0 },
        }}
      >
        {NODES.map((node, idx) => {
          const state = states[node.key]
          const color = STATE_COLOR[state]
          const Icon = node.icon
          const live = state === 'running'
          const lit = state === 'done' || state === 'breach' || state === 'running'
          const label = tOr(node.labelKey, node.fallback)

          return (
            <Box
              key={node.key}
              sx={{
                display: 'flex',
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: { xs: 'flex-start', sm: 'flex-start' },
                flexDirection: { xs: 'row', sm: 'row' },
                flex: { xs: 'none', sm: idx === NODES.length - 1 ? '0 0 auto' : 1 },
                gridColumn: { xs: node.key === 'rescore' ? '1 / -1' : 'auto', sm: 'auto' },
                minWidth: 0,
              }}
            >
              <Box
                title={node.note ? tOr(node.note.key, node.note.fallback) : label}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: { xs: 'flex-start', sm: 'center' },
                  flexDirection: 'row',
                  gap: { xs: 0.5, sm: 1 },
                  flexShrink: { xs: 1, sm: 0 },
                  minWidth: 0,
                  width: { xs: '100%', sm: 'auto' },
                  px: { xs: 0.75, sm: 0 },
                  py: { xs: 0.5, sm: 0 },
                  borderRadius: { xs: 'var(--flyto-radius-md)', sm: 0 },
                  bgcolor: { xs: lit ? `color-mix(in srgb, ${color} 7%, transparent)` : 'color-mix(in srgb, var(--rt-muted) 5%, transparent)', sm: 'transparent' },
                }}
              >
                <Box
                  className={live ? styles.pulse : undefined}
                  sx={{
                    position: 'relative',
                    width: { xs: 30, sm: 32 }, height: { xs: 30, sm: 32 }, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color,
                    border: '1.5px solid',
                    borderColor: lit ? color : 'divider',
                    bgcolor: lit ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
                    boxShadow: STATE_GLOW[state],
                    flexShrink: 0,
                  }}
                >
                  {/* Expanding red lock halo — only on a real breach node. */}
                  {state === 'breach' && <Box className={styles.breachRing} />}
                  <Icon size={16} />
                </Box>
                <Typography
                  variant="body2"
                  className={lit ? styles.statGlow : undefined}
                  sx={{
                    fontFamily: 'var(--flyto-font-mono)',
                    fontWeight: 700, letterSpacing: 0, fontSize: { xs: 10, sm: 12 },
                    lineHeight: { xs: 1.1, sm: 1.43 },
                    color: lit ? color : 'var(--rt-muted)',
                    flex: 1,
                    maxWidth: '100%',
                    overflowWrap: 'anywhere',
                    textAlign: 'left',
                    textTransform: 'uppercase',
                    whiteSpace: { xs: 'normal', sm: 'nowrap' },
                  }}
                >
                  {label}
                </Typography>
              </Box>

              {idx < NODES.length - 1 && (
                <Box sx={{ display: { xs: 'none', sm: 'block' }, flex: 1, mx: 1.5, minWidth: 18, position: 'relative', height: 2 }}>
                  {/* Base rail — the beam animation was intentionally removed
                      (commit 89515a6). The connector now reads as a quiet rail;
                      the "charged" signal lives in the upstream node's lit color
                      + glow, not a separate animated beam. */}
                  <Box sx={{
                    position: 'absolute', inset: 0,
                    bgcolor: 'divider', borderRadius: 1,
                  }} />
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
