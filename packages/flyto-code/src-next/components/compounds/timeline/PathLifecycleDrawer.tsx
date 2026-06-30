/**
 * PathLifecycleDrawer — L3 attack-path lifecycle drilldown.
 *
 * getPathHistory(orgId, pathId) → the status machine for ONE attack
 * path, rendered as:
 *   1. a status RIBBON across the canonical lifecycle
 *        Open → Validated → RedTeamConfirmed → Fixed → Regression → Closed
 *      with the path's furthest-reached stage lit, and
 *   2. a chronological list of transition rows (from → to, actor,
 *      reason, verified badge, chain-probability snapshot, pentest link).
 *
 * PRODUCT HONESTY: a `RedTeamConfirmed` step is the ONLY one that earns
 * the empirical-verified mark — and only when the event itself is
 * `verified === true` via an empirical method. A 'mitigated' operator
 * claim is never dressed up as evidence. We render the verified badge
 * strictly from the event's own `verified` flag.
 *
 * Built on the EvidenceDrawer shell from the _shared barrel. MUI-only
 * (no MantineProvider in the workspace). Dual-mode, lucide icons, font
 * floors, honest empty/loading/error states.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Button from '@mui/material/Button'
import { useTheme, alpha } from '@mui/material/styles'
import {
  Unlock, ShieldCheck, FlaskConical, Wrench, RotateCcw, Lock,
  ArrowRight, User, GitBranch, Target, AlertTriangle, Plus, Minus, Activity,
} from 'lucide-react'

import { EvidenceDrawer } from '@compounds/_shared'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { formatTimestamp } from '@lib/time'
import {
  getPathHistory,
  type PathStatusEvent,
  type PathStatusEventType,
} from '@lib/engine'

// ── Canonical lifecycle ─────────────────────────────────────────────
// Ordered stages. `Regression` sits after Fixed because a regression is
// a fixed path that broke again; `Closed` is the terminal good state.
const LIFECYCLE = [
  { key: 'Open', label: t('timeline.path.open'), icon: Unlock, color: '#f87171' },
  { key: 'Validated', label: t('timeline.path.validated'), icon: ShieldCheck, color: '#fb923c' },
  { key: 'RedTeamConfirmed', label: t('timeline.path.redTeam'), icon: FlaskConical, color: '#ef4444' },
  { key: 'Fixed', label: t('timeline.path.fixed'), icon: Wrench, color: '#22c55e' },
  { key: 'Regression', label: t('timeline.path.regression'), icon: RotateCcw, color: '#eab308' },
  { key: 'Closed', label: t('timeline.path.closed'), icon: Lock, color: '#64748b' },
] as const

type StageKey = (typeof LIFECYCLE)[number]['key']

function stageIndex(status: string): number {
  const norm = status.replace(/[\s_-]/g, '').toLowerCase()
  const i = LIFECYCLE.findIndex(s => s.key.toLowerCase() === norm)
  return i
}

const EVENT_ICON: Record<PathStatusEventType, typeof Activity> = {
  'path.created': Plus,
  status_changed: ArrowRight,
  finding_added: Plus,
  finding_removed: Minus,
  pentest_confirmed: FlaskConical,
  regression_detected: AlertTriangle,
}

const EVENT_COLOR: Record<PathStatusEventType, string> = {
  'path.created': '#06b6d4',
  status_changed: '#a78bfa',
  finding_added: '#f87171',
  finding_removed: '#22c55e',
  pentest_confirmed: '#ef4444',
  regression_detected: '#eab308',
}

export interface PathLifecycleDrawerProps {
  open: boolean
  onClose: () => void
  orgId: string
  /** Attack path id — drives GET /paths/{id}/history?org_id=. */
  pathId: string | null
  title?: string
  subtitle?: string
  /** Optional click-through to the pentest view for a confirmed path. */
  onOpenPentest?: () => void
}

