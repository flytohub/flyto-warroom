/**
 * FixQueueDrawer — the guided "walk me through fixing" right-side panel.
 *
 * Dashboard / pulse exposed *findings* but never *next steps*. Every
 * CTA used to jump to a list and leave the operator at the start of
 * a triage exercise. This drawer is the consolidated answer: one
 * item at a time, with the WHY (cross-dim signal list) and the
 * recommended fix action surfaced as a primary button. Skip / Back /
 * Next nav advances through the queue without ever leaving the page.
 *
 * Sources: reads from `getOrgPulse(orgId, '', 50)` once, filters
 * client-side by the active `FixQueueFilter`, sorts by blast radius
 * (server already does this).
 *
 * Recommended-action priority (highest first):
 *   1. autofix_eligible          → "Preview AutoFix & approve"
 *   2. open_prs_touching.length  → "Review open PR"
 *   3. fingerprint               → "Open finding details"
 *   4. source === 'pentest'      → "Open in Pentest"
 *   5. repo_id                   → "Open in repo"
 *   6. fallback                  → "View in war room"
 *
 * The actual fix mutation lives in the existing AutofixPreviewModal
 * + PRDialog — the drawer just gets the operator there one click
 * faster than navigating manually.
 */

import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Drawer, Box, Typography, IconButton, Button, Chip, LinearProgress, Tooltip,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  X, ArrowRight, ArrowLeft, SkipForward, ExternalLink, Wand2,
  GitPullRequest, Target, ShieldAlert, Crown, Skull, Sparkles,
  AlertTriangle, ChevronRight, Activity,
} from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { getOrgPulse, type PulseItem } from '@lib/engine'
import { useFixQueue, type FixQueueFilter, type AssetScope } from '@/contexts/FixQueueContext'
import { QueryError } from '@atoms/QueryError'
import { PRDialog } from '@atoms/PRDialog'
import { severityColor } from '@atoms/SeverityChip'
import { SEVERITY_TONE } from '@lib/tokens/severity'
import { UniversalFindingPanel } from '@compounds/_shared/UniversalFindingPanel'
import { AutofixPreviewModal } from '@compounds/security/AutofixPreviewModal'
import { useNavigate, useParams } from 'react-router'

// Filter matchers — applied client-side over the full pulse list.
function matchesFilter(item: PulseItem, filter: FixQueueFilter): boolean {
  switch (filter) {
    case 'all':     return true
    case 'autofix': return !!item.autofix_eligible
    case 'taint':   return item.taint_adjacency != null
    case 'pr':      return (item.open_prs_touching?.length ?? 0) > 0
    case 'pentest': return item.pentest_verdict != null
  }
}

// Optional asset scope — narrow the queue to findings on one
// specific repo / domain. Returns true when no scope is set so
// callers can chain matchesFilter && matchesScope without a guard.
function matchesScope(item: PulseItem, scope?: AssetScope): boolean {
  if (!scope) return true
  if (scope.kind === 'repo') return item.repo_id === scope.value
  // Domain match: pulse items don't carry a direct domain field, so
  // we match by extra.target_url substring (dast scans) or by
  // attack-surface asset name (other external sources).
  const target = (item.extra?.target_url ?? '').toLowerCase()
  const assetName = (item.extra?.asset_name ?? '').toLowerCase()
  const dom = scope.value.toLowerCase()
  return target.includes(dom) || assetName.includes(dom)
}

// AutoFix preview eligibility — we can only safely open the
// AutofixPreviewModal in-drawer when the pulse item's id is the
// same key the engine indexes autofix findings by. That's true for
// `source === 'alert'` items (both keyed by alert id) but NOT for
// container / iac / license / dast / pentest sources, where the
// pulse id is a different namespace. For those we fall back to
// navigating to the AutoFix list with the finding selectable from
// there (operator picks once; same result, one more click).
function canPreviewAutofixInDrawer(item: PulseItem): boolean {
  return item.source === 'alert' && !!item.autofix_eligible
}

