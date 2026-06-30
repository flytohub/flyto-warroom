/**
 * ArchRepos — master-detail repo breakdown.
 *
 * Left: compact repo list sorted by health (worst first).
 * Right: selected repo's full detail — stats, frameworks, imports, taint.
 * Bottom: collapsible cross-repo service graph.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { gradients } from '@/styles/designTokens'
import {
  Code2, GitBranch, Layers, Network, ShieldAlert,
} from 'lucide-react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import CircularProgress from '@mui/material/CircularProgress'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  getOrgArchMap, getRepoArchDetail,
  type RepoArch,
} from '@lib/engine'
import { useOrg } from '@hooks/useOrg'
import { useRepoScores, getRepoScore } from '@hooks/useRepoScores'
import { ScanViewRoot, ScanViewHeader } from '@compounds/scanning/_shared'
import { QueryError } from '@atoms/QueryError'
import { JellyCard } from '@atoms/JellyCard'
import { formatCount, gradeColor } from './shared'
import { DeadSymbolsSection } from './DeadSymbolsSection'

export function ArchRepos() {
  const { org } = useOrg()
  const scoreMap = useRepoScores()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.repos.archMap(org?.id),
    queryFn: () => getOrgArchMap(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })

  const archRepos = data?.repos ?? []
  const sorted = useMemo(
    // A3: sort by raw asc (worst first), with unscored repos pushed
    // to the bottom — `null` raw treated as +Infinity so the sort
    // ranking still puts the actually-bad repos at the top of the
    // list, where the operator wants to act first.
    () => [...archRepos].sort((a, b) => {
      const ra = getRepoScore(scoreMap, a.repo_id).raw ?? Number.POSITIVE_INFINITY
      const rb = getRepoScore(scoreMap, b.repo_id).raw ?? Number.POSITIVE_INFINITY
      return ra - rb
    }),
    [archRepos, scoreMap],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = sorted.find(r => r.repo_id === selectedId) ?? sorted[0] ?? null

  // Shared services: service name → list of repo names that use it (2+ repos only)
  const sharedServices = useMemo(() => {
    const svcMap = new Map<string, string[]>()
    for (const r of archRepos) {
      for (const s of (r.services ?? [])) {
        if (!svcMap.has(s)) svcMap.set(s, [])
        svcMap.get(s)!.push(r.name)
      }
    }
    return Array.from(svcMap.entries())
      .filter(([, repos]) => repos.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
  }, [archRepos])

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={Layers}
        gradient={gradients.architecture}
        title={t('warroom.archRepoCards')}
        subtitle={t('warroom.archReposSub')}
        count={archRepos.length}
        countColor="primary.main"
      />

      {isLoading && (
        <Box className="flex items-center justify-center py-12">
          <CircularProgress size={20} />
        </Box>
      )}

      {!isLoading && isError && (
        <QueryError error={error} onRetry={refetch} label={t('arch.reposLabel')} />
      )}

      {!isLoading && !isError && archRepos.length === 0 && (
        <Box className="flex flex-col items-center gap-3 py-12">
          <Layers size={40} style={{ opacity: 0.15 }} />
          <Typography variant="body2" color="text.secondary">
            {t('warroom.archReposNone')}
          </Typography>
        </Box>
      )}

      {/* Master-detail layout */}
      {!isLoading && !isError && sorted.length > 0 && (
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 2, minHeight: 0 }}>

          {/* ── Left: repo list ── */}
          <JellyCard delay={0} noHover style={{ display: 'flex', minHeight: 0 }}>
          <Paper elevation={1} className="rounded-xl" sx={{
            bgcolor: 'background.paper', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            flex: 1,
          }}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
              <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {sorted.length} repos
              </Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              {sorted.map(repo => {
                const grade = getRepoScore(scoreMap, repo.repo_id).grade
                const isActive = repo.repo_id === (selected?.repo_id ?? null)
                return (
                  <Box
                    key={repo.repo_id}
                    component="button"
                    onClick={() => setSelectedId(repo.repo_id)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
                      px: 2, py: 1.5, border: 'none', cursor: 'pointer',
                      textAlign: 'left', transition: 'background 0.15s',
                      bgcolor: isActive ? 'action.selected' : 'transparent',
                      borderLeft: isActive ? '3px solid' : '3px solid transparent',
                      borderLeftColor: isActive ? gradeColor(grade) : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Chip
                      label={grade}
                      size="small"
                      sx={{
                        bgcolor: gradeColor(grade) + '22',
                        color: gradeColor(grade),
                        fontWeight: 700, fontSize: 13, minWidth: 26, height: 22,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={isActive ? 700 : 500} color="text.primary" noWrap>
                        {repo.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {repo.project_type}
                      </Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={700} sx={{ color: gradeColor(grade), flexShrink: 0 }}>
                      {getRepoScore(scoreMap, repo.repo_id).raw}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          </Paper>
          </JellyCard>

          {/* ── Right: selected repo detail ── */}
          <JellyCard delay={0.04} noHover style={{ display: 'flex', minHeight: 0 }}>
          <Paper elevation={1} className="rounded-xl" sx={{
            bgcolor: 'background.paper', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            flex: 1,
          }}>
            {selected ? (
              <RepoDetail repo={selected} sharedServices={sharedServices} scoreMap={scoreMap} />
            ) : (
              <Box className="flex items-center justify-center" sx={{ flex: 1, color: 'text.secondary' }}>
                <Typography variant="body2">{t('warroom.archReposSelect')}</Typography>
              </Box>
            )}
          </Paper>
          </JellyCard>
        </Box>
      )}
    </ScanViewRoot>
  )
}

// ── Right panel: repo detail ──

function RepoDetail({ repo, sharedServices, scoreMap }: { repo: RepoArch; sharedServices: Array<[string, string[]]>; scoreMap: Map<string, import('@hooks/useRepoScores').RepoScore> }) {
  const [expandedSvc, setExpandedSvc] = useState<string | null>(null)
  // Services this repo participates in
  const repoServices = useMemo(
    () => sharedServices.filter(([, repos]) => repos.includes(repo.name)),
    [sharedServices, repo.name],
  )
  const { data: detail, isLoading } = useQuery({
    queryKey: qk.repos.archDetail(repo.repo_id),
    queryFn: () => getRepoArchDetail(repo.repo_id),
    enabled: true,
    staleTime: 5 * 60_000,
  })

  const grade = getRepoScore(scoreMap, repo.repo_id).grade
  const stats = [
    { label: 'Files', value: repo.file_count },
    { label: t('dashboard.diffComplex'), value: repo.complex_functions, alert: repo.complex_functions > 50 },
    { label: t('dashboard.diffDeadCode'), value: repo.dead_code_count, alert: repo.dead_code_count > 100 },
    { label: 'APIs', value: repo.api_count },
    { label: t('dashboard.diffSecrets'), value: repo.secret_count, alert: repo.secret_count > 0 },
    { label: 'Taint', value: repo.taint_flow_count, alert: repo.taint_flow_count > 0 },
  ]

  return (
    <>
      {/* Header — pinned */}
      <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
          <Chip
            label={grade}
            size="small"
            sx={{
              bgcolor: gradeColor(grade) + '22',
              color: gradeColor(grade),
              fontWeight: 700, fontSize: 14, minWidth: 32, height: 28,
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700} color="text.primary">
              {repo.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {repo.project_sub_type ? `${repo.project_type} · ${repo.project_sub_type}` : repo.project_type}
            </Typography>
          </Box>
          <Typography variant="h5" fontWeight={700} sx={{ color: gradeColor(grade) }}>
            {getRepoScore(scoreMap, repo.repo_id).raw}
            <Typography component="span" variant="body2" color="text.secondary"> /100</Typography>
          </Typography>
        </Box>

        {/* Stat tiles */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 1.5 }}>
          {stats.map(s => (
            <Box key={s.label} sx={{ textAlign: 'center' }}>
              <Typography variant="body2" fontWeight={700} sx={{ color: s.alert ? 'error.main' : 'text.primary' }}>
                {formatCount(s.value)}
              </Typography>
              <Typography variant="caption" color="text.secondary">{s.label}</Typography>
            </Box>
          ))}
        </Box>

        {/* Tags */}
        {(repo.frameworks?.length || repo.patterns?.length || repo.services?.length) ? (
          <Box className="flex flex-wrap gap-1 mt-2">
            {repo.frameworks?.slice(0, 5).map(f => (
              <Chip key={`fw-${f}`} label={f} size="small" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 13, height: 20 }} />
            ))}
            {repo.patterns?.slice(0, 5).map(p => (
              <Chip key={`pa-${p}`} label={p} size="small" variant="outlined" sx={{ fontSize: 13, height: 20 }} />
            ))}
            {repo.services?.slice(0, 5).map(s => (
              <Chip key={`sv-${s}`} label={s} size="small" sx={{ bgcolor: 'success.main', color: 'success.contrastText', fontSize: 13, height: 20 }} />
            ))}
          </Box>
        ) : null}
      </Box>

      {/* Detail body — scrolls */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {isLoading && (
          <Box className="flex items-center gap-2 py-6 justify-center">
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">{t('common.loading')}</Typography>
          </Box>
        )}

        {detail && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Dead symbols */}
            {detail.dead_symbols && detail.dead_symbols.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <DeadSymbolsSection symbols={detail.dead_symbols} />
              </Paper>
            )}

            {/* Top imports */}
            {detail.top_imports && detail.top_imports.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box className="flex items-center gap-2 mb-1.5">
                  <Code2 size={14} />
                  <Typography variant="body2" fontWeight={700} color="text.primary">
                    {t('warroom.archTopImports')}
                  </Typography>
                  <Chip label={detail.top_imports.length} size="small" sx={{ height: 22, fontSize: 12 }} />
                </Box>
                <List dense disablePadding>
                  {detail.top_imports.slice(0, 15).map(im => (
                    <ListItem key={im.package} disableGutters sx={{ py: 0.5 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', flex: 1 }}>
                        {im.package}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">{im.count}x</Typography>
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}

            {/* Frameworks */}
            {detail.frameworks && detail.frameworks.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box className="flex items-center gap-2 mb-1.5">
                  <GitBranch size={14} />
                  <Typography variant="body2" fontWeight={700} color="text.primary">
                    {t('warroom.archFrameworks')}
                  </Typography>
                  <Chip label={detail.frameworks.length} size="small" sx={{ height: 22, fontSize: 12 }} />
                </Box>
                {detail.frameworks.map((fw, i) => (
                  <Box key={i} sx={{ mb: 1.5 }}>
                    <Box className="flex items-center gap-2">
                      <Typography variant="body2" color="text.primary" fontWeight={600}>
                        {fw.name ?? '(unnamed)'}
                      </Typography>
                      {fw.version && <Chip label={fw.version} size="small" variant="outlined" sx={{ height: 22, fontSize: 12 }} />}
                      {fw.type && <Chip label={fw.type} size="small" sx={{ height: 22, fontSize: 12, bgcolor: 'action.selected' }} />}
                    </Box>
                    {fw.entry_points && fw.entry_points.length > 0 && (
                      <List dense disablePadding sx={{ pl: 2 }}>
                        {fw.entry_points.slice(0, 5).map((ep, j) => (
                          <ListItem key={j} disableGutters sx={{ py: 0.25 }}>
                            <Typography variant="body2" color="text.primary" sx={{ fontFamily: 'monospace' }}>
                              {ep.symbol ?? ''}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                              {ep.file ?? ''}{ep.line ? `:${ep.line}` : ''}
                            </Typography>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                ))}
              </Paper>
            )}

            {/* Taint summary */}
            {detail.taint_summary && (detail.taint_summary.total_sources ?? 0) + (detail.taint_summary.total_sinks ?? 0) > 0 && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box className="flex items-center gap-2 mb-1.5">
                  <ShieldAlert size={14} />
                  <Typography variant="body2" fontWeight={700} color="text.primary">
                    {t('warroom.archTaint')}
                  </Typography>
                </Box>
                <Box className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{detail.taint_summary.total_sources ?? 0}</Typography>
                    <Typography variant="caption" color="text.secondary">sources</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{detail.taint_summary.total_sinks ?? 0}</Typography>
                    <Typography variant="caption" color="text.secondary">sinks</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" fontWeight={700} sx={{ color: detail.taint_summary.unsanitized_flows ? 'error.main' : 'text.primary' }}>
                      {detail.taint_summary.unsanitized_flows ?? 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">unsanitized</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{detail.taint_summary.sanitized_flows ?? 0}</Typography>
                    <Typography variant="caption" color="text.secondary">sanitized</Typography>
                  </Box>
                </Box>
                {detail.taint_summary.categories && detail.taint_summary.categories.length > 0 && (
                  <Box className="flex flex-wrap gap-1 mt-1.5">
                    {detail.taint_summary.categories.map(c => (
                      <Chip key={c} label={c} size="small" sx={{ height: 20, fontSize: 12, bgcolor: 'action.selected' }} />
                    ))}
                  </Box>
                )}
              </Paper>
            )}

          </Box>
        )}

        {/* Shared services — chip list with expandable repo names */}
        {repoServices.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Box className="flex items-center gap-2 mb-1.5">
              <Network size={14} />
              <Typography variant="body2" fontWeight={700} color="text.primary">
                {t('warroom.archSharedServices')}
              </Typography>
              <Chip label={repoServices.length} size="small" sx={{ height: 22, fontSize: 12 }} />
            </Box>
            <Box className="flex flex-wrap gap-1.5">
              {repoServices.map(([svc, repos]) => {
                const isOpen = expandedSvc === svc
                return (
                  <Box key={svc}>
                    <Chip
                      label={`${svc}  ${repos.length} repos`}
                      size="small"
                      onClick={() => setExpandedSvc(isOpen ? null : svc)}
                      sx={{
                        height: 26, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        bgcolor: isOpen ? 'rgba(34,211,153,0.15)' : 'rgba(34,211,153,0.08)',
                        color: '#22c55e',
                        border: '1px solid',
                        borderColor: isOpen ? 'rgba(34,211,153,0.4)' : 'rgba(34,211,153,0.2)',
                        '&:hover': { bgcolor: 'rgba(34,211,153,0.15)' },
                      }}
                    />
                    {isOpen && (
                      <Paper variant="outlined" sx={{ mt: 0.5, p: 1, borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                          {t('warroom.archUsedBy')}:
                        </Typography>
                        <Box className="flex flex-wrap gap-1">
                          {repos.map(r => (
                            <Chip
                              key={r}
                              label={r}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: 13, fontWeight: r === repo.name ? 700 : 400 }}
                            />
                          ))}
                        </Box>
                      </Paper>
                    )}
                  </Box>
                )
              })}
            </Box>
          </Paper>
        )}
      </Box>
    </>
  )
}
