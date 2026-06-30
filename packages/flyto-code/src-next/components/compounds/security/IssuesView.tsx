import { useState, useMemo, useCallback } from 'react'
import { useRepoFilter } from '@hooks/useRepoFilter'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Key, Shield } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { getEnrichedOrgIssues, updateIssueStatus, type EnrichedSecurityIssue } from '@lib/engine'
import { ContextStrip } from '@atoms/ContextStrip'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { JellyCard } from '@atoms/JellyCard'
import { GatedButton } from '@atoms/GatedButton'
import { useFixQueue } from '@/contexts/FixQueueContext'
import { Sparkles, Wand2 } from 'lucide-react'
import { VerifyFindingModal } from './VerifyFindingModal'
import { UniversalFindingPanel } from '@compounds/_shared/UniversalFindingPanel'
import { PackageFindingDrawer } from './PackageFindingDrawer'
import { getTypeBadge, sevChipProps, hasContextSignals, IssueActionMenu, TAB_VALUES, type IssueTab } from './IssueHelpers'
import { colors } from '@/styles/designTokens'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { TabBar } from '@atoms/TabBar'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Chip from '@mui/material/Chip'
import Pagination from '@mui/material/Pagination'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import SearchIcon from '@mui/icons-material/Search'

const PAGE_SIZE = 50

/* ------------------------------------------------------------------ */
/*  Main IssuesView component                                          */
/* ------------------------------------------------------------------ */

interface IssuesViewProps {
  onNavigate?: (section: string) => void
  fixedType?: string
  initialCategory?: string
  title?: string
}

const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
} as const