// Persistent session counter — keyed by orgId, decays after 24h
// so the badge resets day-to-day instead of accumulating forever.
const SESSION_TTL_MS = 24 * 60 * 60_000
function sessionKey(orgId: string | undefined): string {
  return `flyto:fixq:session:${orgId ?? 'anon'}`
}
function loadSession(orgId: string | undefined): number {
  try {
    const raw = localStorage.getItem(sessionKey(orgId))
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { count?: number; updatedAt?: number }
    if (typeof parsed.count !== 'number' || typeof parsed.updatedAt !== 'number') return 0
    if (Date.now() - parsed.updatedAt > SESSION_TTL_MS) return 0
    return parsed.count
  } catch { return 0 }
}
function saveSession(orgId: string | undefined, count: number) {
  try {
    localStorage.setItem(sessionKey(orgId), JSON.stringify({ count, updatedAt: Date.now() }))
  } catch { /* quota / private mode */ }
}

interface Signal {
  icon: typeof AlertTriangle
  label: string
  tone: string
}

// Cross-dim signal list for the item card. The "Why ranked" panel
// reads from this — each lit signal is shown as a row tinted by
// category. Mirrors the Pulse hero card's whySignals fn but lives
// here so the drawer is self-contained.
function whySignals(item: PulseItem): Signal[] {
  const out: Signal[] = []
  if (item.taint_adjacency) {
    out.push({ icon: Target, label: t('fixq.reachable'), tone: '#ef4444' })
  }
  const prs = item.open_prs_touching ?? []
  if (prs.length > 0) {
    const list = prs.slice(0, 2).map(p => `#${p?.number}`).join(', ')
    const more = prs.length > 2 ? ` +${prs.length - 2}` : ''
    out.push({ icon: GitPullRequest, label: `${t('fixq.pr')}: ${list}${more}`, tone: '#3b82f6' })
  }
  if (item.pentest_verdict) {
    out.push({ icon: ShieldAlert, label: t('fixq.pentest'), tone: '#f97316' })
  }
  if (item.autofix_eligible) {
    out.push({ icon: Wand2, label: t('fixq.autofix'), tone: '#7c3aed' })
  }
  const extra = item.extra ?? {}
  if (extra.kev_listed === 'true' || extra.kev === 'true') {
    out.push({ icon: Skull, label: t('fixq.kev'), tone: '#dc2626' })
  }
  if (extra.threat_actor) {
    out.push({ icon: AlertTriangle, label: `${t('fixq.actor')}: ${extra.threat_actor}`, tone: '#dc2626' })
  }
  if (extra.asset_tier === 'crown_jewel') {
    out.push({ icon: Crown, label: t('fixq.crown'), tone: '#f97316' })
  }
  return out
}

function blastTone(b: number): string {
  if (b >= 80) return SEVERITY_TONE.critical.tone
  if (b >= 60) return SEVERITY_TONE.high.tone
  if (b >= 40) return SEVERITY_TONE.medium.tone
  return SEVERITY_TONE.low.tone
}

interface ActionRecommendation {
  label: string
  icon: typeof Wand2
  tone: string
  kind: 'autofix' | 'pr' | 'finding' | 'pentest' | 'repo' | 'external' | 'none'
}

function recommendAction(item: PulseItem): ActionRecommendation {
  if (item.autofix_eligible) {
    // Tell the operator up-front whether the modal will open
    // in-drawer or whether we have to bounce them to the AutoFix
    // section first. Honest labels > sudden navigation.
    return {
      label: canPreviewAutofixInDrawer(item)
        ? t('fixq.recAutofix')
        : t('fixq.recAutofixOpen'),
      icon: Wand2, tone: '#7c3aed', kind: 'autofix',
    }
  }
  if ((item.open_prs_touching?.length ?? 0) > 0) {
    return {
      label: t('fixq.recPR'),
      icon: GitPullRequest, tone: '#3b82f6', kind: 'pr',
    }
  }
  if (item.fingerprint) {
    return {
      label: t('fixq.recFinding'),
      icon: Activity, tone: '#7c3aed', kind: 'finding',
    }
  }
  if (item.source === 'pentest') {
    return {
      label: t('fixq.recPentest'),
      icon: ShieldAlert, tone: '#f97316', kind: 'pentest',
    }
  }
  if (item.repo_id) {
    return {
      label: t('fixq.recRepo'),
      icon: ChevronRight, tone: 'text.primary', kind: 'repo',
    }
  }
  if (item.source === 'dast' && item.extra?.target_url) {
    return {
      label: t('fixq.recExternal'),
      icon: ExternalLink, tone: 'text.primary', kind: 'external',
    }
  }
  return {
    label: t('fixq.recNone'),
    icon: AlertTriangle, tone: 'text.secondary', kind: 'none',
  }
}