export function PathLifecycleDrawer({
  open, onClose, orgId, pathId, title, subtitle, onOpenPentest,
}: PathLifecycleDrawerProps) {
  const q = useQuery({
    queryKey: qk.history.pathHistory(orgId, pathId ?? undefined),
    queryFn: () => getPathHistory(orgId, pathId!),
    enabled: open && !!orgId && !!pathId,
    staleTime: 30_000,
    retry: false,
  })

  const events = useMemo<PathStatusEvent[]>(() => {
    const list = q.data?.events ?? []
    // Newest first for the transition log.
    return [...list].sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))
  }, [q.data])

  // Furthest stage the path has reached (the ribbon's lit extent) and
  // whether RedTeamConfirmed was reached with empirical verification.
  const { reachedIdx, empiricalConfirmed } = useMemo(() => {
    let maxIdx = -1
    let empirical = false
    for (const e of q.data?.events ?? []) {
      const ti = stageIndex(e.to_status)
      if (ti > maxIdx) maxIdx = ti
      if (
        e.to_status.replace(/[\s_-]/g, '').toLowerCase() === 'redteamconfirmed' &&
        e.verified
      ) {
        empirical = true
      }
    }
    return { reachedIdx: maxIdx, empiricalConfirmed: empirical }
  }, [q.data])

  return (
    <EvidenceDrawer
      open={open}
      onClose={onClose}
      width={520}
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Target size={18} />
          <span>{title || t('timeline.path.drawerTitle')}</span>
        </Box>
      }
      subtitle={subtitle || (pathId ? `#${pathId}` : undefined)}
      footer={
        empiricalConfirmed && onOpenPentest ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<FlaskConical size={14} />}
            onClick={onOpenPentest}
            sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600 }}
          >
            {t('timeline.path.openPentest')}
          </Button>
        ) : undefined
      }
    >
      {q.isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Skeleton variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
          {[0, 1, 2].map(i => <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 1 }} />)}
        </Box>
      )}

      {q.isError && (
        <Alert severity="error" sx={{ fontSize: 13 }}>
          {q.error instanceof Error ? q.error.message : String(q.error)}
        </Alert>
      )}

      {q.data && (
        <>
          {/* Status ribbon */}
          <StatusRibbon reachedIdx={reachedIdx} empiricalConfirmed={empiricalConfirmed} />

          {/* Transition log */}
          <Typography
            variant="overline"
            sx={{ display: 'block', mt: 3, mb: 1, color: 'text.secondary', fontWeight: 700, letterSpacing: 0.5 }}
          >
            {t('timeline.path.transitions')} · {events.length}
          </Typography>

          {events.length === 0 ? (
            <EmptyState label={t('timeline.path.empty')} />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {events.map((e, i) => <TransitionRow key={i} ev={e} />)}
            </Box>
          )}
        </>
      )}
    </EvidenceDrawer>
  )
}

// ── Ribbon ──────────────────────────────────────────────────────────

function StatusRibbon({ reachedIdx, empiricalConfirmed }: { reachedIdx: number; empiricalConfirmed: boolean }) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{ display: 'block', mb: 1, color: 'text.secondary', fontWeight: 700, letterSpacing: 0.5 }}
      >
        {t('timeline.path.lifecycle')}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5 }}>
        {LIFECYCLE.map((stage, i) => {
          const reached = i <= reachedIdx && reachedIdx >= 0
          const isCurrent = i === reachedIdx
          const Icon = stage.icon
          // RedTeamConfirmed only "earns" its full color when empirically verified.
          const earned = stage.key !== 'RedTeamConfirmed' || empiricalConfirmed || i < reachedIdx
          const live = reached && earned
          const color = live ? stage.color : alpha(theme.palette.text.primary, 0.3)
          return (
            <Tooltip
              key={stage.key}
              arrow
              title={
                stage.key === 'RedTeamConfirmed' && reached && !empiricalConfirmed
                  ? t('timeline.path.notEmpirical')
                  : stage.label
              }
            >
              <Box
                sx={{
                  flex: 1, minWidth: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                  py: 1, px: 0.5, borderRadius: 1,
                  bgcolor: isCurrent ? alpha(stage.color, isDark ? 0.18 : 0.12) : 'transparent',
                  border: isCurrent ? `1px solid ${alpha(stage.color, 0.5)}` : '1px solid transparent',
                  opacity: reached ? 1 : 0.55,
                }}
              >
                <Box
                  sx={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'grid', placeItems: 'center',
                    color,
                    border: `2px solid ${color}`,
                    bgcolor: live ? alpha(stage.color, 0.15) : 'transparent',
                    position: 'relative',
                  }}
                >
                  <Icon size={14} />
                  {stage.key === 'RedTeamConfirmed' && empiricalConfirmed && reached && (
                    <Box sx={{ position: 'absolute', bottom: -4, right: -4 }}>
                      <ShieldCheck size={12} color="#22c55e" />
                    </Box>
                  )}
                </Box>
                <Typography
                  sx={{
                    fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.15,
                    color: live ? 'text.primary' : 'text.disabled',
                  }}
                >
                  {stage.label}
                </Typography>
              </Box>
            </Tooltip>
          )
        })}
      </Box>
    </Box>
  )
}

