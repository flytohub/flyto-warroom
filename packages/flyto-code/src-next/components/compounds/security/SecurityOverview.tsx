import { useEffect, useMemo, useState } from 'react'
import { useRepoFilter } from '@hooks/useRepoFilter'
import { useQuery } from '@tanstack/react-query'
import {
  Shield, AlertTriangle, Key,
  ShieldAlert, Bug, ChevronRight,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { Pagination } from '@atoms/Pagination'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { QueryError } from '@atoms/QueryError'
import { JellyCard } from '@atoms/JellyCard'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import { getOrgIssues, type ConnectedRepo, type SecurityIssue } from '@lib/engine'
import type { OrgWarRoomData } from '@compounds/_shared/warroom'
import {
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material'

// ── SecurityOverview — left: severity + repos, right: action list ──

interface Props {
  data: OrgWarRoomData
  repoNameMap: Record<string, ConnectedRepo>
  onNavigate?: (section: string) => void
}

const PAGE_SIZE = 25

const SEV_RANK: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MODERATE: 2, MEDIUM: 2, LOW: 3,
}

const SEV_MUI_COLOR: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  CRITICAL: 'error', HIGH: 'warning', MODERATE: 'warning', MEDIUM: 'warning', LOW: 'info',
}

function normalizeSeverity(severity?: string): string {
  const upper = severity?.toUpperCase()
  if (upper === 'MODERATE') return 'MEDIUM'
  return upper ?? 'LOW'
}

function typeIcon(type: string) {
  switch (type) {
    case 'cve':              return Bug
    case 'secret':           return Key
    case 'security_finding': return ShieldAlert
    default:                 return AlertTriangle
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case 'cve':              return t('warroom.actionTypeCve')
    case 'secret':           return t('warroom.actionTypeSecret')
    case 'security_finding': return t('warroom.actionTypeSast')
    default:                 return type
  }
}

function rankIssue(i: SecurityIssue): number {
  const sev = SEV_RANK[i.severity?.toUpperCase()] ?? 9
  const typeBoost = i.type === 'secret' ? -0.3 : 0
  return sev + typeBoost
}

