import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, FileCode, GitBranch, Key, Layers,
  Network, ShieldAlert, Sparkles, Trash2, Zap,
} from 'lucide-react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { QueryError } from '@atoms/QueryError'
import { JellyCard } from '@atoms/JellyCard'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  getOrgArchMap,
  type ConnectedRepo,
} from '@lib/engine'
import { useOrg } from '@hooks/useOrg'
import { useRepoScores, getRepoScore } from '@hooks/useRepoScores'
import { gradeFor, displayScore } from '@compounds/_shared/scoring'
import type { OrgWarRoomData } from '@compounds/_shared/warroom'
import { formatCount, gradeColor, repoName, topByValue } from './shared'

// AI Summary — brief org-wide health blurb at the top of the overview.
function generateOrgSummary(data: OrgWarRoomData, map: Record<string, ConnectedRepo>, scoreMap: Map<string, import('@hooks/useRepoScores').RepoScore>) {
  const { healthRepos, repos } = data
  const langSet = new Set(repos.map(r => r.language).filter(Boolean))
  const atRisk = healthRepos.filter(r => {
    const g = getRepoScore(scoreMap, r.repo_id).grade
    return g === 'D' || g === 'F'
  })
  // A3: average only across scorable repos. Pre-A3 default raw=0
  // for unscored repos dragged the mean down toward 0 for any org
  // mid-onboarding (e.g. 1 scored repo at 80 + 4 unscored = 16 avg),
  // and the chart card mis-reported a healthy org as F-tier.
  const scoredRaws = healthRepos
    .map(r => getRepoScore(scoreMap, r.repo_id).raw)
    .filter((v): v is number => v != null)
  const avgScore = scoredRaws.length > 0
    ? displayScore(scoredRaws.reduce((s, v) => s + v, 0) / scoredRaws.length) : 0

  let worstRepo = '', worstCves = 0
  for (const r of healthRepos) {
    const c = r.cve_total ?? 0
    if (c > worstCves) { worstCves = c; worstRepo = repoName(r.repo_id, map) }
  }

  const lines: string[] = []
  lines.push(`${repos.length} ${t('warroom.reposAcross')} ${langSet.size} ${t('warroom.languages')}.`)
  if (atRisk.length > 0) lines.push(`${atRisk.length} repos ${t('warroom.atRisk')} (D/F).`)
  if (worstCves > 0) lines.push(`${worstRepo} ${t('warroom.mostCves')} (${worstCves}).`)
  // avgScore is a 250–900 display score (via displayScore), so no "/100" — the
  // letter grade already conveys the band.
  lines.push(`${t('warroom.avgScore')}: ${avgScore} (${gradeFor(avgScore)}).`)

  const topRisks = atRisk.slice(0, 2).map(r => repoName(r.repo_id, map))
  const rec = topRisks.length > 0 ? `${t('warroom.focusOn')} ${topRisks.join(', ')} ${t('warroom.securityIssues')}.` : undefined
  return { lines, rec }
}

