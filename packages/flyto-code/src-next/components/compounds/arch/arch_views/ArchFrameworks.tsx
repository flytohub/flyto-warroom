import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Code2, GitBranch, Layers } from 'lucide-react'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { JellyCard } from '@atoms/JellyCard'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import CircularProgress from '@mui/material/CircularProgress'
import { Search } from 'lucide-react'
import { t } from '@lib/i18n';
import { Pagination } from '@atoms/Pagination'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { formatCount, useOrgArch } from './shared'

// Cross-repo framework intelligence.

interface FrameworkAgg {
  name: string
  repos: Array<{ repo_id: string; repo_name: string; type: string; version: string }>
  versions: string[]
  types: string[]
  hasDrift: boolean
  highestVersion: string
}

function compareVersion(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

export function ArchFrameworks() {
  const { data, isLoading, isError } = useOrgArch()

  const aggs = useMemo<FrameworkAgg[]>(() => {
    const m = new Map<string, FrameworkAgg>()
    for (const repo of data?.repos ?? []) {
      for (const fw of repo.framework_details ?? []) {
        const name = fw.name
        if (!m.has(name)) {
          m.set(name, { name, repos: [], versions: [], types: [], hasDrift: false, highestVersion: '' })
        }
        const a = m.get(name)!
        a.repos.push({
          repo_id: repo.repo_id,
          repo_name: repo.name,
          type: fw.type ?? '',
          version: fw.version ?? '',
        })
      }
    }
    for (const a of m.values()) {
      const verSet = new Set<string>()
      const typeSet = new Set<string>()
      for (const r of a.repos) {
        if (r.version) verSet.add(r.version)
        if (r.type) typeSet.add(r.type)
      }
      a.versions = Array.from(verSet).sort(compareVersion).reverse()
      a.types = Array.from(typeSet)
      a.hasDrift = verSet.size >= 2
      a.highestVersion = a.versions[0] ?? ''
    }
    return Array.from(m.values()).sort((x, y) => y.repos.length - x.repos.length)
  }, [data])

  const totalFrameworks = aggs.length
  const sharedCount = aggs.filter(a => a.repos.length >= 2).length
  const driftCount = aggs.filter(a => a.hasDrift).length
  const reposCovered = new Set(aggs.flatMap(a => a.repos.map(r => r.repo_id))).size

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'shared' | 'drift' | 'single'>('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 30

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return aggs.filter(a => {
      if (filter === 'shared' && a.repos.length < 2) return false
      if (filter === 'drift' && !a.hasDrift) return false
      if (filter === 'single' && a.repos.length !== 1) return false
      if (q && !a.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [aggs, search, filter])

  useEffect(() => { setPage(1) }, [search, filter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
      <FlytoPageHeader
        title={t('warroom.frameworksTitle')}
        subtitle={t('warroom.frameworksSub')}
      />

      {/* Filters */}
      <JellyCard delay={0} noHover>
      <Paper
        elevation={1}
        className="rounded-xl"
        sx={{ bgcolor: 'background.paper' }}
      >
        <Box className="p-4">
          <Box className="flex items-center gap-2 mb-3">
            <Layers size={14} />
            <Typography variant="subtitle2" color="text.primary">
              {t('warroom.frameworksTitle')}
            </Typography>
            <Chip
              label={`${formatCount(filtered.length)} / ${formatCount(totalFrameworks)} ${t('warroom.fwUnit')}`}
              size="small"
              sx={{ height: 20, fontSize: 12 }}
            />
          </Box>

          {/* Stat tiles */}
          {totalFrameworks > 0 && (
            <Box className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
              <StatMiniTile icon={<Layers size={14} />} label={t('warroom.fwTotal')} value={formatCount(totalFrameworks)} accent="#a78bfa" />
              <StatMiniTile icon={<GitBranch size={14} />} label={t('warroom.fwShared')} value={formatCount(sharedCount)} accent="#22c55e" />
              <StatMiniTile icon={<AlertTriangle size={14} />} label={t('warroom.fwDrift')} value={formatCount(driftCount)} accent={driftCount > 0 ? '#f97316' : '#94a3b8'} />
              <StatMiniTile icon={<Code2 size={14} />} label={t('warroom.fwReposCovered')} value={formatCount(reposCovered)} accent="#38bdf8" />
            </Box>
          )}

          {/* Filters */}
          <Box className="flex flex-wrap gap-2">
            <TextField
              size="small"
              placeholder={t('warroom.fwSearch')}
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
              onChange={v => setFilter(v as typeof filter)}
              options={[
                { value: 'all',    label: t('warroom.fwFilterAll') },
                { value: 'shared', label: t('warroom.fwFilterShared') },
                { value: 'drift',  label: t('warroom.fwFilterDrift') },
                { value: 'single', label: t('warroom.fwFilterSingle') },
              ]}
              minWidth={200}
              maxWidth={240}
              aria-label={t('warroom.fwFilterAll')}
            />
          </Box>
        </Box>
      </Paper>
      </JellyCard>

      {/* Body — scrollable, fills remaining space */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {isLoading && (
          <Box className="flex items-center justify-center py-12">
            <CircularProgress size={20} />
          </Box>
        )}
        {isError && !isLoading && (
          <Box className="flex flex-col items-center gap-3 py-12">
            <AlertTriangle size={32} style={{ opacity: 0.4 }} />
            <Typography variant="body2" color="text.secondary">{t('error.loadFailed')}</Typography>
          </Box>
        )}
        {!isLoading && !isError && totalFrameworks === 0 && (
          <Box className="flex flex-col items-center gap-3 py-12">
            <Layers size={40} style={{ opacity: 0.15 }} />
            <Typography variant="body2" color="text.secondary">{t('warroom.fwNone')}</Typography>
          </Box>
        )}
        {!isLoading && !isError && filtered.length === 0 && totalFrameworks > 0 && (
          <Box className="flex flex-col items-center gap-3 py-12">
            <Layers size={40} style={{ opacity: 0.15 }} />
            <Typography variant="body2" color="text.secondary">{t('warroom.findingNoMatch')}</Typography>
          </Box>
        )}

        {pagedRows.length > 0 && pagedRows.map(a => <FrameworkRow key={a.name} agg={a} />)}
      </Box>

      {/* Pagination — pinned at bottom */}
      {filtered.length > PAGE_SIZE && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
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

function FrameworkRow({ agg }: { agg: FrameworkAgg }) {
  const [expanded, setExpanded] = useState(false)
  const repoCount = agg.repos.length

  return (
    <Paper
      elevation={0}
      className="rounded-xl"
      sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
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
        <Typography variant="body2" color="text.primary" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
          {agg.name}
        </Typography>
        <Box className="flex items-center gap-1">
          <GitBranch size={11} style={{ opacity: 0.6 }} />
          <Typography variant="body2" color="text.secondary">
            {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
          </Typography>
        </Box>
        {agg.types.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {agg.types.slice(0, 2).join(', ')}
          </Typography>
        )}
        {agg.hasDrift ? (
          <Chip
            icon={<AlertTriangle size={11} />}
            label={`${agg.versions.length} ${t('warroom.fwVersionsShort')}`}
            size="small"
            title={t('warroom.fwDriftWarn')}
            sx={{ height: 20, fontSize: 12, bgcolor: 'warning.main', color: 'warning.contrastText' }}
          />
        ) : agg.highestVersion ? (
          <Typography variant="body2" color="text.secondary">{agg.highestVersion}</Typography>
        ) : null}
        <Box sx={{ ml: 'auto' }}>
          <ChevronRight
            size={12}
            style={{
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          />
        </Box>
      </Box>
      {expanded && (
        <Box sx={{ px: 3, pb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {t('warroom.fwUsedBy')} ({repoCount})
          </Typography>
          <Box className="flex flex-col gap-1">
            {agg.repos.map(r => {
              const isLaggard = agg.hasDrift && r.version !== '' && r.version !== agg.highestVersion
              return (
                <Box
                  key={r.repo_id}
                  className="flex items-center gap-3"
                  sx={{ py: 0.5, px: 1, borderRadius: 1, bgcolor: isLaggard ? 'error.main' + '08' : 'transparent' }}
                >
                  <Typography variant="caption" color="text.primary" sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {r.repo_name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: isLaggard ? 'warning.main' : 'text.secondary', minWidth: 60, textAlign: 'right' }}
                  >
                    {r.version || '---'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 50 }}>
                    {r.type || '---'}
                  </Typography>
                  {isLaggard && (
                    <Chip
                      icon={<AlertTriangle size={10} />}
                      label={t('warroom.fwLaggard')}
                      size="small"
                      sx={{ height: 18, fontSize: 12, bgcolor: 'warning.main', color: 'warning.contrastText' }}
                    />
                  )}
                </Box>
              )
            })}
          </Box>
        </Box>
      )}
    </Paper>
  )
}