export function SecurityOverview({ onNavigate }: Props) {
  const { org } = useOrg()
  const { data: connectedRepos } = useConnectedRepos(org?.id)
  const { data, isLoading, isError, error, refetch } = useQuery({
    // Was ['org-issues', …] which nothing invalidated, so this overview went
    // stale after scans/autofix (cache bug M-orgIssues). qk.security
    // .orgIssuesOpen → ['issues', o, 'org', 'open'] is prefix-matched by the
    // qk.security.issues(orgId) SSE invalidation.
    queryKey: qk.security.orgIssuesOpen(org?.id, 'open'),
    queryFn: () => getOrgIssues(org!.id, { status: 'open' }),
    enabled: !!org?.id,
    staleTime: 30_000,
  })

  const issues = data?.issues ?? []
  // Authoritative open-finding total from the server. The engine computes
  // `counts` over ALL open issues regardless of the materialised array, so the
  // header badge should report this rather than the (potentially capped)
  // `issues.length`. Falls back to the array length until the fetch resolves.
  const openTotal = data?.counts?.open ?? issues.length

  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const { repoId: repoFilter, setRepo, clearRepo } = useRepoFilter()
  const [page, setPage] = useState(1)

  // Per-repo issue counts — respects severity/type filter so numbers stay consistent
  const repoStats = useMemo(() => {
    const m = new Map<string, { name: string; count: number; critical: number }>()
    for (const i of issues) {
      // Apply severity + type filters (but NOT repo filter — this IS the repo selector)
      if (severityFilter) {
        if (i.type === 'secret') continue
	        const normalized = normalizeSeverity(i.severity)
        if (normalized !== severityFilter) continue
      }
      if (typeFilter && i.type !== typeFilter) continue
      const entry = m.get(i.repo_name) ?? { name: i.repo_name, count: 0, critical: 0 }
      entry.count++
      if (i.severity?.toUpperCase() === 'CRITICAL') entry.critical++
      m.set(i.repo_name, entry)
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count)
  }, [issues, severityFilter, typeFilter])

  // Severity breakdown — respects repo filter so numbers stay consistent
  const sevStats = useMemo(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, secrets: 0 }
    for (const i of issues) {
      // Apply repo filter (but NOT severity/type — this IS the severity selector)
      if (repoFilter && i.repo_name !== repoFilter) continue
      if (i.type === 'secret') { c.secrets++; continue }
      const s = i.severity?.toUpperCase()
      if (s === 'CRITICAL') c.CRITICAL++
      else if (s === 'HIGH') c.HIGH++
      else if (s === 'MEDIUM' || s === 'MODERATE') c.MEDIUM++
      else c.LOW++
    }
    return c
  }, [issues, repoFilter])

  const sorted = useMemo(
    () => [...issues].sort((a, b) => {
      const r = rankIssue(a) - rankIssue(b)
      if (r !== 0) return r
      return a.repo_name.localeCompare(b.repo_name)
    }),
    [issues],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sorted.filter(i => {
      if (severityFilter) {
        // secrets are filtered via typeFilter, not severity
        if (i.type === 'secret') return false
	        // MODERATE and MEDIUM are equivalent
	        const normalized = normalizeSeverity(i.severity)
        if (normalized !== severityFilter) return false
      }
      if (typeFilter && i.type !== typeFilter) return false
      if (repoFilter && i.repo_name !== repoFilter) return false
      if (q
        && !i.title?.toLowerCase().includes(q)
        && !i.package?.toLowerCase().includes(q)
        && !i.cve_id?.toLowerCase().includes(q)
      ) return false
      return true
    })
  }, [sorted, search, severityFilter, typeFilter, repoFilter])

  useEffect(() => { setPage(1) }, [search, severityFilter, typeFilter, repoFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 3, gap: 2 }}>
      <FlytoPageHeader
        title={t('warroom.secActionTitle')}
        subtitle={`${openTotal.toLocaleString('en-US')} ${t('warroom.secActionSub')}`}
      />

      {/* Left-right split */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 2 }}>

        {/* Left — severity breakdown + repo list */}
        <JellyCard delay={0} style={{ width: 260, flexShrink: 0, display: 'flex' }}>
        <Paper
          elevation={0}
          className="rounded-xl"
          sx={{
            bgcolor: 'background.paper', border: 1, borderColor: 'divider',
            width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Severity chips */}
          <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {t('warroom.secSeverity')}
            </Typography>
            <Box className="flex flex-wrap gap-1">
              {([
                { key: 'CRITICAL', label: t('common.critical'), count: sevStats.CRITICAL, color: '#ef4444' },
                { key: 'HIGH', label: t('common.high'), count: sevStats.HIGH, color: '#f97316' },
                { key: 'MEDIUM', label: t('common.medium'), count: sevStats.MEDIUM, color: '#eab308' },
                { key: 'LOW', label: t('common.low'), count: sevStats.LOW, color: '#38bdf8' },
              ] as const).map(s => (
                <Chip
                  key={s.key}
                  label={`${s.label} ${s.count}`}
                  size="small"
                  onClick={() => { setTypeFilter(''); setSeverityFilter(severityFilter === s.key ? '' : s.key) }}
                  sx={{
                    height: 22, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    bgcolor: severityFilter === s.key ? s.color : s.color + '22',
                    color: severityFilter === s.key ? '#fff' : s.color,
                  }}
                />
              ))}
              <Chip
                label={t('warroom.secretsCount').replace('{n}', String(sevStats.secrets))}
                size="small"
                onClick={() => { setSeverityFilter(''); setTypeFilter(typeFilter === 'secret' ? '' : 'secret') }}
                sx={{
                  height: 22, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  bgcolor: typeFilter === 'secret' ? '#e879f9' : '#e879f922',
                  color: typeFilter === 'secret' ? '#fff' : '#e879f9',
                }}
              />
            </Box>
          </Box>

          {/* Repo list — scrollable */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Box sx={{ px: 2, pt: 1.5, pb: 0.5, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary">
                {t('warroom.secRepos')} ({repoStats.length})
              </Typography>
            </Box>
            {repoStats.map(r => {
              const isSelected = r.name === repoFilter
              return (
                <Box
                  key={r.name}
                  component="button"
                  onClick={() => isSelected ? clearRepo() : setRepo(r.name, r.name)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    width: '100%', textAlign: 'left',
                    px: 2, py: 1,
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
                  {r.critical > 0 && (
                    <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                      {r.critical}C
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {r.count}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        </Paper>
        </JellyCard>

        {/* Right — findings list */}
        <JellyCard delay={0.04} style={{ flex: 1, minWidth: 0, display: 'flex' }}>
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
                placeholder={t('warroom.actionSearch')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Shield size={14} />
                      </InputAdornment>
                    ),
                    sx: { fontSize: 13 },
                  },
                }}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <FlytoSelect
                value={typeFilter === 'secret' ? '' : typeFilter}
                onChange={setTypeFilter}
                placeholder={t('warroom.actionAllTypes')}
                options={[
                  { value: '',                  label: t('warroom.actionAllTypes') },
                  { value: 'cve',               label: t('warroom.actionTypeCve') },
                  { value: 'security_finding',  label: t('warroom.actionTypeSast') },
                ]}
                minWidth={130}
                maxWidth={160}
                aria-label={t('warroom.actionAllTypes')}
              />
              <Chip
                label={`${filtered.length} / ${openTotal}`}
                size="small"
                sx={{ height: 22, fontSize: 13, fontWeight: 600 }}
              />
            </Box>
          </Box>

          {/* Issue list — scrollable */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {isLoading && (
              <Box className="flex items-center justify-center py-12">
                <CircularProgress size={20} />
              </Box>
            )}
            {isError && (
              <Box sx={{ p: 2 }}>
                <QueryError error={error} onRetry={refetch} compact label={t('security.label')} />
              </Box>
            )}
            {!isLoading && !isError && issues.length === 0 && (
              (connectedRepos?.length ?? 0) === 0 ? (
                <EmptyStateGuide
                  icon={<Shield size={28} />}
                  title={t('warroom.secNewOrgTitle')}
                  description={t('warroom.secNewOrgDesc')}
                  steps={[
                    { label: t('warroom.secStep1') },
                    { label: t('warroom.secStep2') },
                    { label: t('warroom.secStep3') },
                  ]}
                  primaryAction={onNavigate ? {
                    label: t('warroom.secPrimaryConnect'),
                    onClick: () => onNavigate('_repo'),
                  } : undefined}
                />
              ) : (
                <Box className="flex flex-col items-center gap-2 py-12">
                  <Shield size={32} style={{ opacity: 0.15 }} />
                  <Typography variant="body2" color="text.secondary">
                    {t('warroom.secActionEmpty')}
                  </Typography>
                </Box>
              )
            )}
            {!isLoading && !isError && filtered.length === 0 && issues.length > 0 && (
              <Box className="flex flex-col items-center gap-2 py-12">
                <Shield size={32} style={{ opacity: 0.15 }} />
                <Typography variant="body2" color="text.secondary">
                  {t('warroom.findingNoMatch')}
                </Typography>
              </Box>
            )}
            {pageItems.length > 0 && (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {pageItems.map((issue, idx) => (
                  <ActionRow
                    key={[
                      issue.id,
                      issue.fingerprint,
                      issue.repo_id,
                      issue.package,
                      issue.cve_id,
                      (safePage - 1) * PAGE_SIZE + idx,
                    ].filter(Boolean).join(':')}
                    issue={issue}
                    onJump={() => onNavigate?.('_repo:' + issue.repo_id)}
                  />
                ))}
              </Box>
            )}
          </Box>

          {/* Pagination — pinned bottom */}
          {filtered.length > PAGE_SIZE && (
            <Box sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0, px: 2, py: 1 }}>
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
        </JellyCard>
      </Box>
    </Box>
  )
}

function rollupPrimary(issue: SecurityIssue): string {
  const n = issue.count ?? 0
  if (issue.type === 'secret') {
    return `${n} ${t('warroom.secActionSecretsLabel')}`
  }
  if (issue.type === 'security_finding') {
    return `${n} ${t('warroom.secActionSastLabel')}`
  }
  return issue.title || '(unnamed)'
}

function ActionRow({ issue, onJump }: { issue: SecurityIssue; onJump: () => void }) {
  const Icon = typeIcon(issue.type)
  const sevUpper = (issue.severity || '').toUpperCase()
  const muiColor = SEV_MUI_COLOR[sevUpper] ?? 'default'

  let primary: string
  let secondary: string
  if (issue.rollup) {
    primary = rollupPrimary(issue)
    secondary = t('warroom.secActionRollupHint')
  } else if (issue.cve_id) {
    primary = issue.cve_id
    secondary = issue.package
      ? `${issue.package}${issue.version ? ` ${issue.version}` : ''}${issue.fixed_in ? ` \u2192 ${issue.fixed_in}` : ''}`
      : (issue.title ?? '')
  } else {
    primary = issue.package || issue.title || '(unnamed)'
    secondary = issue.title && issue.title !== primary ? issue.title : ''
  }

  return (
    <Box component="li" sx={{ borderRadius: 1, '&:hover': { bgcolor: 'action.hover' }, transition: 'background 0.15s' }}>
      <Box
        component="button"
        onClick={onJump}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, width: '100%',
          px: 1.5, py: 1, textAlign: 'left',
          background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <Chip
          label={issue.severity || '\u2014'}
          size="small"
          color={muiColor}
          variant="outlined"
          sx={{ fontWeight: 600, fontSize: 13, minWidth: 70, height: 22 }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, color: 'text.secondary' }}>
          <Icon size={11} />
          <Typography variant="caption" sx={{ fontSize: 13 }}>{typeLabel(issue.type)}</Typography>
          {issue.rollup && (
            <Chip
              label={t('warroom.secActionRollupBadge')}
              size="small"
              variant="outlined"
              sx={{ fontSize: 12, fontWeight: 700, height: 18, ml: 0.5 }}
              title={t('warroom.secActionRollupTip')}
            />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flexShrink: 0, fontSize: 12 }}>{issue.repo_name}</Typography>
        <Typography variant="caption" color="text.primary" sx={{ fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{secondary}</Typography>
        <ChevronRight size={12} style={{ flexShrink: 0, opacity: 0.4 }} />
      </Box>
    </Box>
  )
}
