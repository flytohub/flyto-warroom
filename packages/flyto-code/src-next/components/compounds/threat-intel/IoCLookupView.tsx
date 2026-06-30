/**
 * IoCLookupView — org-scoped IoC search.
 *
 * Layout (operator 2026-05-22: "上面太大... 他不是很重要 然後讓
 * 分頁選單是最底下 表內不可以滾動就好"):
 *   - Compact header (~32px title + lede)
 *   - One-row kind-filter chip strip (no big Paper tiles)
 *   - Feed status + scope toggle inline (single row each, small)
 *   - Search + total inline (single row)
 *   - Table region — Paper with fixed header + body overflow:auto
 *   - Pagination — pinned to bottom of the table card, not floating
 *
 * Header now < 200px total; table gets the remaining viewport.
 *
 * Data source: GET /api/v1/code/orgs/{id}/threat-intel/iocs
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Alert, Box, Typography, Paper, Chip, Skeleton, TextField, InputAdornment,
  IconButton, Button,
} from '@mui/material'
import {
  Search, X, Database, Globe, Server, ShieldAlert, Key, Bug, Archive,
  ChevronLeft, ChevronRight, Compass,
} from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listIoCs, listFeedStatus, type IoCFilter, type IoCRow } from '@lib/engine'
import { KIND_TONE } from '@lib/tokens/severity'
import { colors } from '@/styles/designTokens'
import { QueryError } from '@atoms/QueryError'

const PAGE_SIZE = 100

// Wave-1 BE superset: /iocs now returns empty_reason to distinguish
// "no attack surface mapped" from "surface mapped, nothing seen yet".
// The engine client typing (lib/engine/code/threatIntel.ts) is owned
// by another lane and doesn't declare it, so we read it through a local
// superset — honest field access, no fabricated rows.
type IoCEmptyReason = '' | 'no_attack_surface' | 'no_iocs'

// Kind meta combines label + icon (UI-local) with the tone from
// the centralized palette (@lib/tokens).
const KIND_META: Record<string, { label: string; icon: typeof Database; tone: string }> = {
  c2:         { label: 'C2',         icon: Server,      tone: KIND_TONE.c2.tone },
  url:        { label: 'URL',        icon: Globe,       tone: KIND_TONE.url.tone },
  ip:         { label: 'IP',         icon: ShieldAlert, tone: KIND_TONE.ip.tone },
  phishing:   { label: 'Phishing',   icon: Bug,         tone: KIND_TONE.phishing.tone },
  credential: { label: 'Credential', icon: Key,         tone: KIND_TONE.credential.tone },
  stealer:    { label: 'Stealer',    icon: Bug,         tone: KIND_TONE.stealer.tone },
  breach:     { label: 'Breach',     icon: Archive,     tone: KIND_TONE.breach.tone },
}

// Render-time label resolver — KIND_META is built at module load (before
// i18n init), so wrapping labels in the const would freeze the raw key.
// Resolve translatable kind labels here, at render time, falling back to
// the meta label so unlisted kinds keep working.
function kindLabel(kind: string, fallback: string): string {
  switch (kind) {
    case 'phishing':   return t('threatIntel.kind.phishing')
    case 'credential': return t('threatIntel.kind.credential')
    case 'stealer':    return t('threatIntel.kind.stealer')
    case 'breach':     return t('threatIntel.kind.breach')
    default:           return fallback
  }
}

function dateLabel(iso?: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Compact number formatter so 5298 → 5.3k, keeps the chip strip
// readable when feed catalogs grow.
function compactNum(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return (n / 1000).toFixed(1) + 'k'
  if (n < 1_000_000) return Math.round(n / 1000) + 'k'
  return (n / 1_000_000).toFixed(1) + 'M'
}

function isDiagnosticIoC(row: IoCRow): boolean {
  return /not assessed|\(missing:|not indexed by shodan/i.test(row.ioc)
}

export function IoCLookupView({ presetKind, title, lede }: { presetKind?: string; title?: string; lede?: string } = {}) {
  const { org } = useOrg()
  const orgId = org?.id
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  // presetKind pins the view to one IoC kind (e.g. BotShield → 'c2') and
  // hides the kind-filter strip, so the same component backs focused pages.
  const [kind, setKind] = useState(presetKind ?? '')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  const [scope, setScope] = useState<'org' | 'global' | 'both'>('both')

  useEffect(() => { setPage(0) }, [searchTerm, kind, scope])

  const filter: IoCFilter & { scope?: 'org' | 'global' | 'both' } = {
    q: searchTerm || undefined,
    kind: kind || undefined,
    scope,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.threatIntel.iocLookup(orgId, kind, searchTerm, scope, page),
    queryFn: () => listIoCs(orgId!, filter),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const { data: feedStatus } = useQuery({
    queryKey: qk.threatIntel.feedStatus(orgId),
    queryFn: () => listFeedStatus(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const rows = data?.iocs ?? []
  const emptyReason: IoCEmptyReason = (data as { empty_reason?: IoCEmptyReason } | undefined)?.empty_reason ?? ''
  const diagnosticRows = useMemo(() => rows.filter(isDiagnosticIoC), [rows])
  const displayRows = useMemo(() => rows.filter(row => !isDiagnosticIoC(row)), [rows])
  const orgStats = data?.stats ?? {}
  const globalStats = data?.global_stats ?? {}
  const stats = useMemo(() => {
    if (diagnosticRows.length > 0) {
      return displayRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.kind] = (acc[row.kind] ?? 0) + 1
        return acc
      }, {})
    }
    if (scope === 'org') return orgStats
    if (scope === 'global') return globalStats
    const merged: Record<string, number> = { ...globalStats }
    for (const [key, value] of Object.entries(orgStats)) {
      merged[key] = (merged[key] ?? 0) + value
    }
    return merged
  }, [diagnosticRows.length, displayRows, globalStats, orgStats, scope])
  const total = Object.values(stats).reduce((a, b) => a + b, 0)

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header — compact. Title shrunk from text-3xl to text-xl
          (operator: "他不是很重要"). Lede dropped to text-xs.
          The previous 7-tile Paper grid (~140px) is now a single
          chip strip on one row. */}
      <Box sx={{
        flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 1.5, md: 2 }, pb: 1.5,
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        {/* Title row — title + total on same line so we save
            another ~30px vs stacked. */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ pl: 1.25, borderLeft: '3px solid', borderColor: colors.section.exposure }}>
            <Typography component="h1" sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
              {title ?? t('threatIntel.iocLookup')}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
              {lede ?? t('threatIntel.iocLookupLede')}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
            {t('threatIntel.totalIndicators')}: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString()}</strong>
          </Typography>
        </Box>

        {/* Kind filter chip strip — hidden when the view is pinned to one
            kind (e.g. BotShield). */}
        {!presetKind && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
          {Object.entries(KIND_META).map(([k, meta]) => {
            const n = stats[k] ?? 0
            const isActive = kind === k
            const Icon = meta.icon
            return (
              <Chip
                key={k}
                size="small"
                onClick={() => setKind(isActive ? '' : k)}
                icon={<Icon size={12} style={{ color: isActive ? '#fff' : meta.tone }} />}
                label={
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{compactNum(n)}</span>
                    <span style={{ fontSize: 12, opacity: 0.85 }}>{kindLabel(k, meta.label)}</span>
                  </span>
                }
                sx={{
                  height: 24, fontSize: 12, cursor: 'pointer',
                  bgcolor: isActive ? meta.tone : 'transparent',
                  color: isActive ? '#fff' : 'text.primary',
                  border: '1px solid', borderColor: isActive ? meta.tone : 'divider',
                  '&:hover': { bgcolor: isActive ? meta.tone : `${meta.tone}1f` },
                }}
              />
            )
          })}
        </Box>
        )}

        {/* Scope toggle + feed status — single row, scope on left,
            feed chips on right. Wraps on narrow viewports. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('threatIntel.scope')}
          </Typography>
          {(['both', 'org', 'global'] as const).map(s => (
            <Chip
              key={s}
              size="small"
              label={
                s === 'both'
                  ? t('threatIntel.scopeBoth')
                  : s === 'org'
                    ? t('threatIntel.scopeOrg')
                    : t('threatIntel.scopeGlobal')
              }
              onClick={() => setScope(s)}
              sx={{
                height: 22, fontSize: 12, cursor: 'pointer',
                bgcolor: scope === s ? 'primary.main' : 'action.hover',
                color: scope === s ? 'primary.contrastText' : 'text.primary',
                '&:hover': { bgcolor: scope === s ? 'primary.dark' : 'action.selected' },
              }}
            />
          ))}

          {/* Divider */}
          <Box sx={{ width: 1, height: 14, bgcolor: 'divider', mx: 0.5 }} />

          {/* Feed status chips — last refresh per source. */}
          {feedStatus && feedStatus.feeds.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, ml: 'auto' }}>
              {feedStatus.feeds.map(f => {
                const lastOk = f.last_ok_at ? new Date(f.last_ok_at) : null
                const ageMin = lastOk ? Math.round((Date.now() - lastOk.getTime()) / 60000) : null
                const hasError = !!f.last_error
                const tone = hasError ? '#ef4444' : (ageMin !== null && ageMin < 60 ? '#22c55e' : '#94a3b8')
                const label = ageMin !== null
                  ? `${ageMin}m`
                  : (hasError ? 'err' : '·')
                return (
                  <Chip
                    key={f.source}
                    size="small"
                    label={`${f.source}·${compactNum(f.rows_ingested)}·${label}`}
                    sx={{ fontSize: 12, height: 18, color: tone, borderColor: tone, bgcolor: 'transparent' }}
                    variant="outlined"
                    title={hasError ? f.last_error : (lastOk ? `Last OK: ${lastOk.toLocaleString()}` : 'No successful run yet')}
                  />
                )
              })}
            </Box>
          )}
        </Box>

        {/* Search row — compact. Selected kind chip flows here for
            dismissal. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25 }}>
          <TextField
            size="small"
            placeholder={t('threatIntel.iocSearch')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            sx={{ flex: 1, maxWidth: 420 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setSearchInput('')}
                    aria-label={t('common.clear')}
                    title={t('common.clear')}
                  >
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          {kind && (
            <Chip
              size="small"
              label={`${t('threatIntel.kind')}: ${kindLabel(kind, KIND_META[kind]?.label ?? kind)}`}
              onDelete={() => setKind('')}
              sx={{ fontSize: 12 }}
            />
          )}
        </Box>
        {diagnosticRows.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1, py: 0, fontSize: 12 }}>
            {t('threatIntel.diagnosticsHidden')}
          </Alert>
        )}
      </Box>

      {/* Body — table region with internal scroll + pinned pagination.
          One Paper card fills the remaining viewport; table header
          stays put while the row list scrolls inside. Pagination
          glues to the bottom of the same card so it's always
          visible without page-level scroll. */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', px: { xs: 2, md: 4 }, py: 2 }}>
        {isError && (
          <QueryError error={error} onRetry={refetch} label={t('threatIntel.iocLookupError')} compact />
        )}
        {isLoading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={48} />)}
          </Box>
        )}
        {!isLoading && !isError && displayRows.length === 0 && (() => {
          // A search/kind filter producing zero is a genuine "no match"
          // regardless of empty_reason. Only when nothing is filtered do
          // we surface the engine's honest reason for the blank.
          const hasFilter = !!searchTerm || !!kind
          if (!hasFilter && emptyReason === 'no_attack_surface') {
            return (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                <Compass size={28} style={{ opacity: 0.6, marginBottom: 12 }} />
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('threatIntel.iocNoSurface')}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Compass size={14} />}
                  onClick={() => orgId && navigate(`/projects/${orgId}/domains`)}
                >
                  {t('threatIntel.runDiscovery')}
                </Button>
              </Paper>
            )
          }
          return (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {hasFilter
                  ? t('threatIntel.noIoCs')
                  : t('threatIntel.iocNothingSeen')}
              </Typography>
            </Paper>
          )
        })()}
        {!isLoading && !isError && displayRows.length > 0 && (
          <Paper
            variant="outlined"
            sx={{
              flex: 1, minHeight: 0,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Sticky table header */}
            <Box sx={{
              flexShrink: 0,
              display: 'grid',
              gridTemplateColumns: '110px 1fr 110px 110px 100px',
              gap: 1, alignItems: 'center',
              px: 2, py: 1.25,
              borderBottom: '1px solid', borderColor: 'divider',
              fontSize: 12, fontWeight: 700, color: 'text.secondary',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              bgcolor: 'action.hover',
            }}>
              <span>{t('threatIntel.col.kind')}</span>
              <span>{t('threatIntel.col.indicator')}</span>
              <span>{t('threatIntel.col.firstSeen')}</span>
              <span>{t('threatIntel.col.lastSeen')}</span>
              <span>{t('threatIntel.col.source')}</span>
            </Box>

            {/* Scrollable row list — fills the rest of the card */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {displayRows.map((r, i) => {
                const meta = KIND_META[r.kind] ?? { label: r.kind, icon: Database, tone: '#94a3b8' }
                const Icon = meta.icon
                return (
                  <Box
                    key={`${r.ioc}-${i}`}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 110px 110px 100px',
                      gap: 1, alignItems: 'center',
                      px: 2, py: 1.5,
                      borderBottom: '1px solid', borderColor: 'divider',
                      fontSize: 13,
                      '&:last-child': { borderBottom: 'none' },
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Chip
                      size="small"
                      icon={<Icon size={12} />}
                      label={kindLabel(r.kind, meta.label)}
                      sx={{ fontSize: 12, height: 22, color: meta.tone, borderColor: meta.tone, bgcolor: 'transparent' }}
                      variant="outlined"
                    />
                    <Typography sx={{
                      fontSize: 12, fontFamily: 'monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.ioc}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{dateLabel(r.first_seen_at)}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{dateLabel(r.last_seen_at)}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{r.source || '—'}</Typography>
                  </Box>
                )
              })}
            </Box>

            {/* Pagination — pinned bottom of card */}
            <Box sx={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5,
              px: 2, py: 1,
              borderTop: '1px solid', borderColor: 'divider',
              bgcolor: 'action.hover',
            }}>
              <Typography variant="caption" color="text.secondary">
                {t('threatIntel.page')} {page + 1} · {displayRows.length} {t('threatIntel.rows')}
              </Typography>
              <IconButton
                size="small"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                aria-label={t('common.previousPage')}
                title={t('common.previousPage')}
              >
                <ChevronLeft size={16} />
              </IconButton>
              <IconButton
                size="small"
                disabled={displayRows.length < PAGE_SIZE}
                onClick={() => setPage(p => p + 1)}
                aria-label={t('common.nextPage')}
                title={t('common.nextPage')}
              >
                <ChevronRight size={16} />
              </IconButton>
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  )
}