const FILTER_LABEL: Record<FixQueueFilter, { fallback: string; key: string }> = {
  all:     { key: 'fixq.filterAll',     fallback: 'All open findings' },
  autofix: { key: 'fixq.filterAutofix', fallback: 'AutoFix-ready' },
  taint:   { key: 'fixq.filterTaint',   fallback: 'Reachable from prod' },
  pr:      { key: 'fixq.filterPR',      fallback: 'Touched by open PR' },
  pentest: { key: 'fixq.filterPentest', fallback: 'Pentest-verified' },
}

export function FixQueueDrawer() {
  const { state, close } = useFixQueue()
  const { org } = useOrg()
  const navigate = useNavigate()
  const { orgId: routeOrgId } = useParams<{ orgId: string }>()
  const [cursor, setCursor] = useState(0)
  const [prDialogPRs, setPrDialogPRs] = useState<NonNullable<PulseItem['open_prs_touching']>>([])
  const [findingFp, setFindingFp] = useState<string | null>(null)
  // In-drawer AutoFix preview — when the operator hits "Preview
  // AutoFix & approve" we open the existing AutofixPreviewModal
  // here instead of navigating away. On approve, advance to next.
  const [autofixFindingId, setAutofixFindingId] = useState<string | null>(null)
  // Persistent session counter — backed by localStorage with a 24h
  // TTL so a page refresh doesn't reset the "X resolved" badge but
  // the counter doesn't accumulate forever either. Loads lazily
  // from storage on mount keyed by org id.
  const [resolvedThisSession, setResolvedThisSession] = useState<number>(() => loadSession(org?.id))
  // Reload from storage every time the drawer opens, so multiple
  // tabs viewing the same org converge on a shared count.
  useEffect(() => {
    if (state.open) setResolvedThisSession(loadSession(org?.id))
  }, [state.open, org?.id])

  // Fetch a wider page than the dashboard / pulse-top-5 so the
  // wizard has somewhere to "advance to" — 50 covers the typical
  // operator's daily fix queue without paginating.
  const pulseQ = useQuery({
    queryKey: qk.pulse.fixQueue(org?.id),
    queryFn: () => getOrgPulse(org!.id, '', 50),
    enabled: !!org?.id && state.open,
    staleTime: 60_000,
  })

  // Filtered queue — applied client-side so the same fetch serves
  // every filter / scope combination the operator might switch to.
  const queue = useMemo<PulseItem[]>(() => {
    const items = pulseQ.data?.items ?? []
    return items.filter(i => matchesFilter(i, state.filter) && matchesScope(i, state.scope))
  }, [pulseQ.data, state.filter, state.scope])

  // Reset cursor when the drawer opens with a new filter / initial
  // item. Without the reset the operator would re-open a different
  // filter and land mid-list.
  useEffect(() => {
    if (!state.open) return
    if (state.initialItemId) {
      const idx = queue.findIndex(i => i.id === state.initialItemId)
      setCursor(idx >= 0 ? idx : 0)
    } else {
      setCursor(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open, state.filter, state.initialItemId, queue.length])

  const current = queue[cursor]
  const total = queue.length
  const upcoming = queue.slice(cursor + 1, cursor + 4)

  const handleAction = (item: PulseItem) => {
    const rec = recommendAction(item)
    switch (rec.kind) {
      case 'autofix':
        // Only `alert`-source pulse items share their id with the
        // autofix finding system. For container/iac/license/dast/
        // pentest sources, the pulse id is a different namespace —
        // we'd 404 the modal trying to load it. Fall back to the
        // AutoFix section (where the operator picks the right
        // finding) instead of guessing.
        if (canPreviewAutofixInDrawer(item)) {
          setAutofixFindingId(item.id)
        } else if (routeOrgId) {
          navigate(`/projects/${routeOrgId}/autofix`)
          close()
        }
        return
      case 'pr':
        setPrDialogPRs(item.open_prs_touching ?? [])
        return
      case 'finding':
        if (item.fingerprint) setFindingFp(item.fingerprint)
        return
      case 'pentest':
        if (routeOrgId) {
          navigate(`/projects/${routeOrgId}/pentest`)
          close()
        }
        return
      case 'repo':
        if (routeOrgId && item.repo_id) {
          navigate(`/projects/${routeOrgId}/repos/${item.repo_id}`)
          close()
        }
        return
      case 'external':
        if (item.extra?.target_url) {
          try {
            const url = new URL(item.extra.target_url)
            if (url.protocol === 'http:' || url.protocol === 'https:') {
              globalThis.window.open(item.extra.target_url, '_blank', 'noopener,noreferrer')
            }
          } catch { /* ignore */ }
        }
        return
      case 'none':
      default:
        return
    }
  }

  const advance = () => setCursor(c => Math.min(c + 1, total - 1))
  const back = () => setCursor(c => Math.max(c - 1, 0))

  return (
    <>
      <Drawer
        anchor="right"
        open={state.open}
        onClose={close}
        slotProps={{
          paper: {
            sx: { width: { xs: '100%', sm: 460, md: 520 }, bgcolor: 'background.default' },
          },
        }}
      >
        {/* Header — title, filter chip, close. */}
        <Box sx={{
          flexShrink: 0,
          px: 2.5, pt: 2, pb: 1.5,
          borderBottom: '1px solid', borderColor: 'divider',
          bgcolor: 'background.paper',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Wand2 size={18} style={{ color: '#7c3aed' }} />
            <Typography sx={{ fontSize: 16, fontWeight: 700, flex: 1 }}>
              {t('fixq.title')}
            </Typography>
            <IconButton size="small" onClick={close} aria-label="close">
              <X size={16} />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={tOr(FILTER_LABEL[state.filter].key, FILTER_LABEL[state.filter].fallback)}
              sx={{ fontWeight: 600, bgcolor: alpha('#7c3aed', 0.14), color: '#7c3aed' }}
            />
            {/* Asset scope chip — when the drawer was opened from
                a specific building / repo / domain, show what it's
                scoped to so the operator doesn't wonder why the
                queue is shorter than expected. */}
            {state.scope && (
              <Chip
                size="small"
                label={`${state.scope.kind === 'repo' ? 'repo' : 'domain'}: ${state.scope.value}`}
                sx={{
                  fontWeight: 600,
                  bgcolor: 'action.hover',
                  color: 'text.secondary',
                  maxWidth: 200,
                  '& .MuiChip-label': {
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  },
                }}
              />
            )}
            {total > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {t('fixq.progress')
                  .replace('{n}', String(cursor + 1))
                  .replace('{total}', String(total))}
              </Typography>
            )}
            {/* Session counter — accumulates as the operator
                approves AutoFix patches in-drawer. Renders only
                after at least one resolve so first-paint stays
                clean. */}
            {resolvedThisSession > 0 && (
              <Chip
                size="small"
                icon={<Sparkles size={11} />}
                label={t('fixq.resolvedSession').replace('{n}', String(resolvedThisSession))}
                sx={{
                  fontWeight: 700,
                  bgcolor: alpha('#22c55e', 0.14),
                  color: '#16a34a',
                  '& .MuiChip-icon': { color: '#16a34a' },
                }}
              />
            )}
          </Box>
          {total > 0 && (
            <LinearProgress
              variant="determinate"
              value={((cursor + 1) / total) * 100}
              sx={{
                mt: 1.5, height: 4, borderRadius: 2,
                bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': { bgcolor: '#7c3aed' },
              }}
            />
          )}
        </Box>

        {/* Body */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {pulseQ.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <Typography variant="body2" color="text.secondary">
                {t('fixq.loading')}
              </Typography>
            </Box>
          )}
          {pulseQ.isError && (
            <QueryError
              error={pulseQ.error}
              onRetry={pulseQ.refetch}
              compact
              label={t('fixq.queueLabel')}
            />
          )}
          {!pulseQ.isLoading && !pulseQ.isError && total === 0 && (
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              py: 6, gap: 1.5,
              // Cleared-the-queue celebration: glow tint when the
              // operator actually resolved things this session,
              // otherwise quiet "no work here" copy.
              ...(resolvedThisSession > 0 && {
                bgcolor: alpha('#22c55e', 0.05),
                border: '1px solid', borderColor: alpha('#22c55e', 0.25),
                borderRadius: 2, mx: -1, px: 2,
              }),
            }}>
              <Box sx={{
                width: 56, height: 56, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: resolvedThisSession > 0 ? alpha('#22c55e', 0.12) : 'action.hover',
              }}>
                <Sparkles size={28} style={{
                  color: resolvedThisSession > 0 ? '#16a34a' : '#94a3b8',
                }} />
              </Box>
              <Typography variant="h6" fontWeight={700} sx={{
                color: resolvedThisSession > 0 ? '#16a34a' : 'text.primary',
              }}>
                {resolvedThisSession > 0
                  ? t('fixq.cleared')
                  : t('fixq.emptyTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 360 }}>
                {resolvedThisSession > 0
                  ? t('fixq.clearedDesc')
                      .replace('{n}', String(resolvedThisSession))
                      .replace('{n, plural, one {finding} other {findings}}', resolvedThisSession === 1 ? 'finding' : 'findings')
                  : t('fixq.emptyDesc')}
              </Typography>
            </Box>
          )}

          {current && (
            <FixCard
              item={current}
              recommendation={recommendAction(current)}
              signals={whySignals(current)}
              onAction={() => handleAction(current)}
              onSkip={advance}
            />
          )}

          {upcoming.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 700,
                  fontSize: 13,
                  mb: 1,
                  display: 'block',
                }}
              >
                {t('fixq.upNext')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {upcoming.map((item, i) => (
                  <UpNextRow
                    key={item.id}
                    item={item}
                    onClick={() => setCursor(cursor + 1 + i)}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>

        {/* Footer — back / skip / next nav. */}
        {total > 0 && (
          <Box sx={{
            flexShrink: 0,
            px: 2.5, py: 1.5,
            borderTop: '1px solid', borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex', alignItems: 'center', gap: 1,
          }}>
            <Button
              size="small"
              startIcon={<ArrowLeft size={14} />}
              onClick={back}
              disabled={cursor === 0}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {t('fixq.back')}
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              startIcon={<SkipForward size={14} />}
              onClick={advance}
              disabled={cursor >= total - 1}
              sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
            >
              {t('fixq.skip')}
            </Button>
            <Button
              size="small"
              variant="contained"
              endIcon={<ArrowRight size={14} />}
              onClick={advance}
              disabled={cursor >= total - 1}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {t('fixq.next')}
            </Button>
          </Box>
        )}
      </Drawer>

      {/* Modals raised by the action button — rendered alongside
          the drawer so they layer correctly above it. */}
      {prDialogPRs.length > 0 && (
        <PRDialog
          prs={prDialogPRs}
          onClose={() => setPrDialogPRs([])}
        />
      )}
      <UniversalFindingPanel
        fingerprint={findingFp}
        onClose={() => setFindingFp(null)}
      />
      {/* AutoFix preview — Phase B+C: opens in-drawer, on close
          we treat it as a resolution event (increments the
          session counter + advances to the next queue item). The
          modal handles its own approve / regenerate flow; we just
          react to its close. */}
      {autofixFindingId && org?.id && (
        <AutofixPreviewModal
          orgId={org.id}
          findingId={autofixFindingId}
          onClose={() => {
            setAutofixFindingId(null)
            // Increment + persist so a F5 refresh doesn't wipe
            // the "X resolved this session" badge.
            setResolvedThisSession(n => {
              const next = n + 1
              saveSession(org?.id, next)
              return next
            })
            setCursor(c => Math.min(c + 1, Math.max(0, total - 1)))
          }}
        />
      )}
    </>
  )
}

function FixCard({ item, recommendation, signals, onAction, onSkip }: {
  item: PulseItem
  recommendation: ActionRecommendation
  signals: Signal[]
  onAction: () => void
  onSkip: () => void
}) {
  const sevColor = severityColor(item.severity)
  const blast = item.blast_radius ?? 0
  const bColor = blastTone(blast)
  const Icon = recommendation.icon

  return (
    <Box sx={{
      borderRadius: 2,
      border: '1px solid', borderColor: 'divider',
      bgcolor: 'background.paper',
      // Don't clip content with `overflow: hidden` here — the
      // bottom-of-card button was rendering at 50% in the 2026-05-20
      // screenshot because the rounded clip cut into the contained
      // Button. The top accent stripe instead gets its own
      // border-radius to match the card corners.
    }}>
      <Box sx={{ height: 4, bgcolor: bColor, borderRadius: '8px 8px 0 0' }} />
      <Box sx={{ px: 2.5, pt: 2, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Typography sx={{ fontSize: 36, fontWeight: 900, color: bColor, lineHeight: 1, flexShrink: 0 }}>
            {blast}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
              <Chip
                size="small"
                label={(item.severity ?? '').toUpperCase() || '—'}
                sx={{
                  fontWeight: 700, fontSize: 13,
                  bgcolor: alpha(sevColor, 0.14), color: sevColor,
                }}
              />
              <Chip
                size="small"
                label={item.source}
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: 13, color: 'text.secondary', borderColor: 'divider' }}
              />
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>
              {item.title}
            </Typography>
            {item.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5, fontSize: 13 }}>
                {item.description}
              </Typography>
            )}
            {item.file_path && (
              <Typography
                component="code"
                title={item.file_path}
                sx={{
                  display: 'block', mt: 0.75, fontFamily: 'monospace',
                  fontSize: 12, color: 'text.secondary',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {item.file_path}{item.line_number ? `:${item.line_number}` : ''}
              </Typography>
            )}
          </Box>
        </Box>

        {signals.length > 0 && (
          <Box sx={{
            mt: 2, p: 1.5, borderRadius: 1,
            bgcolor: alpha(bColor, 0.07),
            border: '1px solid', borderColor: alpha(bColor, 0.25),
          }}>
            <Typography
              variant="caption"
              sx={{
                color: bColor, fontWeight: 700, fontSize: 13,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                mb: 0.5, display: 'block',
              }}
            >
              {t('fixq.whyRanked')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {signals.map((sig, i) => {
                const IconComp = sig.icon
                return (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ color: sig.tone, display: 'flex' }}>
                      <IconComp size={13} />
                    </Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                      {sig.label}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}

        {/* Recommended action */}
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 13 }}
          >
            {t('fixq.recommended')}
          </Typography>
          <Tooltip title={recommendation.kind === 'none'
            ? t('fixq.recNoneTip')
            : ''}>
            <span style={{ display: 'block', width: '100%' }}>
              <Button
                fullWidth
                variant="contained"
                color="inherit"
                disableElevation
                size="large"
                startIcon={<Icon size={16} />}
                onClick={onAction}
                disabled={recommendation.kind === 'none'}
                sx={{
                  textTransform: 'none', fontWeight: 700, py: 1.25,
                  bgcolor: recommendation.kind === 'none' ? undefined : recommendation.tone,
                  color: recommendation.kind === 'none' ? undefined : '#fff',
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: recommendation.kind === 'none' ? undefined : recommendation.tone,
                    filter: 'brightness(0.92)',
                    boxShadow: 'none',
                  },
                  '&:active': {
                    bgcolor: recommendation.kind === 'none' ? undefined : recommendation.tone,
                    boxShadow: 'none',
                  },
                  '&.Mui-focusVisible': {
                    boxShadow: `0 0 0 3px ${recommendation.kind === 'none' ? '#94a3b833' : `${recommendation.tone}33`}`,
                  },
                }}
              >
                {recommendation.label}
              </Button>
            </span>
          </Tooltip>
          <Button
            size="small"
            onClick={onSkip}
            startIcon={<SkipForward size={14} />}
            sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
          >
            {t('fixq.skipForNow')}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

function UpNextRow({ item, onClick }: { item: PulseItem; onClick: () => void }) {
  const sevColor = severityColor(item.severity)
  const blast = item.blast_radius ?? 0
  const bColor = blastTone(blast)
  return (
    <Box
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 1.5, py: 1.25, borderRadius: 1.5,
        border: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper',
        cursor: 'pointer',
        transition: 'background-color 0.12s, border-color 0.12s',
        '&:hover': { bgcolor: 'action.hover', borderColor: 'text.secondary' },
        '&:focus-visible': {
          outline: `2px solid ${bColor}`,
          outlineOffset: 2,
        },
      }}
    >
      <Typography sx={{ fontSize: 18, fontWeight: 800, color: bColor, lineHeight: 1, minWidth: 28 }}>
        {blast}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 13, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mt: 0.25 }}>
          <Chip
            size="small"
            label={(item.severity ?? '').toUpperCase() || '—'}
            sx={{ fontWeight: 700, fontSize: 12, height: 16, bgcolor: alpha(sevColor, 0.14), color: sevColor }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
            {item.source}
          </Typography>
        </Box>
      </Box>
      <ChevronRight size={14} style={{ color: 'currentColor', opacity: 0.4 }} />
    </Box>
  )
}
