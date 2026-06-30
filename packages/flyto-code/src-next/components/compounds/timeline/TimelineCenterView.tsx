/**
 * TimelineCenterView — the L1–L4 layered audit timeline.
 *
 * One unified, filterable event stream driven by getOrgTimeline. Every
 * row is one of four layers:
 *   L1 Asset    — raw events (scan / pentest / score / alert / asset)
 *   L2 Evidence — confidence signals (carry provenance + verified)
 *   L3 Path     — attack-path status changes (carry verified + method)
 *   L4 Decision — operator actions (carry NO provenance/verified — by
 *                 design: an operator claim is not evidence)
 *
 * The product honesty contract is enforced in the render: an L2/L3 row
 * shows its provenance + verified badge; an L4 row never fabricates one.
 *
 * Drill-in (reuses sectionNav-style routing of the existing feed):
 *   - an L3 path_status row opens <PathLifecycleDrawer> for that path
 *   - an L2 confidence row opens <ConfidenceTrajectory> for that finding
 *
 * Reuses the HistoryFeedView feed/filter idiom (since presets, search,
 * rail-dotted timeline) rather than importing it, because this stream
 * is layer-keyed not kind-keyed. MUI-only (no MantineProvider), lucide
 * icons, dual-mode, font floors, honest empty/loading/error states.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Tooltip from '@mui/material/Tooltip'
import Button from '@mui/material/Button'
import { useTheme, alpha } from '@mui/material/styles'
import {
  Layers, Search, X, ShieldCheck, Bot, FlaskConical, MessageSquare,
  Boxes, Activity, GitBranch, UserCog, Clock, ChevronRight,
} from 'lucide-react'

import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { formatTimestamp } from '@lib/time'
import { useOrg } from '@hooks/useOrg'
import {
  getOrgTimeline,
  type TimelineItem,
  type TimelineLayer,
  type TimelineKind,
} from '@lib/engine'

import { PathLifecycleDrawer } from './PathLifecycleDrawer'
import { ConfidenceTrajectory } from './ConfidenceTrajectory'
import { EvidenceDrawer } from '@compounds/_shared'
import { MONO, BRAND, techGrid, TechEyebrow } from '@atoms/techConsole'

// ── Layer metadata ──────────────────────────────────────────────────
const LAYER_META: Record<TimelineLayer, { label: string; color: string; icon: typeof Boxes }> = {
  L1: { label: t('timeline.layer.l1'), color: '#22d3ee', icon: Boxes },
  L2: { label: t('timeline.layer.l2'), color: '#a78bfa', icon: Activity },
  L3: { label: t('timeline.layer.l3'), color: '#fb923c', icon: GitBranch },
  L4: { label: t('timeline.layer.l4'), color: '#64748b', icon: UserCog },
}

const ALL_LAYERS: TimelineLayer[] = ['L1', 'L2', 'L3', 'L4']

const KIND_LABEL: Record<TimelineKind, string> = {
  scan: 'scan', pentest: 'pentest', score: 'score', alert: 'alert', asset: 'asset',
  confidence: 'confidence', path_status: 'path', decision: 'decision',
}

// source_type → an icon for provenance chips.
function provenanceIcon(sourceType?: string): typeof Bot {
  switch ((sourceType ?? '').toLowerCase()) {
    case 'empirical_test':
    case 'pentest':
    case 'live_probe': return FlaskConical
    case 'analyst_feedback':
    case 'analyst': return MessageSquare
    default: return Bot
  }
}

const SINCE_PRESETS = ['24h', '7d', '30d', '90d'] as const

export function TimelineCenterView() {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const { org } = useOrg()
  const orgId = org?.id

  const [since, setSince] = useState<string>('30d')
  const [activeLayers, setActiveLayers] = useState<Set<TimelineLayer>>(new Set(ALL_LAYERS))
  const [q, setQ] = useState('')

  // Drill-in state.
  const [pathDrawer, setPathDrawer] = useState<{ id: string; title?: string } | null>(null)
  const [confDrawer, setConfDrawer] = useState<{ fp: string; title?: string } | null>(null)

  // Query the FULL window/layer set and filter client-side for snappy
  // layer toggles (one fetch, no refetch per toggle). The layers param
  // is omitted so the server returns all four; subjectId stays unset.
  const opts = useMemo(() => ({ since }), [since])
  const query = useQuery({
    queryKey: qk.history.timeline(orgId, opts),
    queryFn: () => getOrgTimeline(orgId!, opts),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const counts = useMemo(() => {
    const c: Record<TimelineLayer, number> = { L1: 0, L2: 0, L3: 0, L4: 0 }
    for (const it of query.data?.items ?? []) c[it.layer]++
    return c
  }, [query.data])

  const filtered = useMemo(() => {
    const items = query.data?.items ?? []
    const needle = q.trim().toLowerCase()
    return items.filter(it => {
      if (!activeLayers.has(it.layer)) return false
      if (!needle) return true
      return (
        (it.title ?? '').toLowerCase().includes(needle) ||
        (it.summary ?? '').toLowerCase().includes(needle) ||
        (it.actor ?? '').toLowerCase().includes(needle)
      )
    })
  }, [query.data, activeLayers, q])

  function toggleLayer(l: TimelineLayer) {
    setActiveLayers(prev => {
      const next = new Set(prev)
      if (next.has(l)) {
        if (next.size > 1) next.delete(l) // keep at least one lit
      } else {
        next.add(l)
      }
      return next
    })
  }

  function onRowClick(it: TimelineItem) {
    if (it.layer === 'L3' && it.subject_id) {
      setPathDrawer({ id: it.subject_id, title: it.title })
    } else if (it.layer === 'L2' && it.subject_id) {
      setConfDrawer({ fp: it.subject_id, title: it.title })
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, p: { xs: 1.5, sm: 2.5 } }}>
      {/* Header — full-bleed SOC console band */}
      <Box sx={{
        flex: 'none',
        mx: { xs: -1.5, sm: -2.5 }, mt: { xs: -1.5, sm: -2.5 },
        px: { xs: 1.5, sm: 2.5 }, pt: { xs: 1.5, sm: 2.5 }, pb: 1.5, mb: 1.5,
        borderTop: `2px solid ${BRAND}`,
        borderBottom: '1px solid', borderColor: 'divider',
        ...techGrid(dark),
        display: 'flex', alignItems: 'center', gap: 1.25,
        '& > *': { position: 'relative', zIndex: 1 },
      }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: alpha(BRAND, 0.14), color: BRAND, border: `1px solid ${alpha(BRAND, 0.3)}` }}>
          <Layers size={20} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
              {t('timeline.center.title')}
            </Typography>
            <TechEyebrow icon={<Layers size={12} />}>{t('hardcoded.evidence.stream.55dfb642')}</TechEyebrow>
          </Box>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            {t('timeline.center.sub')}
          </Typography>
        </Box>
        {query.data && (
          <Chip
            label={filtered.length}
            size="small"
            sx={{ height: 22, fontSize: 13, fontWeight: 700, fontFamily: MONO, bgcolor: alpha(BRAND, 0.14), color: BRAND }}
          />
        )}
      </Box>

      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5, flex: 'none' }}>
        {/* Layer filter */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {ALL_LAYERS.map(l => {
            const meta = LAYER_META[l]
            const Icon = meta.icon
            const on = activeLayers.has(l)
            return (
              <Tooltip key={l} arrow title={`${l} · ${meta.label}`}>
                <Chip
                  icon={<Icon size={13} />}
                  label={`${l} ${counts[l]}`}
                  size="small"
                  onClick={() => toggleLayer(l)}
                  sx={{
                    height: 26, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO,
                    border: `1px solid ${alpha(meta.color, on ? 0.6 : 0.25)}`,
                    bgcolor: on ? alpha(meta.color, 0.16) : 'transparent',
                    color: on ? meta.color : 'text.secondary',
                    '& .MuiChip-icon': { color: on ? meta.color : 'inherit', ml: 0.75 },
                    '&:hover': { bgcolor: alpha(meta.color, 0.2) },
                  }}
                />
              </Tooltip>
            )
          })}
        </Box>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={since}
          onChange={(_, v) => { if (v) setSince(v) }}
          sx={{
            ml: 'auto',
            '& .MuiToggleButton-root': {
              textTransform: 'none', px: 1.25, py: 0.25, fontSize: 12, fontWeight: 600, fontFamily: MONO,
            },
          }}
        >
          {SINCE_PRESETS.map(s => <ToggleButton key={s} value={s}>{s}</ToggleButton>)}
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder={t('timeline.search')}
          value={q}
          onChange={e => setQ(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={13} /></InputAdornment>,
            endAdornment: q ? (
              <IconButton
                size="small"
                onClick={() => setQ('')}
                aria-label={t('common.clear')}
                title={t('common.clear')}
                sx={{ p: 0.25 }}
              >
                <X size={12} />
              </IconButton>
            ) : undefined,
            sx: { fontSize: 13 },
          }}
          sx={{ minWidth: 220, '& .MuiInputBase-root': { height: 34 } }}
        />
      </Box>

      {/* Body */}
      {!orgId && (
        <EmptyState label={t('timeline.noOrg')} />
      )}
      {orgId && query.isLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3, color: 'text.secondary' }}>
          <CircularProgress size={16} />
          <Typography sx={{ fontSize: 13 }}>{t('timeline.loading')}</Typography>
        </Box>
      )}
      {orgId && query.isError && (
        <Alert severity="error" sx={{ fontSize: 13 }}>
          {query.error instanceof Error ? query.error.message : String(query.error)}
        </Alert>
      )}
      {/* Genuinely empty (no events in this window at all) → honest,
          actionable explainer of what feeds each layer. Distinct from
          the "filters hide everything" case below. */}
      {orgId && query.data && (query.data.items?.length ?? 0) === 0 && (
        <TimelineEmptyExplainer dark={dark} since={since} />
      )}
      {/* Has events, but the active layer toggles / search hide them. */}
      {orgId && query.data && (query.data.items?.length ?? 0) > 0 && filtered.length === 0 && (
        <FilteredEmptyState
          onReset={() => { setActiveLayers(new Set(ALL_LAYERS)); setQ('') }}
        />
      )}

      {orgId && query.data && filtered.length > 0 && (
        <Box
          className="exp-scroll"
          sx={{
            flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative',
            pl: '30px', pr: 0.5,
          }}
        >
          {/* Spine */}
          <Box aria-hidden sx={{ position: 'absolute', left: 14, top: 6, bottom: 6, width: '2px', bgcolor: alpha(theme.palette.text.primary, 0.14) }} />
          {filtered.map(it => (
            <TimelineRow key={it.id} item={it} onClick={onRowClick} />
          ))}
        </Box>
      )}

      {/* L3 path lifecycle */}
      <PathLifecycleDrawer
        open={!!pathDrawer}
        onClose={() => setPathDrawer(null)}
        orgId={orgId ?? ''}
        pathId={pathDrawer?.id ?? null}
        title={pathDrawer?.title}
      />

      {/* L2 confidence trajectory */}
      <EvidenceDrawer
        open={!!confDrawer}
        onClose={() => setConfDrawer(null)}
        width={560}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Activity size={18} />
            <span>{t('timeline.confidence.drawerTitle')}</span>
          </Box>
        }
        subtitle={confDrawer?.title || (confDrawer ? confDrawer.fp : undefined)}
      >
        {confDrawer && (
          <ConfidenceTrajectory orgId={orgId ?? ''} fingerprint={confDrawer.fp} enabled={!!confDrawer} />
        )}
      </EvidenceDrawer>
    </Box>
  )
}

