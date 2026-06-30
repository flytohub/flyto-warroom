import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, ChevronRight, Filter, ShieldCheck, Target,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { getOrgArchMap, getOrgTaintFlows, type TaintFlowRow } from '@lib/engine'
import { Pagination } from '@atoms/Pagination'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { QueryError } from '@atoms/QueryError'
import { Empty, Loading, ScanViewRoot } from './_shared'
import {
  Box,
  Chip,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material'

// ── Reachability / Taint analysis — left: repos, right: flows ──

export function ReachabilityView() {
  const { org } = useOrg()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.repos.archMap(org?.id),
    queryFn: () => getOrgArchMap(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })
  const { data: flowsData, isLoading: flowsLoading } = useQuery({
    queryKey: qk.scanning.taintFlows(org?.id),
    queryFn: () => getOrgTaintFlows(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })
  const flows = flowsData?.flows ?? []
  const repos = data?.repos ?? []

  const totals = useMemo(() => {
    let sources = 0, sinks = 0, unsanitized = 0, sanitized = 0
    for (const r of repos) {
      sources += r.taint_sources ?? 0
      sinks += r.taint_sinks ?? 0
      unsanitized += r.taint_unsanitized ?? 0
      sanitized += r.taint_sanitized ?? 0
    }
    const total = unsanitized + sanitized
    const sanitizedPct = total > 0 ? Math.round((sanitized / total) * 100) : 0
    return { sources, sinks, unsanitized, sanitized, sanitizedPct }
  }, [repos])

  const rows = useMemo(
    () => repos
      .filter(r => (r.taint_sources ?? 0) + (r.taint_sinks ?? 0) > 0)
      .map(r => ({
        repo_id: r.repo_id,
        name: r.name,
        sources: r.taint_sources ?? 0,
        sinks: r.taint_sinks ?? 0,
        unsanitized: r.taint_unsanitized ?? 0,
        sanitized: r.taint_sanitized ?? 0,
      }))
      .sort((a, b) => b.unsanitized - a.unsanitized || b.sinks - a.sinks),
    [repos],
  )

  const [selectedRepo, setSelectedRepo] = useState<string>('')

  // Loading / error / empty
  if (isLoading) return <ScanViewRoot><Loading /></ScanViewRoot>
  if (isError) {
    return (
      <ScanViewRoot>
        <QueryError error={error} onRetry={refetch} label={t('warroom.reachTitle')} compact />
      </ScanViewRoot>
    )
  }
  if (rows.length === 0) {
    return (
      <ScanViewRoot>
        <Empty
          icon={Target}
          text={t('warroom.reachEmptyTitle')}
          description={t('warroom.reachEmptyDesc')}
        />
      </ScanViewRoot>
    )
  }

  return (
    <ScanViewRoot>
      <FlytoPageHeader
        title={t('warroom.reachTitle')}
        subtitle={`${totals.sources.toLocaleString('en-US')} sources · ${totals.sinks.toLocaleString('en-US')} sinks · ${rows.length} repos`}
        action={
          <Box className="flex items-center gap-3">
            {totals.unsanitized > 0 && (
              <Chip
                label={`${totals.unsanitized} unsanitized`}
                size="small"
                color="error"
                sx={{ fontWeight: 700, fontSize: 13, height: 24 }}
              />
            )}
            <Box className="flex items-center gap-1">
              <ShieldCheck size={14} style={{ color: '#22c55e' }} />
              <Typography variant="body2" color="success.main" fontWeight={700}>
                {totals.sanitizedPct}%
              </Typography>
            </Box>
          </Box>
        }
      />

      {/* Left-right split */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 2 }}>

        {/* Left — repo list with taint stats */}
        <Paper
          elevation={0}
          className="rounded-xl"
          sx={{
            bgcolor: 'background.paper', border: 1, borderColor: 'divider',
            width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Column labels */}
          <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            <Box className="flex items-center gap-1">
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {t('warroom.repoName')}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ width: 32, textAlign: 'right' }} title={t('reachability.sources')}>
                Src
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ width: 32, textAlign: 'right' }} title={t('reachability.sinks')}>
                Snk
              </Typography>
              <Typography variant="caption" color="error.main" sx={{ width: 32, textAlign: 'right', fontWeight: 700 }} title={t('reachability.unsanitized')}>
                !
              </Typography>
            </Box>
          </Box>

          {/* Repo list — scrollable */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {rows.map(r => {
              const isSelected = r.name === selectedRepo
              return (
                <Box
                  key={r.repo_id}
                  component="button"
                  onClick={() => setSelectedRepo(isSelected ? '' : r.name)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    width: '100%', textAlign: 'left',
                    px: 2, py: 1.5,
                    background: 'none', border: 'none', cursor: 'pointer',
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    borderLeft: isSelected ? '3px solid' : '3px solid transparent',
                    borderColor: isSelected ? 'error.main' : 'transparent',
                    '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={isSelected ? 700 : 500}
                    color="text.primary"
                    noWrap
                    sx={{ flex: 1, minWidth: 0, fontSize: 13 }}
                  >
                    {r.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 32, textAlign: 'right', fontSize: 13 }}>
                    {r.sources}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 32, textAlign: 'right', fontSize: 13 }}>
                    {r.sinks}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      width: 32, textAlign: 'right', fontSize: 13, fontWeight: 700,
                      color: r.unsanitized > 0 ? 'error.main' : 'text.secondary',
                    }}
                  >
                    {r.unsanitized}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        </Paper>

        {/* Right — flow detail */}
        <ReachFlowsPanel flows={flows} loading={flowsLoading} repoFilter={selectedRepo} />
      </Box>
    </ScanViewRoot>
  )
}