// Org-wide architecture dashboard.
export function ArchOverview({ data, repoNameMap }: { data: OrgWarRoomData; repoNameMap: Record<string, ConnectedRepo> }) {
  const { org } = useOrg()
  const scoreMap = useRepoScores()
  const { data: archData, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.repos.archMap(org?.id),
    queryFn: () => getOrgArchMap(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })

  const summary = useMemo(() => generateOrgSummary(data, repoNameMap, scoreMap), [data, repoNameMap, scoreMap])
  const aggregate = archData?.aggregate

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 3 }}>
      <FlytoPageHeader
        title={t('warroom.archOverviewTitle')}
        subtitle={t('warroom.archOverviewSub')}
      />

      {/* Scrollable content area */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {isLoading && (
        <Box className="flex items-center justify-center py-12">
          <CircularProgress size={20} />
        </Box>
      )}

      {isError && !isLoading && (
        <QueryError error={error} onRetry={refetch} label={t('arch.label')} />
      )}

      {!isLoading && !isError && (
        <>
          {/* AI Summary — full width */}
          <JellyCard delay={0} noHover>
          <Paper
            elevation={0}
            className="rounded-xl"
            sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
          >
            <Box className="flex gap-3 p-4">
              <Box sx={{ color: 'primary.main' }} className="pt-0.5">
                <Sparkles size={16} />
              </Box>
              <Box className="flex-1">
                <Typography variant="subtitle2" color="text.primary" gutterBottom>
                  {t('warroom.aiSummary')}
                </Typography>
                <Typography variant="body2" color="text.primary">
                  {summary.lines.join(' ')}
                </Typography>
                {summary.rec && (
                  <Typography variant="body2" sx={{ color: 'warning.main', mt: 0.5 }}>
                    {summary.rec}
                  </Typography>
                )}
              </Box>
            </Box>
          </Paper>
          </JellyCard>

          {/* Stat tiles — full width 4×2 */}
          {aggregate && (
            <Box className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <JellyCard delay={0.04}><StatTile icon={GitBranch} label={t('warroom.archStatRepos')} value={aggregate.total_repos} /></JellyCard>
              <JellyCard delay={0.08}><StatTile icon={FileCode} label={t('warroom.archStatFiles')} value={aggregate.total_files} /></JellyCard>
              <JellyCard delay={0.12}><StatTile icon={Trash2} label={t('warroom.archStatDeadCode')} value={aggregate.total_dead_code} accent="#94a3b8" /></JellyCard>
              <JellyCard delay={0.16}><StatTile icon={Zap} label={t('warroom.archStatComplex')} value={aggregate.total_complex_functions} accent="#eab308" /></JellyCard>
              <JellyCard delay={0.20}><StatTile icon={Key} label={t('warroom.archStatSecrets')} value={aggregate.total_secrets} accent={aggregate.total_secrets > 0 ? '#ef4444' : '#94a3b8'} /></JellyCard>
              <JellyCard delay={0.24}><StatTile icon={ShieldAlert} label={t('warroom.archStatTaint')} value={aggregate.total_taint_flows} accent={aggregate.total_taint_flows > 0 ? '#f97316' : '#94a3b8'} /></JellyCard>
              <JellyCard delay={0.28}><StatTile icon={Network} label={t('warroom.archStatApis')} value={aggregate.total_apis} accent="#38bdf8" /></JellyCard>
              <JellyCard delay={0.32}><StatTile
                icon={AlertTriangle}
                label={t('warroom.archStatWorst')}
                valueText={aggregate.worst_repo ?? '—'}
                accent="#ef4444"
              /></JellyCard>
            </Box>
          )}

          {/* Grade + Language — stacked (languages can be many) */}
          {aggregate && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Grade distribution — compact inline bar */}
              {Object.keys(aggregate.grade_distribution ?? {}).length > 0 && (
                <JellyCard delay={0.36} noHover>
                <Paper
                  elevation={0}
                  className="rounded-lg"
                  sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
                >
                  <Box className="flex items-center gap-3 px-3 py-2">
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {t('warroom.archGradeDist')}
                    </Typography>
                    <Box className="flex h-3 overflow-hidden rounded-sm flex-1" sx={{ bgcolor: 'action.hover' }}>
                      {(['A', 'B', 'C', 'D', 'F']).map(g => {
                        const count = aggregate.grade_distribution[g] ?? 0
                        if (count === 0) return null
                        const pct = aggregate.total_repos > 0 ? (count / aggregate.total_repos) * 100 : 0
                        return (
                          <Box
                            key={g}
                            title={`${g}: ${count} repos (${pct.toFixed(0)}%)`}
                            sx={{ width: `${pct}%`, bgcolor: gradeColor(g), minWidth: pct > 0 ? 4 : 0 }}
                          />
                        )
                      })}
                    </Box>
                    <Box className="flex gap-2" sx={{ flexShrink: 0 }}>
                      {(['A', 'B', 'C', 'D', 'F']).map(g => {
                        const count = aggregate.grade_distribution[g] ?? 0
                        if (count === 0) return null
                        return (
                          <Box key={g} className="flex items-center gap-1">
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: gradeColor(g) }} />
                            <Typography variant="caption" sx={{ color: gradeColor(g), fontWeight: 600, fontSize: 13 }}>{g}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>{count}</Typography>
                          </Box>
                        )
                      })}
                    </Box>
                  </Box>
                </Paper>
                </JellyCard>
              )}

              {/* Language distribution — content-driven height.
                  Earlier this used `display:flex` + `flex:1` on the
                  scrollable inner Box, which made the Paper grow to
                  its maxHeight regardless of content. That left a
                  big white gap when an org only had 3-4 languages.
                  Now the Paper auto-sizes; only the inner Box has
                  the maxHeight + overflow-auto so long lists scroll
                  inside their natural ceiling. */}
              <JellyCard delay={0.40}>
              <Paper
                elevation={0}
                className="rounded-xl"
                sx={{
                  bgcolor: 'background.paper', border: 1, borderColor: 'divider',
                  overflow: 'hidden',
                }}
              >
                <Typography variant="subtitle2" color="text.primary" sx={{ px: 3, pt: 2, pb: 1 }}>
                  {t('warroom.archLangDist')}
                </Typography>
                <Box sx={{ maxHeight: 220, overflowY: 'auto', px: 3, pb: 2 }}>
                  <LanguageGrid dist={aggregate.language_distribution} />
                </Box>
              </Paper>
              </JellyCard>
            </Box>
          )}
        </>
      )}

      </Box>{/* end scrollable content */}
    </Box>
  )
}

// ── Stat tile ──

function StatTile({
  icon: Icon, label, value, valueText, accent,
}: {
  icon: typeof Layers
  label: string
  value?: number
  valueText?: string
  accent?: string
}) {
  return (
    <Paper
      elevation={0}
      className="rounded-lg"
      sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
    >
      <Box className="flex items-center gap-2 px-3 py-2">
        <Box sx={{ color: accent ?? '#a78bfa', display: 'flex', flexShrink: 0 }}>
          <Icon size={15} />
        </Box>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: accent ?? 'text.primary', fontWeight: 700, ml: 'auto' }}
          title={valueText}
          noWrap
        >
          {valueText ?? (value !== undefined ? formatCount(value) : '—')}
        </Typography>
      </Box>
    </Paper>
  )
}

// ── Language grid — filters out < 0.1 % noise ──

function LanguageGrid({ dist }: { dist: Record<string, number> | undefined }) {
  const langs = useMemo(() => {
    const total = Object.values(dist ?? {}).reduce((a, b) => a + b, 0)
    if (total === 0) return []
    return topByValue(dist, 30)
      .map(([lang, loc]) => ({ lang, loc, pct: (loc / total) * 100 }))
      .filter(l => l.pct >= 0.1)
  }, [dist])

  if (langs.length === 0) return null

  return (
    <Box className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {langs.map(({ lang, loc, pct }) => (
        <Box key={lang}>
          <Box className="flex justify-between items-center mb-1">
            <Typography variant="caption" color="text.primary" fontWeight={600}>{lang}</Typography>
            <Typography variant="caption" color="text.secondary">{pct.toFixed(1)}%</Typography>
          </Box>
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
          <Typography variant="caption" color="text.primary" sx={{ mt: 0.5, display: 'block', opacity: 0.6 }}>
            {formatCount(loc)} files
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// RepoCard, RepoDetailBody, ServiceGraph → ArchRepos.tsx