// ── Transition row ──────────────────────────────────────────────────

function TransitionRow({ ev }: { ev: PathStatusEvent }) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const evColor = EVENT_COLOR[ev.event_type] ?? '#94a3b8'
  const EvIcon = EVENT_ICON[ev.event_type] ?? Activity
  const prob = ev.chain_probability_snapshot
  const showProb = typeof prob === 'number' && prob > 0
  return (
    <Box
      sx={{
        display: 'flex', gap: 1.25,
        p: 1.25, borderRadius: 1,
        border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        bgcolor: alpha(theme.palette.text.primary, isDark ? 0.02 : 0.015),
      }}
    >
      <Box
        sx={{
          flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          color: evColor, border: `2px solid ${alpha(evColor, 0.6)}`,
          bgcolor: alpha(evColor, 0.12),
        }}
      >
        <EvIcon size={13} />
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        {/* from → to */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          {ev.from_status && (
            <>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600 }}>{ev.from_status}</Typography>
              <ArrowRight size={12} color={theme.palette.text.secondary} />
            </>
          )}
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{ev.to_status || ev.event_type}</Typography>
          <Chip
            label={ev.event_type}
            size="small"
            sx={{ height: 18, fontSize: 12, fontWeight: 600, bgcolor: alpha(evColor, 0.18), color: evColor }}
          />
          {ev.verified && (
            <Tooltip arrow title={ev.verified_method || t('timeline.path.empiricalVerified')}>
              <Chip
                icon={<ShieldCheck size={11} />}
                label={ev.verified_method || t('timeline.verified')}
                size="small"
                sx={{
                  height: 18, fontSize: 12, fontWeight: 600,
                  bgcolor: alpha('#22c55e', 0.18), color: '#22c55e',
                  '& .MuiChip-icon': { color: '#22c55e', ml: 0.5 },
                }}
              />
            </Tooltip>
          )}
        </Box>

        {ev.reason && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
            {ev.reason}
          </Typography>
        )}

        {/* meta line */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', mt: 0.5 }}>
          <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, color: 'text.secondary' }}>
            {formatTimestamp(ev.observed_at)}
          </Typography>
          {ev.actor && (
            <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, color: 'text.secondary' }}>
              <User size={11} /> {ev.actor}
            </Typography>
          )}
          {ev.source && (
            <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, color: 'text.secondary' }}>
              <GitBranch size={11} /> {ev.source}
            </Typography>
          )}
          {showProb && (
            <Tooltip arrow title={t('timeline.path.chainProb')}>
              <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, color: evColor, fontWeight: 600 }}>
                <Activity size={11} /> {(prob * 100).toFixed(0)}%
              </Typography>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 100, color: 'text.disabled', textAlign: 'center', px: 2 }}>
      <Box>
        <Target size={26} style={{ opacity: 0.4 }} />
        <Typography sx={{ fontSize: 13, mt: 1, color: 'text.secondary' }}>{label}</Typography>
      </Box>
    </Box>
  )
}

// Keep StageKey referenced (exported helper surface kept minimal).
export type { StageKey }