// ── Per-flow detail panel ──────────────────────────────

function ReachFlowsPanel({ flows, loading, repoFilter }: { flows: TaintFlowRow[]; loading: boolean; repoFilter: string }) {
  const [search, setSearch] = useState('')
  const [sevFilter, setSevFilter] = useState<string>('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return flows.filter(f => {
      if (sevFilter && (f.severity ?? '').toUpperCase() !== sevFilter) return false
      if (repoFilter && f.repo_name !== repoFilter) return false
      if (q
        && !(f.sink_file ?? '').toLowerCase().includes(q)
        && !(f.source_file ?? '').toLowerCase().includes(q)
        && !(f.category ?? '').toLowerCase().includes(q)
        && !(f.sink ?? '').toLowerCase().includes(q)
        && !(f.source ?? '').toLowerCase().includes(q)
      ) return false
      return true
    })
  }, [flows, search, sevFilter, repoFilter])

  const PAGE_SIZE = 50
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [search, sevFilter, repoFilter])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <Paper
      elevation={0}
      className="rounded-xl"
      sx={{
        bgcolor: 'background.paper', border: 1, borderColor: 'divider',
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* Filters — pinned top */}
      <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box className="flex items-center gap-2 flex-wrap">
          <TextField
            size="small"
            placeholder={t('warroom.reachFlowSearch')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Filter size={14} />
                  </InputAdornment>
                ),
                sx: { fontSize: 13 },
              },
            }}
            sx={{ flex: 1, minWidth: 160 }}
          />
          <FlytoSelect
            value={sevFilter}
            onChange={setSevFilter}
            placeholder={t('warroom.actionAllSeverities')}
            options={[
              { value: '',         label: t('warroom.actionAllSeverities') },
              { value: 'CRITICAL', label: t('common.critical') },
              { value: 'HIGH',     label: t('common.high') },
              { value: 'MEDIUM',   label: t('common.medium') },
              { value: 'LOW',      label: t('common.low') },
            ]}
            minWidth={130}
            maxWidth={160}
            aria-label={t('warroom.actionAllSeverities')}
          />
          <Chip
            label={`${filtered.length} / ${flows.length}`}
            size="small"
            sx={{ height: 22, fontSize: 13, fontWeight: 600 }}
          />
        </Box>
      </Box>

      {/* Flow list — scrollable */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, minHeight: 0 }}>
        {loading && <Loading />}

        {!loading && flows.length === 0 && (
          <Box className="flex flex-col items-center gap-2 py-12">
            <Target size={32} style={{ opacity: 0.15 }} />
            <Typography variant="body2" color="text.secondary">
              {t('warroom.reachFlowsEmpty')}
            </Typography>
          </Box>
        )}

        {!loading && flows.length > 0 && filtered.length === 0 && (
          <Box className="flex flex-col items-center gap-2 py-12">
            <Filter size={32} style={{ opacity: 0.15 }} />
            <Typography variant="body2" color="text.secondary">
              {t('warroom.findingNoMatch')}
            </Typography>
          </Box>
        )}

        {pageItems.length > 0 && (
          <Box component="ul" className="flex flex-col gap-1" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {pageItems.map((f, i) => (
              <ReachFlowRow key={`${f.repo_id}-${i}-${f.sink_file ?? ''}-${f.sink_line ?? 0}`} flow={f} />
            ))}
          </Box>
        )}
      </Box>

      {/* Pagination — pinned bottom */}
      {filtered.length > PAGE_SIZE && (
        <Box sx={{ px: 2, py: 1, flexShrink: 0, borderTop: 1, borderColor: 'divider' }}>
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </Box>
      )}
    </Paper>
  )
}

