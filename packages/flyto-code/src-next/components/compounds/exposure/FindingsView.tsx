/**
 * FindingsView — Bitsight-parity per-vendor findings list (v2).
 *
 * Orchestrator only: owns data fetching, filter/selection/column state,
 * and composes the table from extracted parts under ./findings/
 * (FacetRow, FindingRow + ExpandedAssets, HistoryDrawer) sharing the
 * column registry + persistence helpers in ./findings/types.
 *
 * Still deferred (phase 3G+):
 *   - Save Filter Set / named filter persistence is shipped; bulk select
 *     + actions shipped; inline asset expansion shipped.
 *   - Customize Columns toggle persistence shipped.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Box, Typography, Paper, Chip, Skeleton, Tooltip, Select, FormControlLabel,
  Switch, IconButton, TextField, Drawer, InputAdornment, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, Menu, MenuItem,
} from '@mui/material'
import {
  ChevronLeft, ChevronRight,
  Search, X, Settings2, BookmarkPlus, Bookmark,
  CheckCircle2, MessageSquarePlus,
  Inbox,
} from 'lucide-react'
import { useSnackbar } from 'notistack'
import { useOrg } from '@hooks/useOrg'
import { GatedButton } from '@atoms/GatedButton'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import {
  listFindings,
  listFindingFacets,
  bulkFindingsAction,
  type Finding,
  type FindingsFilter,
  type FindingSeverity,
  type FindingGrade,
  type AssetImportance,
} from '@lib/engine'
import {
  PAGE_SIZE, COLUMNS, columnLabel, type SavedFilterSet,
  loadVisibleColumns, saveVisibleColumns, loadSavedSets, saveSavedSets,
} from './findings/types'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { QueryError } from '@atoms/QueryError'
import { VirtualList } from '@atoms/VirtualList'
import { FacetRow } from './findings/FacetRow'
import { FindingRow } from './findings/FindingRow'
import { HistoryDrawer } from './findings/HistoryDrawer'

export const findingsHeaderLayoutSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) max-content' },
  alignItems: 'start',
  gap: 2,
} as const

export const findingsHeaderActionsSx = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr) max-content 34px 34px',
    sm: 'minmax(220px, 280px) max-content 34px 34px',
  },
  alignItems: 'center',
  gap: 1,
  justifySelf: { xs: 'stretch', xl: 'end' },
  justifyContent: { xs: 'stretch', xl: 'end' },
  width: { xs: '100%', xl: 'auto' },
  maxWidth: '100%',
  minWidth: 0,
} as const

export const findingsHeaderSearchSx = {
  width: '100%',
  minWidth: 0,
  '& input': { fontSize: 13 },
} as const

export const findingsSavedSetButtonSx = {
  minWidth: 78,
  px: 1.25,
  textTransform: 'none',
  fontSize: 12,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  '& .MuiButton-startIcon': {
    mr: 0.75,
    flexShrink: 0,
  },
} as const

export const findingsHeaderIconButtonSx = {
  width: 34,
  height: 34,
  flexShrink: 0,
} as const

export function FindingsView() {
  const { org } = useOrg()
  const orgId = org?.id
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  const [severity, setSeverity] = useState<FindingSeverity | ''>('')
  const [grade, setGrade] = useState<FindingGrade | ''>('')
  const [importance, setImportance] = useState<AssetImportance | ''>('')
  const [source, setSource] = useState<string>('')
  const [category, setCategory] = useState<string>('')
  const [threatOnly, setThreatOnly] = useState(false)
  const [includeResolved, setIncludeResolved] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(0)
  const [drawerFinding, setDrawerFinding] = useState<Finding | null>(null)

  // Column visibility — localStorage-persisted per org. Always
  // includes the control columns (select, expand).
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() =>
    orgId ? loadVisibleColumns(orgId) : new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.id))
  )
  useEffect(() => {
    if (orgId) saveVisibleColumns(orgId, visibleCols)
  }, [orgId, visibleCols])
  const [columnsModalOpen, setColumnsModalOpen] = useState(false)

  // Saved filter sets — localStorage-persisted.
  const [savedSets, setSavedSets] = useState<SavedFilterSet[]>(() =>
    orgId ? loadSavedSets(orgId) : []
  )
  useEffect(() => {
    if (orgId) saveSavedSets(orgId, savedSets)
  }, [orgId, savedSets])
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<HTMLElement | null>(null)
  const [saveSetDialogOpen, setSaveSetDialogOpen] = useState(false)
  const [saveSetName, setSaveSetName] = useState('')

  // Bulk selection — Set of finding IDs.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [commentDialogOpen, setCommentDialogOpen] = useState(false)
  const [commentText, setCommentText] = useState('')

  // Multi-asset expansion — Set of finding IDs currently expanded.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Debounce search input → searchTerm so we don't refetch on every
  // keystroke. 300ms matches the convention used elsewhere in the app.
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  // Reset page whenever a filter changes.
  useEffect(() => {
    setPage(0)
  }, [severity, grade, importance, source, category, threatOnly, includeResolved, searchTerm])

  const { data: facets } = useQuery({
    queryKey: qk.exposure.findingsFacets(orgId, includeResolved),
    queryFn: () => listFindingFacets(orgId!, includeResolved),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.exposure.findingsPage(
      orgId,
      severity,
      grade,
      importance,
      source,
      category,
      threatOnly,
      includeResolved,
      searchTerm,
      page,
    ),
    queryFn: () => listFindings(orgId!, {
      severity: severity || undefined,
      grade: grade || undefined,
      asset_importance: importance || undefined,
      source: source || undefined,
      category: category || undefined,
      threat_only: threatOnly,
      include_resolved: includeResolved,
      q: searchTerm || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const rows = data?.findings ?? []
  const counts = facets?.counts_by_category ?? {}
  const categoryEntries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const hasActiveFilters = Boolean(
    severity || grade || importance || source || category || threatOnly || searchTerm,
  )
  const emptyCopy = hasActiveFilters
    ? {
        title: t('findings.emptyFilteredTitle'),
        description: t('findings.emptyFiltered'),
      }
    : {
        title: t('findings.emptyNotLoadedTitle'),
        description: includeResolved
          ? t('findings.emptyNotLoaded')
          : t('findings.emptyNoOpen'),
      }

  // Bulk action mutations.
  const bulkResolveMut = useMutation({
    mutationFn: () => bulkFindingsAction(orgId!, 'resolve', [...selected]),
    onSuccess: res => {
      enqueueSnackbar(`Resolved ${res.resolved ?? 0} findings`, { variant: 'success' })
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: qk.exposure.findingsBase(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.exposure.findingsFacets(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.exposure.findingHistoryBase(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.exposure.findingsManagerRollup(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.findingsManagerHistory(orgId) })
    },
    onError: e => enqueueSnackbar(t('hardcoded.bulk.resolve.failed.50c8bced') + (e as Error).message, { variant: 'error' }),
  })
  const bulkCommentMut = useMutation({
    mutationFn: (text: string) => bulkFindingsAction(orgId!, 'comment', [...selected], text),
    onSuccess: res => {
      enqueueSnackbar(`Comment added to ${res.applied_to ?? 0} findings`, { variant: 'success' })
      setSelected(new Set())
      setCommentDialogOpen(false)
      setCommentText('')
      // Refresh any open history drawer so the new comment shows immediately.
      qc.invalidateQueries({ queryKey: qk.exposure.findingHistoryBase(orgId), exact: false })
      qc.invalidateQueries({ queryKey: qk.exposure.findingsManagerHistory(orgId) })
    },
    onError: e => enqueueSnackbar(t('hardcoded.bulk.comment.failed.a11a5e9e') + (e as Error).message, { variant: 'error' }),
  })

  // Apply / save filter set.
  const currentFilter = useMemo<FindingsFilter>(() => ({
    severity: severity || undefined,
    grade: grade || undefined,
    asset_importance: importance || undefined,
    source: source || undefined,
    category: category || undefined,
    threat_only: threatOnly,
    include_resolved: includeResolved,
    q: searchTerm || undefined,
  }), [severity, grade, importance, source, category, threatOnly, includeResolved, searchTerm])

  function applyFilterSet(s: SavedFilterSet) {
    setSeverity((s.filter.severity as FindingSeverity | undefined) ?? '')
    setGrade((s.filter.grade as FindingGrade | undefined) ?? '')
    setImportance((s.filter.asset_importance as AssetImportance | undefined) ?? '')
    setSource(s.filter.source ?? '')
    setCategory(s.filter.category ?? '')
    setThreatOnly(!!s.filter.threat_only)
    setIncludeResolved(!!s.filter.include_resolved)
    setSearchInput(s.filter.q ?? '')
    setFilterMenuAnchor(null)
  }

  function saveCurrentSet() {
    const name = saveSetName.trim()
    if (!name) return
    setSavedSets(prev => [...prev.filter(s => s.name !== name), { name, filter: currentFilter }])
    setSaveSetDialogOpen(false)
    setSaveSetName('')
    enqueueSnackbar(`Filter set "${name}" saved`, { variant: 'success' })
  }

  // Build grid template + visible columns list dynamically. Header
  // and rows both consume `visibleColumns` so adding/removing a
  // column is one source of truth.
  const visibleColumns = useMemo(() =>
    COLUMNS.filter(c => visibleCols.has(c.id)),
    [visibleCols])
  const gridTemplate = visibleColumns.map(c => c.width).join(' ')

  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  function toggleSelectAll() {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        rows.forEach(r => next.delete(r.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        rows.forEach(r => next.add(r.id))
        return next
      })
    }
  }
  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Fixed header — section.exposure accent rail mirrors the
          manager view so toggling modes feels like the same page. */}
      <Box sx={{
        flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 3 }, pb: 2,
        borderBottom: '1px solid', borderColor: 'divider',
        borderLeft: `3px solid ${colors.section.exposure}`,
      }}>
        <Box sx={findingsHeaderLayoutSx}>
          <Box sx={{ minWidth: 0 }}>
            <Typography className="text-3xl leading-none font-semibold tracking-tight">
              {t('findings.title')}
            </Typography>
            <Typography className="ml-0.5 mt-1 text-base font-medium" color="text.secondary">
              {t('findings.subtitle')}
            </Typography>
          </Box>
          {/* Search box + action buttons — right side of header */}
          <Box data-testid="findings-header-actions" sx={findingsHeaderActionsSx}>
            <TextField
              data-testid="findings-header-search"
              size="small"
              placeholder={t('findings.searchPlaceholder')}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              sx={findingsHeaderSearchSx}
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
            <Tooltip title={t('findings.savedSets')} arrow>
              <Button
                size="small"
                variant="outlined"
                aria-label={t('findings.savedSets')}
                startIcon={<Bookmark size={14} />}
                onClick={e => setFilterMenuAnchor(e.currentTarget)}
                sx={findingsSavedSetButtonSx}
              >
                {savedSets.length || t('findings.savedSetsEmpty')}
              </Button>
            </Tooltip>
            <Tooltip title={t('findings.saveCurrent')} arrow>
	              <IconButton
	                size="small"
	                onClick={() => setSaveSetDialogOpen(true)}
	                aria-label={t('findings.saveCurrent')}
	                sx={findingsHeaderIconButtonSx}
	              >
	                <BookmarkPlus size={16} />
	              </IconButton>
            </Tooltip>
            <Tooltip title={t('findings.customizeColumns')} arrow>
	              <IconButton
	                size="small"
	                onClick={() => setColumnsModalOpen(true)}
	                aria-label={t('findings.customizeColumns')}
	                sx={findingsHeaderIconButtonSx}
	              >
	                <Settings2 size={16} />
	              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Saved filter sets dropdown menu */}
        <Menu
          anchorEl={filterMenuAnchor}
          open={!!filterMenuAnchor}
          onClose={() => setFilterMenuAnchor(null)}
          MenuListProps={{ dense: true }}
        >
          {savedSets.length === 0 && (
            <MenuItem disabled>
              <Typography variant="caption" color="text.secondary">
                {t('findings.noSavedSets')}
              </Typography>
            </MenuItem>
          )}
          {savedSets.map(s => (
            <MenuItem key={s.name} onClick={() => applyFilterSet(s)}>
              <Typography sx={{ fontSize: 13, flex: 1 }}>{s.name}</Typography>
              <IconButton
                size="small"
                aria-label={t('common.delete')}
                title={t('common.delete')}
                onClick={e => {
                  e.stopPropagation()
                  setSavedSets(prev => prev.filter(x => x.name !== s.name))
                }}
                sx={{ ml: 1 }}
              >
                <X size={12} />
              </IconButton>
            </MenuItem>
          ))}
        </Menu>

        {/* Bulk action toolbar — appears when ≥1 row selected */}
        {selected.size > 0 && (
          <Box sx={{
            mt: 2, p: 1.5, borderRadius: 1,
            bgcolor: 'primary.main', color: 'primary.contrastText',
            display: 'flex', alignItems: 'center', gap: 1.5,
          }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
              {selected.size} {t('findings.bulkSelected')}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <GatedButton
              action="finding:update"
              size="small"
              variant="contained"
              color="inherit"
              startIcon={<CheckCircle2 size={14} />}
              disabled={bulkResolveMut.isPending}
              onClick={() => bulkResolveMut.mutate()}
              sx={{ textTransform: 'none', fontSize: 12, color: 'primary.main' }}
            >
              {t('findings.bulkResolve')}
            </GatedButton>
            <GatedButton
              action="finding:update"
              size="small"
              variant="contained"
              color="inherit"
              startIcon={<MessageSquarePlus size={14} />}
              onClick={() => setCommentDialogOpen(true)}
              sx={{ textTransform: 'none', fontSize: 12, color: 'primary.main' }}
            >
              {t('findings.bulkComment')}
            </GatedButton>
            <IconButton
              size="small"
              onClick={() => setSelected(new Set())}
              aria-label={t('common.clearSelection')}
              title={t('common.clearSelection')}
              sx={{ color: 'inherit' }}
            >
              <X size={14} />
            </IconButton>
          </Box>
        )}

        {/* Filter chip bar */}
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
          <Select size="small" value={severity}
            onChange={e => setSeverity(e.target.value as FindingSeverity | '')}
            displayEmpty sx={{ minWidth: 140, fontSize: 13 }}>
            <option value="">{t('findings.allSeverity')}</option>
            <option value="critical">{t('common.critical')}</option>
            <option value="high">{t('common.high')}</option>
            <option value="medium">{t('common.medium')}</option>
            <option value="low">{t('common.low')}</option>
          </Select>
          <Select size="small" value={grade}
            onChange={e => setGrade(e.target.value as FindingGrade | '')}
            displayEmpty sx={{ minWidth: 140, fontSize: 13 }}>
            <option value="">{t('findings.allGrade')}</option>
            <option value="bad">{t('findings.gradeBad')}</option>
            <option value="warn">{t('findings.gradeWarn')}</option>
            <option value="fair">{t('findings.gradeFair')}</option>
            <option value="neutral">{t('findings.gradeNeutral')}</option>
            <option value="good">{t('findings.gradeGood')}</option>
          </Select>
          <Select size="small" value={importance}
            onChange={e => setImportance(e.target.value as AssetImportance | '')}
            displayEmpty sx={{ minWidth: 160, fontSize: 13 }}>
            <option value="">{t('findings.allImportance')}</option>
            <option value="critical">{t('common.critical')}</option>
            <option value="high">{t('common.high')}</option>
            <option value="medium">{t('common.medium')}</option>
            <option value="low">{t('common.low')}</option>
          </Select>
          <Select size="small" value={source}
            onChange={e => setSource(e.target.value)}
            displayEmpty sx={{ minWidth: 140, fontSize: 13 }}>
            <option value="">{t('findings.allSource')}</option>
            <option value="bitsight">{t('findings.sourceExternal')}</option>
            <option value="internal_scanner">{t('findings.sourceInternal')}</option>
          </Select>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={threatOnly}
                onChange={e => setThreatOnly(e.target.checked)}
                inputProps={{ 'aria-label': t('findings.threatOnly') }}
                slotProps={{ input: { 'aria-label': t('findings.threatOnly') } }}
              />
            }
            label={<Typography sx={{ fontSize: 13 }}>{t('findings.threatOnly')}</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={includeResolved}
                onChange={e => setIncludeResolved(e.target.checked)}
                inputProps={{ 'aria-label': t('findings.includeResolved') }}
                slotProps={{ input: { 'aria-label': t('findings.includeResolved') } }}
              />
            }
            label={<Typography sx={{ fontSize: 13 }}>{t('findings.includeResolved')}</Typography>}
          />
          {category && (
            <Chip
              size="small"
              label={`${t('findings.col.risk')}: ${category}`}
              onDelete={() => setCategory('')}
              sx={{ fontSize: 12 }}
            />
          )}
        </Box>
      </Box>

      {/* Two-column body: facet sidebar + table */}
      <Box sx={{
        flex: 1, minHeight: 0, display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Risk Vector facet sidebar */}
        <Box sx={{
          width: 220, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider',
          overflowY: 'auto', py: 2,
        }}>
          <Typography sx={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
            color: 'text.secondary', textTransform: 'uppercase',
            px: 2, mb: 1,
          }}>
            {t('findings.facetTitle')}
          </Typography>
          <Box>
            <FacetRow label={t('findings.facetAll')}
              count={Object.values(counts).reduce((a, b) => a + b, 0)}
              active={!category} onClick={() => setCategory('')} />
            {categoryEntries.map(([cat, n]) =>
              <FacetRow key={cat} label={cat} count={n} active={category === cat}
                onClick={() => setCategory(cat)} />
            )}
          </Box>
        </Box>

        {/* Table body — virtualized (windowed) for long result sets */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, px: { xs: 2, md: 3 }, py: 2 }}>
          {isError && (
            <QueryError error={error} onRetry={refetch} label={t('findings.title')} />
          )}
          {isLoading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={56} />)}
            </Box>
          )}
          {!isLoading && !isError && rows.length === 0 && (
            <EmptyStateGuide
              icon={<Inbox size={28} />}
              title={emptyCopy.title}
              description={emptyCopy.description}
            />
          )}
          {!isLoading && !isError && rows.length > 0 && (
            <Paper variant="outlined" sx={{ borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <VirtualList
                items={rows}
                estimateSize={56}
                getKey={(r) => r.id}
                sx={{ flex: 1, minHeight: 0 }}
                header={
                  /* Dynamic header — built from visibleColumns so adding /
                     removing a column flows from one source of truth. */
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: gridTemplate,
                    gap: 0.75, alignItems: 'center',
                    px: 2, py: 1.25,
                    borderBottom: '1px solid', borderColor: 'divider',
                    fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase',
                    letterSpacing: '0.04em', bgcolor: 'action.hover',
                  }}>
                    {visibleColumns.map(c => {
                      if (c.id === 'select') {
                        return (
                          <Checkbox
                            key={c.id} size="small" checked={allSelected}
                            indeterminate={!allSelected && rows.some(r => selected.has(r.id))}
                            onChange={toggleSelectAll}
                            sx={{ p: 0 }}
                          />
                        )
                      }
                      if (c.id === 'expand') return <span key={c.id} />
                      return <span key={c.id}>{columnLabel(c)}</span>
                    })}
                  </Box>
                }
                renderItem={(r) => (
                  <FindingRow
                    f={r}
                    orgId={orgId!}
                    visibleColumns={visibleColumns}
                    gridTemplate={gridTemplate}
                    selected={selected.has(r.id)}
                    onToggleSelect={() => toggleRow(r.id)}
                    expanded={expanded.has(r.id)}
                    onToggleExpand={() => toggleExpand(r.id)}
                    onOpen={() => setDrawerFinding(r)}
                  />
                )}
              />
            </Paper>
          )}

          {!isLoading && !isError && rows.length > 0 && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
                {t('findings.page')} {page + 1}{' · '}{rows.length} {t('findings.rows')}
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
                disabled={rows.length < PAGE_SIZE}
                onClick={() => setPage(p => p + 1)}
                aria-label={t('common.nextPage')}
                title={t('common.nextPage')}
              >
                <ChevronRight size={16} />
              </IconButton>
            </Box>
          )}
        </Box>
      </Box>

      {/* History drawer */}
      <Drawer
        anchor="right"
        open={!!drawerFinding}
        onClose={() => setDrawerFinding(null)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: { xs: '100vw', sm: 560 },
            maxWidth: '100vw',
            boxSizing: 'border-box',
            overflowX: 'hidden',
          },
        }}
      >
        {drawerFinding && <HistoryDrawer orgId={orgId!} finding={drawerFinding} />}
      </Drawer>

      {/* Customize Columns modal */}
      <Dialog open={columnsModalOpen} onClose={() => setColumnsModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          {t('findings.customizeColumns')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {t('findings.customizeHelp')}
          </Typography>
          {COLUMNS.filter(c => c.id !== 'select' && c.id !== 'expand').map(c => (
            <FormControlLabel
              key={c.id}
              control={
                <Checkbox
                  size="small"
                  checked={visibleCols.has(c.id)}
                  onChange={e => {
                    setVisibleCols(prev => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(c.id); else next.delete(c.id)
                      return next
                    })
                  }}
                />
              }
              label={<Typography sx={{ fontSize: 13 }}>{columnLabel(c)}</Typography>}
              sx={{ display: 'flex', width: '100%' }}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setColumnsModalOpen(false)}>
            {t('findings.done')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Save Filter Set dialog */}
      <Dialog open={saveSetDialogOpen} onClose={() => setSaveSetDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          {t('findings.saveSetTitle')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {t('findings.saveSetHelp')}
          </Typography>
          <TextField
            autoFocus fullWidth size="small"
            placeholder="e.g. Critical assets only"
            value={saveSetName}
            onChange={e => setSaveSetName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveCurrentSet() }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveSetDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={saveCurrentSet} variant="contained" disabled={!saveSetName.trim()}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Comment dialog */}
      <Dialog open={commentDialogOpen} onClose={() => setCommentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          {t('findings.commentTitle')} {selected.size} {t('findings.bulkSelected')}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth multiline minRows={3} maxRows={8}
            placeholder={t('findings.commentPlaceholder')}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={!commentText.trim() || bulkCommentMut.isPending}
            onClick={() => bulkCommentMut.mutate(commentText.trim())}
          >
            {t('findings.addComment')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
