import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, ChevronRight, Users, AlertTriangle, Search } from 'lucide-react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getEnrichedDependencies, type EnrichedDepPackage } from '@lib/engine'
import { useOrg } from '@hooks/useOrg'
import { Pagination } from '@atoms/Pagination'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { ContextStrip } from '@atoms/ContextStrip'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { JellyCard } from '@atoms/JellyCard'

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

// ── ArchDeps -- Cross-repo dependency map ──

const DEPS_PAGE_SIZE = 50

type DepFilter = 'all' | 'shared' | 'single'

export function ArchDeps() {
  const { org } = useOrg()
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.repos.dependencies(org?.id),
    queryFn: () => getEnrichedDependencies(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })
  const packages = data?.packages ?? []
  const aggregate = data?.aggregate

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<DepFilter>('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return packages.filter(p => {
      if (filter === 'shared' && p.shared_count < 2) return false
      if (filter === 'single' && p.shared_count !== 1) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [packages, search, filter])

  useEffect(() => { setPage(1) }, [search, filter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / DEPS_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedRows = filtered.slice((safePage - 1) * DEPS_PAGE_SIZE, safePage * DEPS_PAGE_SIZE)

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
      <FlytoPageHeader
        title={t('warroom.depsTitle')}
        subtitle={t('warroom.depsSub')}
      />

      {/* Filters — pinned */}
      <JellyCard delay={0} noHover>
      <Paper
        elevation={1}
        className="rounded-xl"
        sx={{ bgcolor: 'background.paper', flexShrink: 0 }}
      >
        <Box className="p-4">
          <Box className="flex items-center gap-2 mb-3">
            <Package size={14} />
            <Typography variant="subtitle2" color="text.primary">
              {t('warroom.depsTitle')}
            </Typography>
            <Chip
              label={`${formatCount(filtered.length)} / ${formatCount(packages.length)} packages`}
              size="small"
              sx={{ height: 24, fontSize: 12 }}
            />
          </Box>

          {/* Aggregate stat tiles */}
          {aggregate && (
            <Box className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
              <StatMiniTile
                icon={<Package size={14} />}
                label={t('warroom.depsTotal')}
                value={formatCount(aggregate.total_packages)}
                accent="#a78bfa"
              />
              <StatMiniTile
                icon={<Users size={14} />}
                label={t('warroom.depsShared')}
                value={formatCount(aggregate.shared_packages)}
                accent="#22c55e"
              />
              <StatMiniTile
                icon={<Package size={14} />}
                label={t('warroom.depsSingle')}
                value={formatCount(aggregate.single_use_packages)}
                accent="#94a3b8"
              />
              <Paper elevation={0} className="rounded-lg" sx={{ bgcolor: 'background.default', border: 1, borderColor: 'divider', p: 1.5 }}>
                <Box sx={{ color: '#f97316' }} className="mb-0.5"><AlertTriangle size={14} /></Box>
                <Typography variant="body2" color="text.secondary" display="block">
                  {t('warroom.depsConcentration')}
                </Typography>
                <Typography variant="caption" sx={{ color: '#f97316', fontFamily: 'monospace', fontWeight: 700 }}>
                  {aggregate.highest_concentration.package || '---'}
                </Typography>
                {aggregate.highest_concentration.repo && (
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                    {aggregate.highest_concentration.repo} · {formatCount(aggregate.highest_concentration.count)}x
                  </Typography>
                )}
              </Paper>
            </Box>
          )}

          {/* Filters */}
          <Box className="flex flex-wrap gap-2">
            <TextField
              size="small"
              placeholder={t('warroom.depsSearch')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={14} />
                    </InputAdornment>
                  ),
                  sx: { fontSize: 13 },
                },
              }}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <FlytoSelect
              value={filter}
              onChange={v => setFilter(v as DepFilter)}
              options={[
                { value: 'all', label: t('warroom.depsFilterAll') },
                { value: 'shared', label: t('warroom.depsFilterShared') },
                { value: 'single', label: t('warroom.depsFilterSingle') },
              ]}
              minWidth={180}
              maxWidth={220}
              aria-label={t('warroom.depsFilterAll')}
            />
          </Box>
        </Box>
      </Paper>
      </JellyCard>

      {/* Body */}
      {isLoading && (
        <Box className="flex items-center justify-center py-12">
          <CircularProgress size={20} />
        </Box>
      )}
      {isError && (
        <Box className="flex flex-col items-center gap-3 py-12">
          <AlertTriangle size={40} style={{ opacity: 0.4, color: '#ef4444' }} />
          <Typography variant="body2" color="text.secondary">{t('common.loadError')}</Typography>
        </Box>
      )}
      {!isLoading && !isError && filtered.length === 0 && packages.length === 0 && (
        <Box className="flex flex-col items-center gap-3 py-12">
          <Package size={40} style={{ opacity: 0.15 }} />
          <Typography variant="body2" color="text.secondary">{t('warroom.depsNone')}</Typography>
        </Box>
      )}
      {!isLoading && !isError && filtered.length === 0 && packages.length > 0 && (
        <Box className="flex flex-col items-center gap-3 py-12">
          <Package size={40} style={{ opacity: 0.15 }} />
          <Typography variant="body2" color="text.secondary">{t('warroom.findingNoMatch')}</Typography>
        </Box>
      )}

      {pagedRows.length > 0 && (
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <Box className="flex flex-col gap-1.5">
            {pagedRows.map(p => <DepRow key={p.name} pkg={p} />)}
          </Box>
        </Box>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        pageSize={DEPS_PAGE_SIZE}
        onPageChange={setPage}
      />
    </Box>
  )
}

function StatMiniTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <Paper elevation={0} className="rounded-lg" sx={{ bgcolor: 'background.default', border: 1, borderColor: 'divider', p: 1.5 }}>
      <Box sx={{ color: accent }} className="mb-0.5">{icon}</Box>
      <Typography variant="body2" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="body2" sx={{ color: accent, fontWeight: 700 }}>{value}</Typography>
    </Paper>
  )
}

function hasDepSignals(pkg: EnrichedDepPackage): boolean {
  if (pkg.open_prs_touching && pkg.open_prs_touching.length > 0) return true
  if (pkg.taint_adjacency) return true
  if (pkg.autofix_eligible) return true
  if (pkg.pentest_verdict) return true
  return false
}

function DepRow({ pkg }: { pkg: EnrichedDepPackage }) {
  const [expanded, setExpanded] = useState(false)
  const topRepo = pkg.by_repo[0]
  const concentration = pkg.total_uses > 0 ? Math.round((topRepo?.count ?? 0) / pkg.total_uses * 100) : 0
  const flagConcentrated = pkg.shared_count >= 2 && concentration >= 70

  return (
    <Paper
      elevation={0}
      className="rounded-xl"
      sx={{ bgcolor: 'background.paper', border: 1, borderColor: expanded ? 'primary.main' : 'divider' }}
    >
      <Box
        component="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left p-3"
        sx={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: '12px',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" color="text.primary" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
            {pkg.name}
          </Typography>
          {hasDepSignals(pkg) && (
            <ContextStrip
              signals={{
                open_prs_touching: pkg.open_prs_touching,
                taint_adjacency:   pkg.taint_adjacency,
                autofix_eligible:  pkg.autofix_eligible,
                pentest_verdict:   pkg.pentest_verdict,
                blast_radius:      pkg.blast_radius,
              }}
            />
          )}
        </Box>
        <Box className="flex items-center gap-1">
          <Users size={11} style={{ opacity: 0.6 }} />
          <Typography variant="body2" color="text.secondary">
            {pkg.shared_count} {pkg.shared_count === 1 ? 'repo' : 'repos'}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {formatCount(pkg.total_uses)} uses
        </Typography>
        {flagConcentrated && (
          <Chip
            icon={<AlertTriangle size={11} />}
            label={`${concentration}%`}
            size="small"
            title={t('warroom.depsConcentrationWarn')}
            sx={{ height: 24, fontSize: 12, bgcolor: 'warning.main', color: 'warning.contrastText' }}
          />
        )}
        <ChevronRight
          size={12}
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0,
          }}
        />
      </Box>
      {expanded && (
        <Box sx={{ px: 3, pb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t('warroom.depsByRepo')} ({pkg.by_repo.length})
          </Typography>
          <Box className="flex flex-col gap-1">
            {pkg.by_repo.map(r => {
              const pct = pkg.total_uses > 0 ? (r.count / pkg.total_uses) * 100 : 0
              return (
                <Box key={r.repo_id} className="flex items-center gap-2">
                  <Typography variant="caption" color="text.primary" sx={{ minWidth: 120 }} noWrap>
                    {r.repo_name}
                  </Typography>
                  <Box sx={{ flex: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{
                        height: 4,
                        borderRadius: 2,
                        bgcolor: 'action.hover',
                        '& .MuiLinearProgress-bar': { bgcolor: 'primary.main', borderRadius: 2 },
                      }}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 40, textAlign: 'right' }}>
                    {formatCount(r.count)}x
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 50 }}>
                    {r.files_count > 0 ? `${r.files_count} files` : '---'}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        </Box>
      )}
    </Paper>
  )
}