export function IssuesView({ onNavigate, fixedType, title }: IssuesViewProps = {}) {
  const { org } = useOrg()
  const qc = useQueryClient()
  const fixQueue = useFixQueue()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<IssueTab>(() => {
    const v = searchParams.get('tab')
    return (v === 'open' || v === 'snoozed' || v === 'ignored' || v === 'solved') ? v : 'open'
  })
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [severity, setSeverity] = useState(() => searchParams.get('sev') ?? '')
  const [type, setType] = useState(() => fixedType ?? searchParams.get('type') ?? '')
  const { repoId: repo, setRepo: setGlobalRepo } = useRepoFilter()
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('page'))
    return p > 0 ? p : 1
  })
  const [verifyTarget, setVerifyTarget] = useState<{ fingerprint: string; repoId: string } | null>(null)
  // Package-aggregate drawer — opens when operator clicks a
  // `pkg@version` chip on a CVE row to see how that single package
  // affects the rest of the org (repos / open PRs / autofix /
  // taint / verifications). Closing resets to null.
  const [packageDrawer, setPackageDrawer] = useState<{ pkg: string; type: string } | null>(null)
  const [selectedFp, setSelectedFp] = useState<string | null>(null)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())

  const updateParam = useCallback((key: string, value: string, defaultValue = '') => {
    setSearchParams(prev => {
      if (value === defaultValue) prev.delete(key)
      else prev.set(key, value)
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const [statusError, setStatusError] = useState<string | null>(null)
  const [snoozeTarget, setSnoozeTarget] = useState<string | null>(null)

  const statusMut = useMutation({
    mutationFn: ({ fingerprint, status, snoozeDays }: { fingerprint: string; status: 'snoozed' | 'ignored' | 'solved' | 'open'; snoozeDays?: number }) =>
      updateIssueStatus(org!.id, fingerprint, status, snoozeDays),
    onSuccess: () => {
      setStatusError(null)
      qc.invalidateQueries({ queryKey: qk.security.issues(org?.id) })
    },
    onError: (err: Error) => {
      setStatusError(err.message || t('common.loadError'))
    },
  })

  // P2-8: severity / type / repo are filtered server-side now so a
  // large org doesn't ship its whole issue list down to render 30 rows.
  // They're part of the query key, so flipping any filter refetches the
  // narrowed set. `status` is intentionally NOT sent — every tab needs
  // its rows resident so tab-switching is instant (no refetch), and the
  // engine's status `counts` are computed over ALL issues regardless of
  // these filters, so the tab badges stay stable. Search + the sidebar
  // category stay client-side (pure UI state over the loaded subset).
  const effectiveType = fixedType ?? type
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.security.issuesEnrichedFiltered(org?.id, severity, effectiveType, repo),
    queryFn: () => getEnrichedOrgIssues(org!.id, {
      ...(severity && { severity }),
      ...(effectiveType && { type: effectiveType }),
      ...(repo && { repo }),
    }),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const allIssues = data?.issues ?? []
  // Tab badge counts come from the engine, which computes them over ALL
  // issues (every lifecycle state, ignoring severity/type/repo) — so the
  // badges don't drop when the server-side filters narrow the table.
  const serverCounts = data?.counts
  const counts = {
    open: serverCounts?.open ?? allIssues.filter(i => i.status === 'open').length,
    snoozed: serverCounts?.snoozed ?? allIssues.filter(i => i.status === 'snoozed').length,
    ignored: serverCounts?.ignored ?? allIssues.filter(i => i.status === 'ignored').length,
    solved: serverCounts?.solved ?? allIssues.filter(i => i.status === 'solved').length,
    total: serverCounts?.total ?? allIssues.length,
  }
  const issues = allIssues.filter(i => i.status === tab)

  // The repo dropdown + sidebar repo list must stay complete even when
  // a repo filter is active (otherwise selecting a repo would collapse
  // the picker to that one repo, since the loaded set is now server-
  // filtered). Source the repo universe from the org's connected repos
  // rather than from the filtered issue list. Falls back to issue-
  // derived repos before the connected-repos query resolves so the
  // picker is never empty on first paint.
  const { data: connectedRepos } = useConnectedRepos(org?.id)

  // search is the only client-side filter; severity/type/repo are server-side.
  const filtered = useMemo(() => {
    if (!search) return issues
    const q = search.toLowerCase()
    return issues.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.repo_name.toLowerCase().includes(q),
    )
  }, [issues, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageIssues = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const resetPage = useCallback(() => {
    setPage(1)
    updateParam('page', '')
  }, [updateParam])

  const repoOptions = useMemo(() => {
    if (connectedRepos && connectedRepos.length > 0) {
      return connectedRepos.map(r => ({ id: r.id, name: r.fullName }))
    }
    const seen = new Map<string, string>()
    for (const i of issues) {
      if (!seen.has(i.repo_id)) seen.set(i.repo_id, i.repo_name)
    }
    return Array.from(seen, ([id, name]) => ({ id, name }))
  }, [connectedRepos, issues])

  const tabLabels: Record<IssueTab, string> = {
    open: t('issues.feed'),
    snoozed: t('issues.snoozed'),
    ignored: t('issues.ignored'),
    solved: t('issues.solved'),
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <Typography component="h1" sx={visuallyHidden}>
        {title ?? t('issues.title')}
      </Typography>
      {/* ============================================================ */}
      {/* MAIN PANEL — Tabs + Filters + Table                          */}
      {/* ============================================================ */}
      <JellyCard delay={0} noHover style={{ flex: 1, display: 'flex', minWidth: 0 }}>
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          borderRadius: 0,
          bgcolor: 'background.paper',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* Tabs + Fix Queue CTA on the right. The CTA opens the
            same drawer every other entry-point on the dashboard /
            pulse uses, so the operator's "I want to act on this"
            muscle memory carries across pages. Filter context
            comes from the current sidebar category (autofix /
            taint / pr — derived below) when possible. */}
        <Box sx={{
          display: 'flex', alignItems: 'center',
          borderBottom: 1, borderColor: 'divider',
          // Section accent rail — mirrors the manager-mode header so
          // toggling between modes reads as the same page (brand hue
          // only; surface stays theme palette, dual-mode safe).
          borderTop: `2px solid ${colors.brand}`,
        }}>
          <TabBar
            value={tab}
            onChange={(v) => { const tv = v as IssueTab; setTab(tv); updateParam('tab', tv, 'open'); resetPage() }}
            noDivider
            sx={{
              flex: 1, px: 2, minHeight: 44,
              '& .MuiTab-root': { minHeight: 44, fontWeight: 500 },
            }}
            items={TAB_VALUES.map((t_val) => ({
              value: t_val,
              label: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {tabLabels[t_val]}
                  {counts[t_val] > 0 && (
                    <Chip
                      label={counts[t_val]}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: 12,
                        fontWeight: 600,
                        bgcolor: tab === t_val ? 'primary.main' : 'action.selected',
                        color: tab === t_val ? 'primary.contrastText' : 'text.secondary',
                      }}
                    />
                  )}
                </Box>
              ),
            }))}
          />
          {tab === 'open' && counts.open > 0 && (
            <Button
              size="small"
              variant="contained"
              color="inherit"
              disableElevation
              startIcon={<Wand2 size={14} />}
              onClick={() => fixQueue.open({ filter: 'all' })}
              sx={{
                mr: 2, ml: 1, my: 0.5,
                textTransform: 'none', fontWeight: 700,
                bgcolor: '#7c3aed', color: '#fff',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' },
                '&:active': { bgcolor: '#5b21b6', boxShadow: 'none' },
              }}
            >
              {t('issues.openFixQueue')}
            </Button>
          )}
        </Box>

        {/* Filters bar */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            px: 2,
            py: 1.5,
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <TextField
            size="small"
            placeholder={t('issues.search')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); updateParam('q', e.target.value); resetPage() }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ minWidth: 180, flex: '1 1 180px', maxWidth: 280 }}
          />

          <FormControl size="small" sx={{ minWidth: 120, maxWidth: 160 }}>
            <InputLabel>{t('issues.severity')}</InputLabel>
            <Select
              value={severity}
              label={t('issues.severity')}
              onChange={(e) => { setSeverity(e.target.value); updateParam('sev', e.target.value); resetPage() }}
            >
              <MenuItem value="">{t('issues.allSeverities')}</MenuItem>
              <MenuItem value="CRITICAL">{t('issues.critical')}</MenuItem>
              <MenuItem value="HIGH">{t('issues.high')}</MenuItem>
              <MenuItem value="MODERATE">{t('issues.moderate')}</MenuItem>
              <MenuItem value="LOW">{t('issues.low')}</MenuItem>
            </Select>
          </FormControl>

          {!fixedType && (
            <FormControl size="small" sx={{ minWidth: 120, maxWidth: 180 }}>
              <InputLabel>{t('issues.type')}</InputLabel>
              <Select
                value={type}
                label={t('issues.type')}
                onChange={(e) => { setType(e.target.value); updateParam('type', e.target.value); resetPage() }}
              >
                <MenuItem value="">{t('issues.allTypes')}</MenuItem>
                <MenuItem value="cve">{t('issues.typeCve')}</MenuItem>
                <MenuItem value="secret">{t('issues.typeSecret')}</MenuItem>
                <MenuItem value="security_finding">{t('issues.typeSecurityFinding')}</MenuItem>
              </Select>
            </FormControl>
          )}

          <FormControl size="small" sx={{ minWidth: 160, maxWidth: 220 }}>
            <InputLabel>{t('issues.repo')}</InputLabel>
            <Select
              value={repo}
              label={t('issues.repo')}
              onChange={(e) => { const val = e.target.value; const r = repoOptions.find(x => x.id === val); setGlobalRepo(val, r?.name ?? val); resetPage() }}
            >
              <MenuItem value="">{t('issues.allRepos')}</MenuItem>
              {repoOptions.map((r) => (
                <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

        </Box>

        {/* Status mutation error */}
        {statusError && (
          <Alert
            severity="error"
            onClose={() => setStatusError(null)}
            sx={{ mx: 2, mt: 1, borderRadius: 1 }}
          >
            {statusError}
          </Alert>
        )}

        {/* Content area — scrollable */}
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {/* Loading */}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {/* Error */}
          {isError && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6, gap: 1, color: 'text.secondary' }}>
              <AlertTriangle size={20} style={{ color: 'inherit' }} />
              <Typography variant="body2">{t('common.loadError')}</Typography>
            </Box>
          )}

          {/* Empty state — operator-friendly split:
                 - "Open" tab + no filters + no issues at all
                   → green-glow cleared celebration (mirrors Pulse
                     + Fix Queue cleared empty state)
                 - any filter active OR a different tab
                   → standard EmptyStateGuide
              */}
          {!isLoading && !isError && filtered.length === 0 && (
            tab === 'open' && counts.open === 0 && allIssues.length > 0 ? (
              <Box sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 1.5, py: 8, px: 3, mx: 'auto', maxWidth: 520, mt: 4,
                borderRadius: 2,
                bgcolor: '#22c55e0d',
                border: '1px solid', borderColor: '#22c55e40',
              }}>
                <Box sx={{
                  width: 64, height: 64, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: '#22c55e20',
                }}>
                  <Sparkles size={30} style={{ color: '#16a34a' }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#16a34a' }}>
                  {t('issues.allClearTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, textAlign: 'center' }}>
                  {t('issues.allClearDesc')}
                </Typography>
              </Box>
            ) : (
              <EmptyStateGuide
                icon={<Shield size={28} />}
                title={t('issues.noIssuesTitle')}
                description={t('issues.noIssuesDesc')}
              />
            )
          )}

          {/* Table */}
          {/* Bulk action bar */}
          {bulkSelected.size > 0 && (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, mb: 1,
              borderRadius: 2, bgcolor: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)',
            }}>
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                {bulkSelected.size} {t('issues.selected')}
              </Typography>
              <GatedButton action="finding:update" size="small" variant="outlined" sx={{ textTransform: 'none', fontSize: 12 }}
                disabled={statusMut.isPending}
                onClick={() => { bulkSelected.forEach(fp => statusMut.mutate({ fingerprint: fp, status: 'snoozed', snoozeDays: 7 })); setBulkSelected(new Set()) }}>
                {t('issues.bulkSnooze')}
              </GatedButton>
              <GatedButton action="finding:update" size="small" variant="outlined" sx={{ textTransform: 'none', fontSize: 12 }}
                disabled={statusMut.isPending}
                onClick={() => { bulkSelected.forEach(fp => statusMut.mutate({ fingerprint: fp, status: 'ignored' })); setBulkSelected(new Set()) }}>
                {t('issues.bulkIgnore')}
              </GatedButton>
              <GatedButton action="finding:update" size="small" variant="outlined" sx={{ textTransform: 'none', fontSize: 12 }}
                disabled={statusMut.isPending}
                onClick={() => { bulkSelected.forEach(fp => statusMut.mutate({ fingerprint: fp, status: 'solved' })); setBulkSelected(new Set()) }}>
                {t('issues.bulkSolve')}
              </GatedButton>
              <Button size="small" sx={{ textTransform: 'none', fontSize: 12, ml: 'auto' }}
                onClick={() => setBulkSelected(new Set())}>
                {t('common.cancel')}
              </Button>
            </Box>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" sx={{ width: 40 }}>
                      <Checkbox
                        size="small"
                        checked={bulkSelected.size > 0 && bulkSelected.size === pageIssues.length}
                        indeterminate={bulkSelected.size > 0 && bulkSelected.size < pageIssues.length}
                        onChange={(_, checked) => {
                          if (checked) setBulkSelected(new Set(pageIssues.map(i => i.fingerprint)))
                          else setBulkSelected(new Set())
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', width: 64 }}>{t('issues.type')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>{t('issues.name')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', width: 100 }}>{t('issues.severity')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', width: 180 }}>{t('issues.location')}</TableCell>
                    <TableCell sx={{ width: 48 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageIssues.map((issue) => {
                    const badge = getTypeBadge(issue)
                    const sev = sevChipProps(issue.severity)
                    return (
                      <TableRow
                        key={issue.id || issue.fingerprint}
                        hover
                        selected={bulkSelected.has(issue.fingerprint)}
                        sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                        onClick={() => setSelectedFp(issue.fingerprint)}
                      >
                        <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            size="small"
                            checked={bulkSelected.has(issue.fingerprint)}
                            onChange={(_, checked) => {
                              setBulkSelected(prev => {
                                const next = new Set(prev)
                                if (checked) next.add(issue.fingerprint)
                                else next.delete(issue.fingerprint)
                                return next
                              })
                            }}
                          />
                        </TableCell>
                        {/* Type */}
                        <TableCell>
                          {issue.type === 'secret' ? (
                            <Chip
                              icon={<Key size={12} />}
                              label={badge.label}
                              size="small"
                              color={badge.color}
                              variant="outlined"
                              sx={{ fontWeight: 600, fontSize: 12 }}
                            />
                          ) : issue.type === 'security_finding' ? (
                            <Chip
                              icon={<AlertTriangle size={12} />}
                              label={badge.label}
                              size="small"
                              color={badge.color}
                              variant="outlined"
                              sx={{ fontWeight: 600, fontSize: 12 }}
                            />
                          ) : (
                            <Chip
                              label={badge.label}
                              size="small"
                              color={badge.color}
                              variant="outlined"
                              sx={{ fontWeight: 600, fontSize: 12 }}
                            />
                          )}
                        </TableCell>

                        {/* Name / Description / Enrichment */}
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', lineHeight: 1.4 }}>
                            {issue.title}
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                            {issue.description}
                            {issue.fixed_in && (
                              <Box component="span" sx={{ color: 'success.main', ml: 1 }}>
                                {t('issues.fixedIn')}: {issue.fixed_in}
                              </Box>
                            )}
                          </Typography>

                          {/* Per-finding detail enrichment */}
                          {(issue.cve_id || issue.published_at || (issue.package && issue.version) || (issue.references && issue.references.length > 0)) && (
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5, fontSize: 12, color: 'text.secondary' }}>
                              {issue.package && issue.version && (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: 'monospace',
                                    cursor: 'pointer',
                                    color: 'primary.main',
                                    textDecoration: 'underline dotted',
                                    textUnderlineOffset: 3,
                                    '&:hover': { color: 'primary.dark', textDecoration: 'underline' },
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setPackageDrawer({ pkg: issue.package!, type: issue.type ?? 'cve' })
                                  }}
                                  title={t('issues.packageDrawer.hint')}
                                >
                                  {t('issues.affectedPackage', { package: issue.package, version: issue.version })}
                                  {issue.fixed_in ? ` (${t('issues.vulnerableUntil', { version: issue.fixed_in })})` : ''}
                                </Typography>
                              )}
                              {issue.cve_id && (
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {issue.cve_id}
                                </Typography>
                              )}
                              {issue.in_kev && (
                                <Chip label={t('issues.kev')} size="small" sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: '#dc262622', color: '#dc2626' }} />
                              )}
                              {issue.epss !== undefined && issue.epss > 0 && (
                                <Chip
                                  label={t('issues.epssScore', { score: Math.round(issue.epss * 100) })}
                                  size="small"
                                  sx={{
                                    height: 18, fontSize: 12, fontWeight: 700,
                                    bgcolor: issue.epss > 0.1 ? '#f9731622' : '#94a3b822',
                                    color: issue.epss > 0.1 ? '#f97316' : '#94a3b8',
                                  }}
                                />
                              )}
                              {issue.external_exposed && (
                                <Chip label={t('dim.exposed')} size="small" sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: '#ef444422', color: '#ef4444' }} />
                              )}
                              {issue.risk_score !== undefined && issue.risk_score > 0 && (
                                <Chip
                                  label={t('issues.riskScore', { score: issue.risk_score })}
                                  size="small"
                                  sx={{
                                    height: 18, fontSize: 12, fontWeight: 700,
                                    bgcolor: issue.risk_score >= 70 ? '#ef444422' : issue.risk_score >= 40 ? '#f9731622' : '#22c55e22',
                                    color: issue.risk_score >= 70 ? '#ef4444' : issue.risk_score >= 40 ? '#f97316' : '#22c55e',
                                  }}
                                />
                              )}
                              {issue.published_at && (
                                <Typography variant="body2">
                                  {t('issues.published')}: {issue.published_at.slice(0, 10)}
                                </Typography>
                              )}
                              {issue.references && issue.references.length > 0 && (
                                <Box component="span" sx={{ display: 'flex', gap: 0.75 }}>
                                  <Typography variant="body2">{t('common.refs')}</Typography>
                                  {issue.references.slice(0, 3).map((url, i) => (
                                    <Typography
                                      key={i}
                                      component="a"
                                      variant="body2"
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                      sx={{ color: 'info.light', textDecoration: 'underline' }}
                                      title={url}
                                    >
                                      [{i + 1}]
                                    </Typography>
                                  ))}
                                  {issue.references.length > 3 && (
                                    <Typography variant="body2">+{issue.references.length - 3}</Typography>
                                  )}
                                </Box>
                              )}
                            </Box>
                          )}

                          {/* Cross-dim context */}
                          {hasContextSignals(issue) && (
                            <Box sx={{ mt: 0.5 }}>
                              <ContextStrip
                                signals={{
                                  open_prs_touching: (issue as EnrichedSecurityIssue).open_prs_touching,
                                  taint_adjacency:   (issue as EnrichedSecurityIssue).taint_adjacency,
                                  autofix_eligible:  (issue as EnrichedSecurityIssue).autofix_eligible,
                                  pentest_verdict:   (issue as EnrichedSecurityIssue).pentest_verdict,
                                  blast_radius:      (issue as EnrichedSecurityIssue).blast_radius,
                                }}
                              />
                            </Box>
                          )}
                        </TableCell>

                        {/* Severity */}
                        <TableCell>
                          <Chip
                            label={sev.label}
                            size="small"
                            color={sev.color}
                            sx={{
                              fontWeight: 700,
                              fontSize: 12,
                              height: 22,
                              ...(sev.sx ?? {}),
                            }}
                          />
                        </TableCell>

                        {/* Location / Repo */}
                        <TableCell>
                          <Chip
                            label={issue.repo_name}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontSize: 12,
                              fontFamily: 'monospace',
                              color: 'text.secondary',
                              borderColor: 'divider',
                            }}
                          />
                        </TableCell>

                        {/* Actions */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <IssueActionMenu
                            tab={tab}
                            isPending={statusMut.isPending}
                            onVerify={() => setVerifyTarget({ fingerprint: issue.fingerprint, repoId: issue.repo_id })}
                            onSnooze={() => setSnoozeTarget(issue.fingerprint)}
                            onIgnore={() => statusMut.mutate({ fingerprint: issue.fingerprint, status: 'ignored' })}
                            onSolve={() => statusMut.mutate({ fingerprint: issue.fingerprint, status: 'solved' })}
                            onReopen={() => statusMut.mutate({ fingerprint: issue.fingerprint, status: 'open' })}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {/* Pagination */}
        {!isLoading && !isError && filtered.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('issues.count', { count: filtered.length })}
            </Typography>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, p) => { setPage(p); updateParam('page', String(p), '1') }}
              size="small"
              shape="rounded"
            />
          </Box>
        )}
      </Paper>
      </JellyCard>

      {/* Snooze duration picker */}
      {snoozeTarget && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 1300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(0,0,0,0.5)',
        }} onClick={() => setSnoozeTarget(null)}>
          <Paper sx={{ p: 3, maxWidth: 320, borderRadius: 3 }} onClick={e => e.stopPropagation()}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
              {t('issues.snoozeDuration')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('issues.snoozeDesc')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {([
                { days: 1, label: t('issues.snoozeOneDay') },
                { days: 7, label: t('issues.snoozeOneWeek') },
                { days: 14, label: t('issues.snoozeTwoWeeks') },
                { days: 30, label: t('issues.snoozeThirtyDays') },
              ] as const).map(opt => (
                <GatedButton
                  action="finding:update"
                  key={opt.days}
                  variant="outlined"
                  size="small"
                  fullWidth
                  disabled={statusMut.isPending}
                  sx={{ textTransform: 'none', justifyContent: 'flex-start', fontWeight: 600 }}
                  onClick={() => {
                    statusMut.mutate({ fingerprint: snoozeTarget, status: 'snoozed', snoozeDays: opt.days })
                    setSnoozeTarget(null)
                  }}
                >
                  {opt.label}
                </GatedButton>
              ))}
            </Box>
          </Paper>
        </Box>
      )}

      {/* Modals */}
      {verifyTarget && (
        <VerifyFindingModal
          opened={!!verifyTarget}
          onClose={() => {
            qc.invalidateQueries({ queryKey: qk.security.repoVerifications(verifyTarget.repoId) })
            qc.invalidateQueries({ queryKey: qk.security.workflowExecutionAll() })
            setVerifyTarget(null)
          }}
          fingerprint={verifyTarget.fingerprint}
          repoId={verifyTarget.repoId}
        />
      )}

      <PackageFindingDrawer
        open={!!packageDrawer}
        orgId={org?.id ?? ''}
        pkg={packageDrawer?.pkg ?? null}
        type={packageDrawer?.type ?? 'cve'}
        onClose={() => setPackageDrawer(null)}
      />

      <UniversalFindingPanel
        fingerprint={selectedFp}
        fallback={selectedFp ? allIssues.find(i => i.fingerprint === selectedFp) ?? null : null}
        relatedIssues={selectedFp ? (() => {
          const clicked = allIssues.find(i => i.fingerprint === selectedFp)
          if (!clicked?.package) return []
          return allIssues.filter(i => i.package === clicked.package && i.type === clicked.type)
        })() : undefined}
        onClose={() => setSelectedFp(null)}
        onNavigateRepo={onNavigate ? (repoId) => {
          setSelectedFp(null)
          onNavigate(`_repo:${repoId}`)
        } : undefined}
        onAction={(action, fingerprint) => {
          if (action === 'verify') {
            const issue = allIssues.find(i => i.fingerprint === fingerprint)
            if (issue) setVerifyTarget({ fingerprint, repoId: issue.repo_id })
          } else {
            const statusMap: Record<string, 'snoozed' | 'ignored' | 'solved' | 'open'> = {
              snooze: 'snoozed', ignore: 'ignored', solve: 'solved', reopen: 'open',
            }
            const mapped = statusMap[action]
            if (mapped) statusMut.mutate({ fingerprint, status: mapped })
          }
          setSelectedFp(null)
        }}
      />
    </Box>
  )
}
