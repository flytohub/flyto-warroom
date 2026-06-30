/**
 * FootprintListView.tsx — 2D sortable list view (the default).
 *
 * Extracted from FootprintGraphView.tsx 2026-05-23. Operators
 * don't need a 3D scene to answer "what did the expander find?" —
 * they need a sortable list with entity-type buckets at the top
 * and the discovery signal inline.
 *
 * Self-contained: tier filter state + virtualized rows. Receives
 * the full entity list + signal map from the parent orchestrator.
 */
import { useMemo, useState } from 'react'
import {
  Box, Stack, Typography, Chip, Paper, MenuItem, Select, type SelectChangeEvent,
} from '@mui/material'
import {
  promotionTier, relationshipScore,
  type ActionabilityTier, type FootprintEntity, type FootprintSignalKind,
} from '@lib/engine'
import { typeMeta, SIGNAL_GLOW, isInconclusiveDocument } from './scene'
import {
  TIER_BADGE, ACTIONABILITY_BADGE,
  actionabilityKey, type TierFilter,
} from './shared'
import { ScoreGauge } from './SelectedDetail'
import { t, tOr } from '@lib/i18n';

type ScopeLane = 'owned' | 'vendor' | 'candidate' | 'context' | 'all'

const SCOPE_LANE: Record<Exclude<ScopeLane, 'all'>, { label: string; labelKey: string; accent: string; bg: string }> = {
  owned: { label: 'Core / owned', labelKey: 'footprint.scopeLane.owned', accent: '#38bdf8', bg: 'rgba(56,189,248,0.10)' },
  vendor: { label: 'Vendors', labelKey: 'footprint.scopeLane.vendor', accent: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  candidate: { label: 'Candidates', labelKey: 'footprint.scopeLane.candidate', accent: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
  context: { label: 'Context', labelKey: 'footprint.scopeLane.context', accent: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
}

function entityMetadata(e: FootprintEntity): Record<string, unknown> {
  if (!e.metadata) return {}
  if (typeof e.metadata === 'string') {
    try {
      const parsed = JSON.parse(e.metadata)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return typeof e.metadata === 'object' ? e.metadata as Record<string, unknown> : {}
}

function entityScopeLane(e: FootprintEntity): Exclude<ScopeLane, 'all'> {
  const meta = entityMetadata(e)
  const bucket = typeof meta.scope_bucket === 'string' ? meta.scope_bucket : ''
  if (bucket === 'vendor_operated') return 'vendor'
  if (bucket === 'external_context') return 'context'
  if (bucket === 'candidate') return 'candidate'
  if (bucket === 'core_owned' || bucket === 'owned_asset') return 'owned'
  if (e.type === 'vendor') return 'vendor'
  if (e.status === 'pending' || promotionTier(e) === 'candidate') return 'candidate'
  return 'owned'
}

function matchesScopeLane(e: FootprintEntity, lane: ScopeLane): boolean {
  return lane === 'all' || entityScopeLane(e) === lane
}

function sectionKey(e: FootprintEntity): string {
  return `${entityScopeLane(e)}:${e.type}`
}

function splitSectionKey(key: string): [Exclude<ScopeLane, 'all'>, string] {
  const idx = key.indexOf(':')
  if (idx < 0) return ['owned', key]
  return [key.slice(0, idx) as Exclude<ScopeLane, 'all'>, key.slice(idx + 1)]
}

export interface ListViewProps {
  entities: FootprintEntity[]
  signalByEntity: Map<string, FootprintSignalKind>
  selectedId: string | null
  onSelect: (id: string) => void
}

export function FootprintListView({ entities, signalByEntity, selectedId, onSelect }: ListViewProps) {
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [scopeFilter, setScopeFilter] = useState<ScopeLane>('all')

  // Filter legacy "not assessed (missing: hibp_api_key)" Document
  // rows once at the top so type buckets + table both honour the
  // hide rule.
  const cleanEntities = useMemo(() => entities.filter(e => !isInconclusiveDocument(e)), [entities])

  const scopeBuckets = useMemo(() => {
    const buckets: Record<Exclude<ScopeLane, 'all'>, number> = {
      owned: 0,
      vendor: 0,
      candidate: 0,
      context: 0,
    }
    for (const e of cleanEntities) buckets[entityScopeLane(e)]++
    return buckets
  }, [cleanEntities])

  const scopedEntities = useMemo(
    () => cleanEntities.filter(e => matchesScopeLane(e, scopeFilter)),
    [cleanEntities, scopeFilter],
  )

  const typeBuckets = useMemo(() => {
    const buckets: Record<string, number> = {}
    for (const e of scopedEntities) {
      buckets[e.type] = (buckets[e.type] ?? 0) + 1
    }
    return Object.entries(buckets).sort((a, b) => b[1] - a[1])
  }, [scopedEntities])

  // Per-actionability counts for the top buckets — what operators
  // actually want to see at a glance ("how many should I test?").
  const actionabilityBuckets = useMemo(() => {
    const buckets: Record<ActionabilityTier | 'none', number> = {
      red_team_actionable: 0,
      needs_more_evidence: 0,
      informational: 0,
      rejected: 0,
      none: 0,
    }
    for (const e of scopedEntities) {
      const k = actionabilityKey(e)
      buckets[k]++
    }
    return buckets
  }, [scopedEntities])

  // Group entities by type AFTER filtering by tier — gives the list
  // a "sections of similar things" feel rather than a long mixed
  // table. Inside each group rows are sorted by score desc.
  const grouped = useMemo(() => {
    const filtered = tierFilter === 'all'
      ? scopedEntities
      : scopedEntities.filter(e => {
          if (tierFilter === 'red_team_actionable' || tierFilter === 'needs_more_evidence' || tierFilter === 'informational' || tierFilter === 'rejected') {
            return actionabilityKey(e) === tierFilter
          }
          return promotionTier(e) === tierFilter
        })
    const sorted = [...filtered].sort((a, b) => relationshipScore(b) - relationshipScore(a))
    const groups = new Map<string, FootprintEntity[]>()
    for (const e of sorted) {
      const key = sectionKey(e)
      const arr = groups.get(key) ?? []
      arr.push(e)
      groups.set(key, arr)
    }
    const laneOrder: Record<Exclude<ScopeLane, 'all'>, number> = { owned: 0, vendor: 1, context: 2, candidate: 3 }
    return Array.from(groups.entries()).sort(([aKey, aList], [bKey, bList]) => {
      const [aLane, aType] = splitSectionKey(aKey)
      const [bLane, bType] = splitSectionKey(bKey)
      if (laneOrder[aLane] !== laneOrder[bLane]) return laneOrder[aLane] - laneOrder[bLane]
      if (aList.length !== bList.length) return bList.length - aList.length
      return aType.localeCompare(bType)
    })
  }, [scopedEntities, tierFilter])

  return (
    <Stack spacing={2.5} sx={{ p: 2.5, height: '100%', overflow: 'auto' }}>
      {/* Scope lanes keep owned domains, vendors, and unconfirmed leads separate
          even when hundreds of domains enter the footprint graph. */}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {(['owned', 'vendor', 'candidate', 'context', 'all'] as const).map(lane => {
          const selected = scopeFilter === lane
          const n = lane === 'all' ? cleanEntities.length : scopeBuckets[lane]
          const cfg = lane === 'all'
            ? { label: 'All', labelKey: 'footprint.scopeLane.all', accent: '#64748b', bg: 'rgba(100,116,139,0.10)' }
            : SCOPE_LANE[lane]
          return (
            <Chip
              key={lane}
              size="small"
              onClick={() => setScopeFilter(selected && lane !== 'all' ? 'all' : lane)}
              label={`${tOr(cfg.labelKey, cfg.label)} · ${n}`}
              variant={selected ? 'filled' : 'outlined'}
              sx={{
                borderRadius: 1.5,
                fontSize: 13,
                fontWeight: selected ? 700 : 500,
                color: selected ? cfg.accent : 'text.secondary',
                borderColor: selected ? cfg.accent : 'divider',
                bgcolor: selected ? cfg.bg : 'transparent',
                '&:hover': { bgcolor: cfg.bg },
              }}
            />
          )
        })}
      </Stack>

      {/* Actionability summary — the "what to test next" view. Each
          bucket is clickable; clicking filters the list to that tier. */}
      <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap">
        {(['red_team_actionable', 'needs_more_evidence', 'informational', 'rejected'] as const).map(tier => {
          const cfg = ACTIONABILITY_BADGE[tier]
          const n = actionabilityBuckets[tier]
          const selected = tierFilter === tier
          return (
            <Paper
              key={tier}
              onClick={() => setTierFilter(selected ? 'all' : tier)}
              variant="outlined"
              sx={{
                px: 1.5, py: 1, cursor: 'pointer', borderRadius: 1.5,
                borderLeft: `3px solid ${cfg.ring}`,
                bgcolor: selected ? `${cfg.ring}15` : 'background.paper',
                transition: 'all 160ms ease',
                '&:hover': { bgcolor: `${cfg.ring}10` },
                minWidth: 140,
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: cfg.ring, letterSpacing: '0.02em' }}>
                {cfg.label}
              </Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 700, color: 'text.primary', lineHeight: 1.1 }}>
                {n}
              </Typography>
            </Paper>
          )
        })}
      </Stack>

      {/* Type buckets + secondary filter row */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        {typeBuckets.map(([type, n]) => {
          const { Icon, label } = typeMeta(type)
          return (
            <Chip
              key={type}
              size="small"
              icon={<Box sx={{ display: 'flex', pl: 0.5 }}><Icon size={13} /></Box>}
              label={`${label} · ${n}`}
              variant="outlined"
              sx={{ fontSize: 13, fontWeight: 500, borderRadius: 1.5 }}
            />
          )
        })}
        <Box sx={{ flex: 1 }} />
        <Select
          size="small"
          value={tierFilter}
          onChange={(e: SelectChangeEvent) => setTierFilter(e.target.value as TierFilter)}
          sx={{ minWidth: 200, fontSize: 13, borderRadius: 1.5 }}
        >
          <MenuItem value="all">{t('footprint.tierFilter.all')}</MenuItem>
          <MenuItem value="red_team_actionable">{t('footprint.tierFilter.redTeamActionable')}</MenuItem>
          <MenuItem value="needs_more_evidence">{t('footprint.tierFilter.needsMoreEvidence')}</MenuItem>
          <MenuItem value="informational">{t('footprint.tierFilter.informational')}</MenuItem>
          <MenuItem value="confirmed">{t('footprint.tierFilter.confirmed')}</MenuItem>
          <MenuItem value="candidate">{t('footprint.tierFilter.candidate')}</MenuItem>
          <MenuItem value="weak">{t('footprint.tierFilter.weak')}</MenuItem>
        </Select>
      </Stack>

      {grouped.length === 0 && (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('footprint.noEntitiesAtTier')}
          </Typography>
        </Paper>
      )}

      {grouped.map(([key, list]) => {
        const [lane, type] = splitSectionKey(key)
        const { Icon, label } = typeMeta(type)
        const laneMeta = SCOPE_LANE[lane]
        return (
          <Box key={key}>
            {/* Section header — icon, label, count */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, ml: 0.5 }}>
              <Box sx={{
                width: 22, height: 22, borderRadius: '50%',
                bgcolor: 'action.hover',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'text.secondary',
              }}>
                <Icon size={13} />
              </Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {laneMeta.label} · {label}
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{list.length}</Typography>
            </Stack>

            <Stack spacing={0.75}>
              {list.map(e => {
                const tier = promotionTier(e)
                const badge = TIER_BADGE[tier] ?? TIER_BADGE.unknown
                const signal = signalByEntity.get(e.id)
                const isSel = e.id === selectedId
                const score = relationshipScore(e)
                const aKey = actionabilityKey(e)
                const aCfg = ACTIONABILITY_BADGE[aKey]
                return (
                  <Paper
                    key={e.id}
                    variant="outlined"
                    onClick={() => onSelect(e.id)}
                    sx={{
                      p: 1.5,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      borderRadius: 1.5,
                      borderLeft: `3px solid ${badge.accent}`,
                      transition: 'all 160ms ease',
                      bgcolor: isSel ? 'action.selected' : 'background.paper',
                      boxShadow: isSel ? '0 2px 12px rgba(124,58,237,0.12)' : 'none',
                      '&:hover': {
                        bgcolor: isSel ? 'action.selected' : 'action.hover',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
                      },
                    }}
                  >
                    {/* Name + source row */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{
                        fontSize: 14,
                        fontWeight: 500,
                        fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace',
                        color: 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {e.canonical_name}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                          {e.source || '—'}
                        </Typography>
                        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>·</Typography>
                        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                          {t('footprint.listView.depth')} {e.depth}
                        </Typography>
                        {signal && (
                          <>
                            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>·</Typography>
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                              <Box sx={{
                                width: 6, height: 6, borderRadius: '50%',
                                bgcolor: SIGNAL_GLOW[signal],
                                animation: signal === 'newly_exposed' ? 'pulse 1.5s ease-in-out infinite' : undefined,
                                '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                              }} />
                              <Typography sx={{ fontSize: 13, color: 'text.secondary', textTransform: 'capitalize' }}>
                                {signal.replace('_', ' ')}
                              </Typography>
                            </Box>
                          </>
                        )}
                      </Stack>
                    </Box>

                    {/* Score gauge */}
                    <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                      <ScoreGauge score={score} tier={tier} />
                    </Box>

                    {/* Actionability badge — primary signal */}
                    {aKey !== 'none' && (
                      <Chip
                        size="small"
                        label={aCfg.label}
                        sx={{
                          fontSize: 13, fontWeight: 600, minWidth: 144,
                          bgcolor: aCfg.bg, color: aCfg.fg,
                          '& .MuiChip-label': { px: 1.25 },
                        }}
                      />
                    )}
                    {/* Promotion tier — secondary */}
                    <Chip
                      size="small"
                      label={badge.label}
                      color={badge.color}
                      variant="outlined"
                      sx={{ fontSize: 13, fontWeight: 500, minWidth: 84 }}
                    />
                  </Paper>
                )
              })}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