// ── Sub-components ─────────────────────────

const SEV_COLOR_REACH: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  MODERATE: '#eab308',
  LOW:      '#94a3b8',
}

function TaintTrace({ path }: { path: string[] }) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {path.map((hop, i) => {
        const parts = hop.split(':')
        const file = parts.length >= 3 ? parts[0] : ''
        const func = parts.length >= 3 ? parts[parts.length - 2] : ''
        const line = parts.length >= 3 ? parts[parts.length - 1] : ''
        const fnLower = func.toLowerCase()
        const isSanitizer = /sanitiz|escape|validate|html_escape|encode/.test(fnLower)
        const isSource = i === 0
        const isSink = i === path.length - 1
        const accent = isSource ? '#a5b4fc' : isSink ? '#fdba74' : isSanitizer ? '#22c55e' : undefined
        const tag = isSource ? 'source' : isSink ? 'sink' : isSanitizer ? 'sanitizer' : ''
        if (parts.length < 3) {
          return (
            <li key={i}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }} color="text.secondary">
                {hop}
              </Typography>
            </li>
          )
        }
        return (
          <Paper
            key={i}
            component="li"
            variant="outlined"
            sx={{
              display: 'grid',
              gridTemplateColumns: '20px 1fr auto',
              gap: 1.25,
              p: '6px 10px',
              borderLeft: `3px solid ${accent ?? 'grey'}`,
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', textAlign: 'right' }}>
              {i + 1}.
            </Typography>
            <Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, color: accent ?? 'text.secondary', display: 'block' }}>
                {func || '(anonymous)'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                {file}{line ? `:${line}` : ''}
              </Typography>
            </Box>
            {tag && (
              <Typography variant="caption" sx={{ alignSelf: 'center', color: accent, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {tag}
              </Typography>
            )}
          </Paper>
        )
      })}
    </ol>
  )
}

function ReachFlowRow({ flow }: { flow: TaintFlowRow }) {
  const [expanded, setExpanded] = useState(false)
  const sev = (flow.severity || '').toUpperCase()
  const sevC = SEV_COLOR_REACH[sev] ?? '#94a3b8'
  const sourceLoc = flow.source_file
    ? `${flow.source_file}${flow.source_line ? `:${flow.source_line}` : ''}`
    : ''
  const sinkLoc = flow.sink_file
    ? `${flow.sink_file}${flow.sink_line ? `:${flow.sink_line}` : ''}`
    : ''

  return (
    <Box
      component="li"
      sx={{
        borderRadius: 1,
        transition: 'background 0.15s',
        bgcolor: expanded ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box
        component="button"
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, width: '100%',
          px: 1, py: 0.75, textAlign: 'left',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <Chip
          label={sev || '\u2014'}
          size="small"
          sx={{
            bgcolor: sevC + '22',
            color: sevC,
            fontWeight: 600,
            fontSize: 13,
            minWidth: 70,
            height: 22,
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }} noWrap title={sourceLoc}>{sourceLoc || '\u2014'}</Typography>
        <ArrowRight size={12} style={{ opacity: 0.35, flexShrink: 0 }} aria-hidden />
        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#fdba74' }} noWrap>{sinkLoc || '\u2014'}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, fontSize: 12 }}>
          {flow.category || '\u2014'}
        </Typography>
        <ChevronRight
          size={12}
          style={{
            opacity: 0.5, flexShrink: 0, marginLeft: 'auto',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
          aria-hidden
        />
      </Box>
      {expanded && (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {flow.source && (
            <Box>
              <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                {t('warroom.reachSourceExpr')}
              </Typography>
              <Paper variant="outlined" sx={{ p: 1, fontFamily: 'monospace', fontSize: 12, color: '#a5b4fc' }}>
                {flow.source}
              </Paper>
            </Box>
          )}
          {flow.sink && (
            <Box>
              <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                {t('warroom.reachSinkExpr')}
              </Typography>
              <Paper variant="outlined" sx={{ p: 1, fontFamily: 'monospace', fontSize: 12, color: '#fdba74' }}>
                {flow.sink}
              </Paper>
            </Box>
          )}
          {flow.path && flow.path.length > 0 && (
            <Box>
              <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                {t('warroom.reachPathTitle')}
              </Typography>
              <TaintTrace path={flow.path} />
            </Box>
          )}
          {flow.recommendation && (
            <Box>
              <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                {t('warroom.reachRecommendation')}
              </Typography>
              <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.5 }}>
                {flow.recommendation}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