// ── One timeline row ────────────────────────────────────────────────

function TimelineRow({ item, onClick }: { item: TimelineItem; onClick: (it: TimelineItem) => void }) {
  const theme = useTheme()
  const meta = LAYER_META[item.layer]
  const Icon = meta.icon
  const p = item.payload
  const isL4 = item.layer === 'L4'
  // Drill-in only for L2 (confidence) + L3 (path) rows that carry a subject.
  const drillable = !!item.subject_id && (item.layer === 'L2' || item.layer === 'L3')

  const confidence = typeof p?.confidence === 'number' ? p.confidence : undefined
  const verified = p?.verified === true
  const prov = p?.provenance
  const ProvIcon = provenanceIcon(prov?.source_type)

  return (
    <Box sx={{ position: 'relative', mb: 2, pb: 0.5 }}>
      {/* Rail node */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute', left: '-26px', top: 2,
          width: 22, height: 22, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          color: meta.color,
          border: `2px solid ${meta.color}`,
          bgcolor: theme.palette.background.paper,
        }}
      >
        <Icon size={11} />
      </Box>

      <Box
        onClick={drillable ? () => onClick(item) : undefined}
        sx={{
          borderRadius: 1.5, p: 1.25,
          border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
          bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.02 : 0.015),
          cursor: drillable ? 'pointer' : 'default',
          transition: 'border-color .15s, background .15s',
          '&:hover': drillable ? {
            borderColor: alpha(meta.color, 0.5),
            bgcolor: alpha(meta.color, 0.06),
          } : undefined,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip
            label={`${item.layer} · ${KIND_LABEL[item.kind] ?? item.kind}`}
            size="small"
            sx={{ height: 18, fontSize: 12, fontWeight: 700, fontFamily: MONO, bgcolor: alpha(meta.color, 0.18), color: meta.color }}
          />
          <Typography sx={{ fontSize: 14, fontWeight: 600, minWidth: 0 }}>
            {item.title || KIND_LABEL[item.kind] || item.kind}
          </Typography>

          {/* Confidence chip (L2/L3) */}
          {confidence !== undefined && (
            <Chip
              label={confidence.toFixed(2)}
              size="small"
              sx={{ height: 18, fontSize: 12, fontWeight: 700, fontFamily: MONO, bgcolor: alpha('#a78bfa', 0.18), color: '#a78bfa' }}
            />
          )}

          {/* Verified badge — STRICTLY from the event's own flag. L4 never has one. */}
          {!isL4 && verified && (
            <Tooltip arrow title={(p?.verified_method as string) || t('timeline.verified')}>
              <Chip
                icon={<ShieldCheck size={11} />}
                label={(p?.verified_method as string) || t('timeline.verified')}
                size="small"
                sx={{
                  height: 18, fontSize: 12, fontWeight: 600,
                  bgcolor: alpha('#22c55e', 0.18), color: '#22c55e',
                  '& .MuiChip-icon': { color: '#22c55e', ml: 0.5 },
                }}
              />
            </Tooltip>
          )}

          {drillable && <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
        </Box>

        {item.summary && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>
            {item.summary}
          </Typography>
        )}

        {/* Meta line */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', mt: 0.5 }}>
          <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, color: 'text.secondary', fontFamily: MONO }}>
            <Clock size={11} /> {formatTimestamp(item.ts)}
          </Typography>
          {item.actor && (
            <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, color: 'text.secondary' }}>
              <UserCog size={11} /> {item.actor}
            </Typography>
          )}
          {/* Provenance (L2/L3) — where the signal came from. L4 carries none. */}
          {!isL4 && prov && (prov.source || prov.source_type) && (
            <Tooltip arrow title={t('timeline.provenanceTip')}>
              <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 12, color: 'text.secondary' }}>
                <ProvIcon size={11} /> {prov.source}{prov.source_type ? ` · ${prov.source_type}` : ''}
              </Typography>
            </Tooltip>
          )}
          {/* L4 explicit "operator action, not evidence" note. */}
          {isL4 && (
            <Typography sx={{ fontSize: 12, color: 'text.disabled', fontStyle: 'italic' }}>
              {t('timeline.operatorAction')}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ── Empty states ────────────────────────────────────────────────────
//
// Honest + actionable: when the org has produced ZERO events in the
// window, don't just say "empty" — explain what feeds each layer and
// how to light it up. This is the difference between "useless dead
// page" and "page that's waiting for upstream work".
const EMPTY_LAYER_ROWS: { l: TimelineLayer; fedKey: string; fed: string }[] = [
  { l: 'L1', fedKey: 'timeline.fed.l1', fed: 'Scans, pentests, score changes & alerts' },
  { l: 'L2', fedKey: 'timeline.fed.l2', fed: 'Finding confidence signals (from re-verification)' },
  { l: 'L3', fedKey: 'timeline.fed.l3', fed: 'Attack-path status transitions' },
  { l: 'L4', fedKey: 'timeline.fed.l4', fed: 'Operator decisions & assignments on findings' },
]

function TimelineEmptyExplainer({ dark, since }: { dark: boolean; since: string }) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', placeItems: 'center', py: 4 }}>
      <Box sx={{ maxWidth: 540, width: '100%', px: 2 }}>
        <Box sx={{ textAlign: 'center', mb: 2.5 }}>
          <Box sx={{
            width: 56, height: 56, borderRadius: 2, display: 'inline-grid', placeItems: 'center',
            bgcolor: alpha(BRAND, 0.12), color: BRAND, border: `1px solid ${alpha(BRAND, 0.3)}`, mb: 1.5,
          }}>
            <Layers size={26} />
          </Box>
          <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
            {t('timeline.emptyTitle')}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.55 }}>
            {t('timeline.emptyDesc')}
          </Typography>
        </Box>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, ...techGrid(dark) }}>
          {EMPTY_LAYER_ROWS.map((r, i) => {
            const meta = LAYER_META[r.l]
            const Icon = meta.icon
            return (
              <Box key={r.l} sx={{
                position: 'relative', zIndex: 1,
                display: 'flex', alignItems: 'center', gap: 1.25, px: 1.75, py: 1.25,
                borderBottom: i < EMPTY_LAYER_ROWS.length - 1 ? '1px solid' : 'none', borderColor: 'divider',
              }}>
                <Box sx={{
                  width: 30, height: 30, borderRadius: 1.5, display: 'grid', placeItems: 'center',
                  color: meta.color, bgcolor: alpha(meta.color, 0.14), border: `1px solid ${alpha(meta.color, 0.3)}`, flexShrink: 0,
                }}>
                  <Icon size={15} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: meta.color }}>
                    {r.l} · {meta.label}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {tOr(r.fedKey, r.fed)}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>

        <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', mt: 2, lineHeight: 1.7 }}>
          {t('timeline.emptyHintWindow').replace('{since}', since)}
          <br />
          {t('timeline.emptyHintRun')}
        </Typography>
      </Box>
    </Box>
  )
}

function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 0, textAlign: 'center', px: 2 }}>
      <Box>
        <Layers size={28} style={{ opacity: 0.4 }} />
        <Typography sx={{ fontSize: 13, mt: 1, color: 'text.secondary' }}>
          {t('timeline.filteredEmpty')}
        </Typography>
        <Button size="small" onClick={onReset} sx={{ mt: 1.5, textTransform: 'none', fontFamily: MONO, color: BRAND }}>
          {t('timeline.resetFilters')}
        </Button>
      </Box>
    </Box>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 0, color: 'text.disabled', textAlign: 'center', px: 2 }}>
      <Box>
        <Layers size={28} style={{ opacity: 0.4 }} />
        <Typography sx={{ fontSize: 13, mt: 1, color: 'text.secondary' }}>{label}</Typography>
      </Box>
    </Box>
  )
}
