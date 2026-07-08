import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Chip, Divider, IconButton, MenuItem, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Box as BoxIcon, ShieldCheck, Layers, Package, Search, ListFilter,
  ArrowRight, GitBranch, Play, Save, FileText, CheckCircle2, RotateCcw, ShieldOff,
} from 'lucide-react'
import { useSnackbar } from 'notistack'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { FlytoCodeBlock } from '@atoms/FlytoCodeBlock'
import { FlytoSurface } from '@atoms/FlytoSurface'
import { LoadingState } from '@components/atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { useConnectedRepos, useOrg } from '@hooks/useOrg'
import {
  falsePositiveContainerFinding,
  getContainerScanRunEvidence,
  listContainerConnections,
  listContainerFindings,
  listContainerScanRuns,
  reopenContainerFinding,
  runContainerConnectionScan,
  upsertContainerConnection,
  verifyContainerFinding,
  type ContainerConnection,
  type ContainerConnectionInput,
  type ContainerScanRun,
} from '@lib/engine'
import { getContainerPosture, type ContainerPosture } from '@lib/engine/code/posture'
import { Loading, ScanViewRoot, ScanViewHeader } from './_shared'
import { colors } from '@/styles/designTokens'
import { flytoTextStyles } from '@/styles/visualSystem'

const ACCENT = colors.tech
const SECURE = colors.semantic.success
const SEV: Record<string, string> = {
  CRITICAL: colors.severity.critical, HIGH: colors.severity.high, MEDIUM: colors.severity.medium, LOW: colors.severity.low,
}
const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
type ContainerSourceKind = 'repo_scan' | 'repo_manual' | 'registry_connection' | 'kubernetes_connection' | 'finding_verify' | 'unknown'

interface ContainerFinding {
  id: string
  repo_id?: string
  scan_run_id?: string
  source_type?: string
  source_ref?: string
  image_ref: string
  package_name: string
  installed_version: string
  fixed_version?: string
  severity: string
  cve_id?: string
  title: string
  status: string
  scanned_at: string
  resolved_at?: string
  resolution?: string
}

type ContainerFindingAction = 'verify' | 'false_positive' | 'reopen'
type ContainerTab = 'containers' | 'checks'

interface ContainerImageGroup {
  image: string
  items: ContainerFinding[]
  counts: Record<string, number>
  worst: number
}

interface ContainerSourceSection {
  key: string
  sourceKind: ContainerSourceKind
  sourceLabel: string
  sourceDescription: string
  subjectKindLabel: string
  subjectLabel: string
  subjectDetail: string
  items: ContainerFinding[]
  imageGroups: ContainerImageGroup[]
  counts: Record<string, number>
  worst: number
}

interface ContainerInventoryRow {
  id: string
  image: string
  name: string
  registry: string
  domain: string
  source: string
  issues: number
  counts: Record<string, number>
  worst: number
  lastScan?: string
}

function normSev(s: string): string {
  const u = (s || '').toUpperCase()
  return u in SEV ? u : 'LOW'
}
function sevRank(s: string): number {
  const i = SEV_ORDER.indexOf(normSev(s))
  return i === -1 ? 99 : i
}
function countSev(items: ContainerFinding[]): Record<string, number> {
  const c: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const f of items) c[normSev(f.severity)]++
  return c
}

export function ContainerScanView() {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const { org } = useOrg()
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const orgId = org?.id
  const [activeTab, setActiveTab] = useState<ContainerTab>('containers')
  const [inventorySearch, setInventorySearch] = useState('')
  const [inventorySource, setInventorySource] = useState('all')
  const [inventorySeverity, setInventorySeverity] = useState('all')
  const [checksSearch, setChecksSearch] = useState('')

  const reposQ = useConnectedRepos(orgId)
  const connectionsQ = useQuery({
    queryKey: qk.container.connections(orgId),
    queryFn: () => listContainerConnections(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const findingsQ = useQuery({
    queryKey: qk.container.findings(orgId),
    queryFn: () => listContainerFindings(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const postureQ = useQuery({
    queryKey: qk.container.posture(orgId),
    queryFn: () => getContainerPosture(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const findings = useMemo(
    () => (findingsQ.data?.findings ?? []) as ContainerFinding[],
    [findingsQ.data],
  )
  const posture = postureQ.data ?? null

  const sevCounts = useMemo(() => countSev(findings), [findings])
  const repoNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const repo of reposQ.data ?? []) m.set(repo.id, repo.fullName || repo.repoName || repo.id)
    return m
  }, [reposQ.data])
  const connectionById = useMemo(() => {
    const m = new Map<string, ContainerConnection>()
    for (const conn of connectionsQ.data?.connections ?? []) m.set(conn.id, conn)
    return m
  }, [connectionsQ.data])

  const lifecycleMut = useMutation({
    mutationFn: async ({ action, findingId }: { action: ContainerFindingAction; findingId: string }) => {
      if (!orgId) throw new Error('missing org')
      if (action === 'verify') return verifyContainerFinding(orgId, findingId)
      if (action === 'false_positive') return falsePositiveContainerFinding(orgId, findingId)
      return reopenContainerFinding(orgId, findingId)
    },
    onMutate: async ({ action, findingId }) => {
      if (!orgId || action === 'verify') return { previous: undefined }
      const key = qk.container.findings(orgId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<{ findings: ContainerFinding[] }>(key)
      const status = action === 'false_positive' ? 'false_positive' : 'open'
      const resolution = action === 'false_positive' ? 'false_positive' : 'reopened'
      qc.setQueryData<{ findings: ContainerFinding[] }>(key, old => ({
        ...(old ?? { findings: [] }),
        findings: (old?.findings ?? []).map(f => (
          f.id === findingId ? { ...f, status, resolution } : f
        )),
      }))
      return { previous }
    },
    onSuccess: () => {
      enqueueSnackbar(t('warroom.containerActionQueued'), { variant: 'success' })
    },
    onError: (_err, _vars, ctx) => {
      if (orgId && ctx?.previous) {
        qc.setQueryData(qk.container.findings(orgId), ctx.previous)
      }
      enqueueSnackbar(t('warroom.containerActionFailed'), { variant: 'error' })
    },
    onSettled: () => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: qk.container.findings(orgId) })
      qc.invalidateQueries({ queryKey: qk.container.runs(orgId) })
      qc.invalidateQueries({ queryKey: qk.container.posture(orgId) })
    },
  })

  const sourceSections = useMemo(
    () => buildContainerSourceSections(findings, repoNameById, connectionById),
    [findings, repoNameById, connectionById],
  )
  const inventoryRows = useMemo(
    () => buildContainerInventoryRows(sourceSections),
    [sourceSections],
  )
  const inventorySources = useMemo(
    () => Array.from(new Set(inventoryRows.map(row => row.source))).sort((a, b) => a.localeCompare(b)),
    [inventoryRows],
  )
  const visibleInventoryRows = useMemo(
    () => filterContainerInventoryRows(inventoryRows, inventorySearch, inventorySource, inventorySeverity),
    [inventoryRows, inventorySearch, inventorySource, inventorySeverity],
  )
  const visibleSourceSections = useMemo(
    () => filterContainerSourceSections(sourceSections, checksSearch),
    [sourceSections, checksSearch],
  )

  const loading = findingsQ.isLoading || postureQ.isLoading
  const errored = findingsQ.isError || postureQ.isError
  const loadError = findingsQ.error ?? postureQ.error

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={BoxIcon}
        title={t('scoring.containerScan')}
        subtitle={t('warroom.containerSub')}
        count={findings.length}
      />

      <Box sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}>
        <ContainerTabs
          active={activeTab}
          onChange={setActiveTab}
          imageCount={inventoryRows.length || posture?.image_count || 0}
          findingsCount={findings.length}
        />

        {activeTab === 'containers' && (
          <Box
            sx={{
              minHeight: 0,
              minWidth: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
              pr: 0.5,
              pb: 0.5,
            }}
          >
            <ContainerInventoryView
              rows={visibleInventoryRows}
              totalRows={inventoryRows.length}
              search={inventorySearch}
              source={inventorySource}
              severity={inventorySeverity}
              sources={inventorySources}
              sevCounts={sevCounts}
              posture={posture}
              dark={dark}
              onSearch={setInventorySearch}
              onSource={setInventorySource}
              onSeverity={setInventorySeverity}
              onClear={() => {
                setInventorySearch('')
                setInventorySource('all')
                setInventorySeverity('all')
              }}
              onInspect={(image) => {
                setChecksSearch(image)
                setActiveTab('checks')
              }}
            />
            <ContainerClosedLoopPanel orgId={orgId} dark={dark} />
          </Box>
        )}

        {activeTab === 'checks' && (
          <Box
            data-testid="container-findings-scroll"
            sx={{
              minHeight: 0,
              minWidth: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              pr: 0.5,
              pb: 0.5,
            }}
          >
            {loading && <Loading />}

            {errored && !loading && (
              <QueryError
                error={loadError}
                onRetry={() => {
                  void findingsQ.refetch()
                  void postureQ.refetch()
                }}
                label={t('scoring.containerScan')}
                compact
              />
            )}

            {!loading && !errored && findings.length === 0 && (
              <SecurePanel imageCount={posture?.image_count ?? 0} dark={dark} />
            )}

            {!loading && !errored && findings.length > 0 && (
              <ContainerChecksToolbar
                search={checksSearch}
                onSearch={setChecksSearch}
                resultCount={visibleSourceSections.reduce((sum, section) => sum + section.items.length, 0)}
              />
            )}

            {!loading && !errored && visibleSourceSections.map(section => (
              <ContainerSourceSectionView
                key={section.key}
                section={section}
                dark={dark}
                busyFindingId={lifecycleMut.variables?.findingId}
                onAction={(action, findingId) => lifecycleMut.mutate({ action, findingId })}
              />
            ))}
          </Box>
        )}
      </Box>
    </ScanViewRoot>
  )
}

function ContainerTabs({ active, onChange, imageCount, findingsCount }: {
  active: ContainerTab
  onChange: (tab: ContainerTab) => void
  imageCount: number
  findingsCount: number
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  return (
    <Paper
      variant="outlined"
      sx={{
        flexShrink: 0,
        borderRadius: 1.25,
        borderColor: alpha(ACCENT, dark ? 0.34 : 0.22),
        bgcolor: dark ? alpha(colors.brandDarkest, 0.42) : alpha(theme.palette.background.paper, 0.92),
        p: 0.5,
        minWidth: 0,
      }}
    >
      <Tabs
        value={active}
        onChange={(_, value) => onChange(value as ContainerTab)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 40,
          '& .MuiTabs-indicator': { display: 'none' },
          '& .MuiTab-root': {
            minHeight: 40,
            px: 1.25,
            py: 0.55,
            mr: 0.5,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'transparent',
            color: 'text.secondary',
            textTransform: 'none',
            letterSpacing: 0,
            fontWeight: 850,
            alignItems: 'center',
          },
          '& .MuiTab-root.Mui-selected': {
            color: ACCENT,
            borderColor: alpha(ACCENT, 0.45),
            bgcolor: alpha(ACCENT, dark ? 0.16 : 0.09),
            boxShadow: `inset 0 0 0 1px ${alpha(ACCENT, dark ? 0.08 : 0.04)}`,
          },
        }}
      >
        <Tab
          value="containers"
          label={<ContainerTabLabel icon={<BoxIcon size={15} />} label={tOr('warroom.containerTabInventory', '\u5bb9\u5668\u6e05\u55ae')} count={imageCount} />}
          id="container-tab-inventory"
          aria-controls="container-panel-inventory"
        />
        <Tab
          value="checks"
          label={<ContainerTabLabel icon={<FileText size={15} />} label={tOr('warroom.containerTabChecks', 'CVE \u6aa2\u67e5')} count={findingsCount} hot={findingsCount > 0} />}
          id="container-tab-checks"
          aria-controls="container-panel-checks"
        />
      </Tabs>
    </Paper>
  )
}

function ContainerTabLabel({ icon, label, count, hot = false }: {
  icon: React.ReactNode
  label: string
  count: number
  hot?: boolean
}) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <Box sx={{ display: 'inline-flex', color: 'inherit' }}>{icon}</Box>
      <Typography component="span" sx={{ fontSize: 13, fontWeight: 900, lineHeight: 1 }} noWrap>
        {label}
      </Typography>
      <Chip
        size="small"
        label={count}
        sx={{
          height: 22,
          minWidth: 28,
          borderRadius: 0.8,
          fontWeight: 950,
          color: hot ? colors.severity.critical : 'text.primary',
          bgcolor: hot ? alpha(colors.severity.critical, 0.1) : 'action.selected',
          '& .MuiChip-label': { px: 0.75 },
        }}
      />
    </Box>
  )
}

function ContainerInventoryView({
  rows,
  totalRows,
  search,
  source,
  severity,
  sources,
  sevCounts,
  posture,
  dark,
  onSearch,
  onSource,
  onSeverity,
  onClear,
  onInspect,
}: {
  rows: ContainerInventoryRow[]
  totalRows: number
  search: string
  source: string
  severity: string
  sources: string[]
  sevCounts: Record<string, number>
  posture: ContainerPosture | null
  dark: boolean
  onSearch: (value: string) => void
  onSource: (value: string) => void
  onSeverity: (value: string) => void
  onClear: () => void
  onInspect: (image: string) => void
}) {
  const theme = useTheme()
  const activeFilters = !!search || source !== 'all' || severity !== 'all'
  const totalIssues = rows.reduce((sum, row) => sum + row.issues, 0)

  return (
    <Paper
      variant="outlined"
      sx={{
        flexShrink: 0,
        borderRadius: 2,
        overflow: 'hidden',
        borderColor: alpha(ACCENT, dark ? 0.32 : 0.22),
        bgcolor: dark ? alpha(colors.brandDarkest, 0.28) : theme.palette.background.paper,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
          gap: 1.25,
          alignItems: 'center',
          px: 1.5,
          py: 1.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: dark ? alpha(colors.brandDeep, 0.18) : alpha(ACCENT, 0.035),
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, flexWrap: 'wrap' }}>
            <Box sx={{
              width: 32,
              height: 32,
              borderRadius: 1.1,
              display: 'grid',
              placeItems: 'center',
              color: ACCENT,
              bgcolor: alpha(ACCENT, dark ? 0.18 : 0.1),
              border: `1px solid ${alpha(ACCENT, 0.28)}`,
            }}>
              <BoxIcon size={16} />
            </Box>
            <Typography sx={{ ...flytoTextStyles.codeStrong, fontSize: 18 }}>
              {tOr('warroom.containerInventoryTitle', '\u5bb9\u5668\u6e05\u55ae')}
            </Typography>
            <Chip
              size="small"
              label={`${rows.length}/${totalRows}`}
              sx={{ height: 22, borderRadius: 0.9, ...flytoTextStyles.codeTiny, fontWeight: 900 }}
            />
          </Stack>
          <Typography sx={{ mt: 0.45, color: 'text.secondary', ...flytoTextStyles.codeSmall }}>
            {tOr('warroom.containerInventorySub', '\u5148\u770b\u6620\u50cf\u6a94\u8207\u4f86\u6e90\uff0c\u518d\u9032\u5165 CVE \u6aa2\u67e5\u3002')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} sx={{ justifyContent: { xs: 'flex-start', md: 'flex-end' }, flexWrap: 'wrap' }}>
          <InventoryMetric label="C" value={sevCounts.CRITICAL} color={SEV.CRITICAL} />
          <InventoryMetric label="H" value={sevCounts.HIGH} color={SEV.HIGH} />
          <InventoryMetric label="M" value={sevCounts.MEDIUM} color={SEV.MEDIUM} />
          <InventoryMetric label="L" value={sevCounts.LOW} color={SEV.LOW} />
          <InventoryMetric label={tOr('warroom.containerImagesShort', '\u6620\u50cf')} value={posture?.image_count ?? totalRows} color={ACCENT} />
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(180px, 1fr) 132px 132px 78px', lg: 'minmax(220px, 1fr) 180px 170px 88px' },
          gap: 1,
          alignItems: 'center',
          px: 1.5,
          py: 1.15,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: dark ? alpha(colors.brandDarkest, 0.16) : alpha(theme.palette.grey[50], 0.8),
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        <TextField
          size="small"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={tOr('common.search', '\u641c\u5c0b')}
          InputProps={{
            startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.7 }} />,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              height: 42,
              borderRadius: 2,
              bgcolor: dark ? alpha(colors.brandDeep, 0.26) : theme.palette.background.paper,
            },
          }}
        />
        <TextField
          select
          size="small"
          value={source}
          onChange={(event) => onSource(event.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { height: 42, borderRadius: 2 } }}
        >
          <MenuItem value="all">{tOr('warroom.allSources', '\u5168\u90e8\u4f86\u6e90')}</MenuItem>
          {sources.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
        </TextField>
        <TextField
          select
          size="small"
          value={severity}
          onChange={(event) => onSeverity(event.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { height: 42, borderRadius: 2 } }}
        >
          <MenuItem value="all">{tOr('warroom.allSeverities', '\u5168\u90e8\u56b4\u91cd\u5ea6')}</MenuItem>
          {SEV_ORDER.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
        </TextField>
        <Button
          variant="outlined"
          disabled={!activeFilters}
          onClick={onClear}
          startIcon={<ListFilter size={15} />}
          sx={{ height: 42, borderRadius: 2, px: 1.25, minWidth: 78, whiteSpace: 'nowrap' }}
        >
          {'\u6e05\u9664'}
        </Button>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            display: { xs: 'none', lg: 'grid' },
            gridTemplateColumns: '54px minmax(190px, 1.5fr) minmax(130px, 0.8fr) minmax(130px, 0.8fr) minmax(190px, 1.05fr) 150px 112px',
            alignItems: 'center',
            px: 1.5,
            py: 0.95,
            bgcolor: dark ? alpha(colors.brandDarkest, 0.34) : alpha(theme.palette.grey[100], 0.92),
            borderBottom: '1px solid',
            borderColor: 'divider',
            color: 'text.secondary',
            ...flytoTextStyles.codeTiny,
            fontWeight: 900,
          }}
        >
          <span>{tOr('warroom.containerType', '\u985e\u578b')}</span>
          <span>{tOr('warroom.containerName', '\u540d\u7a31')}</span>
          <span>Registry</span>
          <span>{tOr('warroom.containerSource', '\u4f86\u6e90')}</span>
          <span>Issues</span>
          <span>{tOr('warroom.containerLastScan', '\u6700\u5f8c\u6383\u63cf')}</span>
          <span />
        </Box>

        {rows.length === 0 ? (
          <Box sx={{ minHeight: 158, display: 'grid', placeItems: 'center', color: 'text.secondary', px: 2, textAlign: 'center' }}>
            <Typography sx={{ ...flytoTextStyles.codeSmall }}>
              {activeFilters
                ? tOr('warroom.containerNoFilterResult', '\u6c92\u6709\u7b26\u5408\u689d\u4ef6\u7684\u5bb9\u5668\u3002')
                : tOr('warroom.containerNoInventory', '\u5c1a\u672a\u5efa\u7acb\u5bb9\u5668\u6e05\u55ae\uff0c\u53ef\u5728\u4e0b\u65b9\u65b0\u589e Registry \u6216 Kubernetes \u4f86\u6e90\u3002')}
            </Typography>
          </Box>
        ) : (
          rows.map(row => (
            <ContainerInventoryRowView
              key={row.id}
              row={row}
              dark={dark}
              onInspect={() => onInspect(row.image)}
            />
          ))
        )}

        {rows.length > 0 && (
          <Box sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1,
            px: 1.5,
            py: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            color: 'text.secondary',
          }}>
            <Typography sx={{ ...flytoTextStyles.codeTiny }}>
              {rows.length} {tOr('warroom.containerRows', '\u5217')} / {totalIssues} issues
            </Typography>
            <Typography sx={{ ...flytoTextStyles.codeTiny }}>
              {tOr('warroom.containerInventoryHint', '\u9ede\u6aa2\u67e5\u53ef\u5207\u5230\u5c0d\u61c9 CVE \u660e\u7d30')}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

function InventoryMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Chip
      size="small"
      label={`${value} ${label}`}
      sx={{
        height: 24,
        borderRadius: 1,
        color,
        bgcolor: alpha(color, 0.1),
        border: `1px solid ${alpha(color, 0.22)}`,
        ...flytoTextStyles.codeTiny,
        fontWeight: 950,
      }}
    />
  )
}

function ContainerInventoryRowView({ row, dark, onInspect }: {
  row: ContainerInventoryRow
  dark: boolean
  onInspect: () => void
}) {
  const theme = useTheme()
  const worstColor = SEV[SEV_ORDER[row.worst] ?? 'LOW'] ?? SEV.LOW
  const issueChips = SEV_ORDER.filter(sev => row.counts[sev] > 0)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '38px minmax(0, 1fr) auto', lg: '54px minmax(190px, 1.5fr) minmax(130px, 0.8fr) minmax(130px, 0.8fr) minmax(190px, 1.05fr) 150px 112px' },
        alignItems: 'center',
        gap: { xs: 0.75, lg: 0 },
        px: 1.5,
        py: { xs: 1.1, lg: 0.95 },
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: dark ? alpha(colors.brandDarkest, 0.08) : theme.palette.background.paper,
        '&:hover': {
          bgcolor: dark ? alpha(ACCENT, 0.08) : alpha(ACCENT, 0.045),
        },
        minWidth: 0,
      }}
    >
      <Box sx={{
        width: 30,
        height: 30,
        borderRadius: 1,
        display: 'grid',
        placeItems: 'center',
        color: ACCENT,
        bgcolor: alpha(ACCENT, dark ? 0.16 : 0.09),
      }}>
        <BoxIcon size={15} />
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ ...flytoTextStyles.codeStrong, fontSize: 14, minWidth: 0 }} noWrap title={row.image}>
          {row.name}
        </Typography>
        <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary', mt: 0.25 }} noWrap title={row.image}>
          {row.image}
        </Typography>
      </Box>

      <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.secondary', display: { xs: 'none', lg: 'block' } }} noWrap title={row.registry}>
        {row.registry}
      </Typography>
      <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.secondary', display: { xs: 'none', lg: 'block' } }} noWrap title={row.source}>
        {row.source}
      </Typography>

      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', alignItems: 'center', gridColumn: { xs: '2 / -1', lg: 'auto' } }}>
        {issueChips.length === 0 ? (
          <Chip size="small" label="0" sx={{ height: 24, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
        ) : issueChips.map(sev => (
          <Chip
            key={sev}
            size="small"
            label={`${row.counts[sev]} ${sev[0]}`}
            sx={{
              height: 24,
              borderRadius: 1,
              color: SEV[sev],
              bgcolor: alpha(SEV[sev], dark ? 0.16 : 0.1),
              border: `1px solid ${alpha(SEV[sev], 0.28)}`,
              ...flytoTextStyles.codeTiny,
              fontWeight: 900,
            }}
          />
        ))}
      </Stack>

      <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.65, minWidth: 0 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: worstColor }} />
        <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>
          {formatContainerScanDate(row.lastScan)}
        </Typography>
      </Box>

      <Button
        size="small"
        variant="outlined"
        onClick={onInspect}
        disabled={row.issues === 0}
        sx={{
          height: 32,
          borderRadius: 1.2,
          px: 1.25,
          justifySelf: 'end',
          gridColumn: { xs: '3', lg: 'auto' },
          whiteSpace: 'nowrap',
        }}
      >
        {tOr('warroom.inspectCves', '\u6aa2\u67e5')}
      </Button>
    </Box>
  )
}

function ContainerChecksToolbar({ search, onSearch, resultCount }: {
  search: string
  onSearch: (value: string) => void
  resultCount: number
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  return (
    <Paper
      variant="outlined"
      sx={{
        flexShrink: 0,
        borderRadius: 1.5,
        p: 1,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 420px) auto' },
        gap: 1,
        alignItems: 'center',
        borderColor: alpha(ACCENT, dark ? 0.3 : 0.2),
      }}
    >
      <TextField
        size="small"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={tOr('warroom.searchCves', '\u641c\u5c0b CVE / image / package')}
        InputProps={{
          startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.7 }} />,
        }}
        sx={{ '& .MuiOutlinedInput-root': { height: 40, borderRadius: 1.5 } }}
      />
      <Chip
        size="small"
        label={`${resultCount} ${tOr('warroom.containerFindings', '\u767c\u73fe')}`}
        sx={{
          justifySelf: { xs: 'start', md: 'end' },
          height: 26,
          borderRadius: 1,
          ...flytoTextStyles.codeTiny,
          fontWeight: 900,
          color: resultCount > 0 ? colors.severity.critical : SECURE,
          bgcolor: alpha(resultCount > 0 ? colors.severity.critical : SECURE, 0.1),
        }}
      />
    </Paper>
  )
}

function buildContainerInventoryRows(sections: ContainerSourceSection[]): ContainerInventoryRow[] {
  const byImage = new Map<string, ContainerInventoryRow>()
  for (const section of sections) {
    for (const group of section.imageGroups) {
      const parsed = parseContainerImageRef(group.image)
      let row = byImage.get(group.image)
      if (!row) {
        row = {
          id: group.image,
          image: group.image,
          name: parsed.name,
          registry: parsed.registry,
          domain: section.subjectLabel,
          source: section.sourceLabel,
          issues: 0,
          counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
          worst: 99,
          lastScan: undefined,
        }
        byImage.set(group.image, row)
      }
      row.issues += group.items.length
      row.worst = Math.min(row.worst, group.worst)
      if (!row.domain.includes(section.subjectLabel)) row.domain = `${row.domain}, ${section.subjectLabel}`
      if (!row.source.includes(section.sourceLabel)) row.source = `${row.source}, ${section.sourceLabel}`
      for (const sev of SEV_ORDER) row.counts[sev] += group.counts[sev] ?? 0
      for (const item of group.items) {
        if (!row.lastScan || item.scanned_at > row.lastScan) row.lastScan = item.scanned_at
      }
    }
  }
  return [...byImage.values()].sort((a, b) => (
    a.worst - b.worst
    || b.issues - a.issues
    || a.name.localeCompare(b.name)
  ))
}

function parseContainerImageRef(image: string): { registry: string; name: string } {
  const parts = image.split('/').filter(Boolean)
  if (parts.length === 0) return { registry: 'unknown', name: image || 'unknown' }
  const first = parts[0]
  const hasRegistry = first.includes('.') || first.includes(':') || first === 'localhost'
  const registry = hasRegistry ? first : 'Docker Hub'
  const name = hasRegistry ? parts.slice(1).join('/') || first : parts.join('/')
  return { registry, name: name || image }
}

function filterContainerInventoryRows(
  rows: ContainerInventoryRow[],
  search: string,
  source: string,
  severity: string,
): ContainerInventoryRow[] {
  const q = search.trim().toLowerCase()
  return rows.filter(row => {
    if (source !== 'all' && row.source !== source && !row.source.split(', ').includes(source)) return false
    if (severity !== 'all' && (row.counts[severity] ?? 0) <= 0) return false
    if (!q) return true
    return [
      row.image,
      row.name,
      row.registry,
      row.domain,
      row.source,
    ].some(value => value.toLowerCase().includes(q))
  })
}

function filterContainerSourceSections(sections: ContainerSourceSection[], search: string): ContainerSourceSection[] {
  const q = search.trim().toLowerCase()
  if (!q) return sections
  return sections
    .map(section => {
      const items = section.items.filter(item => [
        item.image_ref,
        item.package_name,
        item.installed_version,
        item.fixed_version || '',
        item.cve_id || '',
        item.title,
        item.severity,
        section.subjectLabel,
        section.sourceLabel,
      ].some(value => value.toLowerCase().includes(q)))
      const imageGroups = groupContainerFindingsByImage(items)
      return {
        ...section,
        items,
        imageGroups,
        counts: countSev(items),
        worst: items.reduce((worst, item) => Math.min(worst, sevRank(item.severity)), 99),
      }
    })
    .filter(section => section.items.length > 0)
}

function formatContainerScanDate(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function buildContainerSourceSections(
  findings: ContainerFinding[],
  repoNameById: Map<string, string>,
  connectionById: Map<string, ContainerConnection>,
): ContainerSourceSection[] {
  const buckets = new Map<string, ContainerSourceSection>()
  for (const finding of findings) {
    const context = containerFindingSourceContext(finding, repoNameById, connectionById)
    const key = `${context.sourceKind}:${context.subjectKindLabel}:${context.subjectLabel}:${finding.source_ref || finding.repo_id || ''}`
    let section = buckets.get(key)
    if (!section) {
      section = {
        key,
        ...context,
        items: [],
        imageGroups: [],
        counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
        worst: 99,
      }
      buckets.set(key, section)
    }
    section.items.push(finding)
  }

  return [...buckets.values()]
    .map(section => {
      const imageGroups = groupContainerFindingsByImage(section.items)
      const counts = countSev(section.items)
      return {
        ...section,
        imageGroups,
        counts,
        worst: section.items.reduce((w, f) => Math.min(w, sevRank(f.severity)), 99),
      }
    })
    .sort((a, b) => (
      containerSourceRank(a.sourceKind) - containerSourceRank(b.sourceKind)
      || a.subjectLabel.localeCompare(b.subjectLabel)
      || a.worst - b.worst
    ))
}

function groupContainerFindingsByImage(findings: ContainerFinding[]): ContainerImageGroup[] {
  const m = new Map<string, ContainerFinding[]>()
  for (const f of findings) {
    const arr = m.get(f.image_ref) ?? []
    arr.push(f)
    m.set(f.image_ref, arr)
  }
  return [...m.entries()]
    .map(([image, items]) => ({
      image,
      items: [...items].sort((a, b) => sevRank(a.severity) - sevRank(b.severity)),
      counts: countSev(items),
      worst: items.reduce((w, f) => Math.min(w, sevRank(f.severity)), 99),
    }))
    .sort((a, b) => (a.worst - b.worst) || (b.items.length - a.items.length) || a.image.localeCompare(b.image))
}

function containerFindingSourceContext(
  finding: ContainerFinding,
  repoNameById: Map<string, string>,
  connectionById: Map<string, ContainerConnection>,
): Pick<ContainerSourceSection, 'sourceKind' | 'sourceLabel' | 'sourceDescription' | 'subjectKindLabel' | 'subjectLabel' | 'subjectDetail'> {
  const sourceType = finding.source_type || (finding.repo_id ? 'repo_scan' : 'unknown')
  if (sourceType === 'container_connection') {
    const conn = finding.source_ref ? connectionById.get(finding.source_ref) : undefined
    const isKubernetes = conn?.kind === 'kubernetes'
    return {
      sourceKind: isKubernetes ? 'kubernetes_connection' : 'registry_connection',
      sourceLabel: t(isKubernetes ? 'warroom.containerSourceKubernetes' : 'warroom.containerSourceRegistry'),
      sourceDescription: t(isKubernetes ? 'warroom.containerSourceKubernetesDesc' : 'warroom.containerSourceRegistryDesc'),
      subjectKindLabel: t('warroom.containerConnection'),
      subjectLabel: conn?.name || finding.source_ref || t('warroom.containerUnknownConnection'),
      subjectDetail: [conn?.provider || '', conn?.region || '', conn?.endpoint || ''].filter(Boolean).join(' · '),
    }
  }
  if (sourceType === 'repo_manual') {
    const repoID = finding.repo_id || finding.source_ref || ''
    return {
      sourceKind: 'repo_manual',
      sourceLabel: t('warroom.containerSourceRepoManual'),
      sourceDescription: t('warroom.containerSourceRepoManualDesc'),
      subjectKindLabel: t('warroom.containerProject'),
      subjectLabel: repoNameById.get(repoID) || repoID || t('warroom.containerUnknownProject'),
      subjectDetail: repoID,
    }
  }
  if (sourceType === 'repo_scan') {
    const repoID = finding.repo_id || finding.source_ref || ''
    return {
      sourceKind: 'repo_scan',
      sourceLabel: t('warroom.containerSourceRepoScan'),
      sourceDescription: t('warroom.containerSourceRepoScanDesc'),
      subjectKindLabel: t('warroom.containerProject'),
      subjectLabel: repoNameById.get(repoID) || repoID || t('warroom.containerUnknownProject'),
      subjectDetail: repoID,
    }
  }
  if (sourceType === 'finding_verify') {
    const repoID = finding.repo_id || ''
    return {
      sourceKind: 'finding_verify',
      sourceLabel: t('warroom.containerSourceVerify'),
      sourceDescription: t('warroom.containerSourceVerifyDesc'),
      subjectKindLabel: t('warroom.containerProject'),
      subjectLabel: repoNameById.get(repoID) || repoID || t('warroom.containerUnknownProject'),
      subjectDetail: finding.source_ref || finding.scan_run_id || '',
    }
  }
  return {
    sourceKind: 'unknown',
    sourceLabel: t('warroom.containerSourceUnknown'),
    sourceDescription: t('warroom.containerSourceUnknownDesc'),
    subjectKindLabel: t('warroom.containerSource'),
    subjectLabel: finding.source_ref || finding.repo_id || t('common.unknown'),
    subjectDetail: sourceType,
  }
}

function containerSourceRank(kind: ContainerSourceKind): number {
  switch (kind) {
    case 'kubernetes_connection': return 0
    case 'registry_connection': return 1
    case 'repo_scan': return 2
    case 'repo_manual': return 3
    case 'finding_verify': return 4
    default: return 5
  }
}

function containerSourceColor(kind: ContainerSourceKind): string {
  switch (kind) {
    case 'kubernetes_connection': return SECURE
    case 'registry_connection': return ACCENT
    case 'repo_scan': return colors.brand
    case 'repo_manual': return colors.brandDeep
    case 'finding_verify': return colors.severity.medium
    default: return colors.severity.low
  }
}

function ContainerClosedLoopPanel({ orgId, dark }: { orgId?: string; dark: boolean }) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [kind, setKind] = useState<'registry' | 'kubernetes'>('registry')
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('registry')
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('')
  const [imageRefsText, setImageRefsText] = useState('')
  const [credential, setCredential] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>()

  const connectionsQ = useQuery({
    queryKey: qk.container.connections(orgId),
    queryFn: () => listContainerConnections(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const runsQ = useQuery({
    queryKey: qk.container.runs(orgId),
    queryFn: () => listContainerScanRuns(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const evidenceQ = useQuery({
    queryKey: qk.container.evidence(orgId, selectedRunId),
    queryFn: () => getContainerScanRunEvidence(orgId!, selectedRunId!),
    enabled: !!orgId && !!selectedRunId,
    staleTime: 60_000,
  })

  const invalidateContainerLoop = () => {
    if (!orgId) return
    qc.invalidateQueries({ queryKey: qk.container.connections(orgId) })
    qc.invalidateQueries({ queryKey: qk.container.runs(orgId) })
    qc.invalidateQueries({ queryKey: qk.container.findings(orgId) })
    qc.invalidateQueries({ queryKey: qk.container.posture(orgId) })
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('missing org')
      const input: ContainerConnectionInput = {
        kind,
        provider: provider.trim() || kind,
        name: name.trim(),
        endpoint: endpoint.trim() || undefined,
        region: region.trim() || undefined,
        image_refs: parseImageRefs(imageRefsText),
        credential: credential.trim() || undefined,
        credential_kind: kind === 'kubernetes' ? 'kubeconfig' : 'registry_credential',
        status: 'active',
      }
      return upsertContainerConnection(orgId, input)
    },
    onSuccess: () => {
      setCredential('')
      enqueueSnackbar(t('warroom.containerConnectionSaved'), { variant: 'success' })
      invalidateContainerLoop()
    },
    onError: () => {
      enqueueSnackbar(t('warroom.containerConnectionSaveFailed'), { variant: 'error' })
    },
  })

  const runMut = useMutation({
    mutationFn: async (connectionId: string) => {
      if (!orgId) throw new Error('missing org')
      return runContainerConnectionScan(orgId, connectionId)
    },
    onSuccess: () => {
      enqueueSnackbar(t('warroom.containerScanQueued'), { variant: 'success' })
      invalidateContainerLoop()
    },
    onError: () => {
      enqueueSnackbar(t('warroom.containerScanQueueFailed'), { variant: 'error' })
    },
  })

  const connections = connectionsQ.data?.connections ?? []
  const runs = runsQ.data?.runs ?? []
  const canSave = !!orgId && !!name.trim() && !saveMut.isPending
  const prettyEvidence = useMemo(() => {
    const raw = evidenceQ.data?.evidence_json
    if (!raw) return ''
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }, [evidenceQ.data?.evidence_json])

  return (
    <FlytoSurface
      title={t('warroom.containerControlTitle')}
      icon={<BoxIcon size={15} />}
      action={(
        <Chip
          size="small"
          label={`${connections.length} ${t('warroom.containerConnections')}`}
          sx={{ borderRadius: 1, ...flytoTextStyles.codeTiny }}
        />
      )}
      tone="tech"
      density="compact"
      scroll
      bodySx={{
        p: 0,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
      sx={{ minWidth: 0, minHeight: 0, flexShrink: 0 }}
    >

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.05fr 0.95fr' }, gap: 0, minWidth: 0 }}>
        <Box sx={{ p: 1.5, borderRight: { lg: '1px solid' }, borderColor: { lg: 'divider' }, minWidth: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1 }}>
            <TextField
              select
              size="small"
              label={t('warroom.containerKind')}
              value={kind}
              onChange={(event) => {
                const next = event.target.value as 'registry' | 'kubernetes'
                setKind(next)
                setProvider(next)
              }}
            >
              <MenuItem value="registry">{t('warroom.containerKindRegistry')}</MenuItem>
              <MenuItem value="kubernetes">{t('warroom.containerKindKubernetes')}</MenuItem>
            </TextField>
            <TextField
              size="small"
              label={t('warroom.containerConnectionName')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField
              size="small"
              label={t('warroom.containerProvider')}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
            <TextField
              size="small"
              label={t('warroom.containerEndpoint')}
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
            />
            <TextField
              size="small"
              label={t('warroom.containerRegion')}
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            />
            <TextField
              size="small"
              label={t('warroom.containerImageRefs')}
              value={imageRefsText}
              onChange={(event) => setImageRefsText(event.target.value)}
              helperText={t('warroom.containerImageRefsHelp')}
              multiline
              minRows={2}
            />
            <TextField
              size="small"
              label={t(kind === 'kubernetes' ? 'warroom.containerKubeconfig' : 'warroom.containerCredential')}
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              helperText={t('warroom.containerCredentialHelp')}
              multiline={kind === 'kubernetes'}
              minRows={kind === 'kubernetes' ? 3 : 1}
              sx={{ gridColumn: { xs: 'auto', sm: '1 / -1' } }}
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.25 }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<Save size={14} />}
              disabled={!canSave}
              onClick={() => saveMut.mutate()}
            >
              {t('warroom.containerSaveConnection')}
            </Button>
          </Box>
        </Box>

        <Box sx={{ p: 1.5, minWidth: 0 }}>
          <Typography sx={{ ...flytoTextStyles.codeLabel, mb: 1 }}>
            {t('warroom.containerConnectionList')}
          </Typography>
          {connectionsQ.isLoading && <LoadingState variant="spinner" py={2} />}
          {!connectionsQ.isLoading && connections.length === 0 && (
            <Typography variant="body2" color="text.secondary">{t('warroom.containerConnectionEmpty')}</Typography>
          )}
          <Stack spacing={1}>
            {connections.map(conn => (
              <ContainerConnectionRow
                key={conn.id}
                conn={conn}
                running={runMut.isPending && runMut.variables === conn.id}
                onRun={() => runMut.mutate(conn.id)}
              />
            ))}
          </Stack>
        </Box>
      </Box>

      <Divider />

      <Box sx={{ p: 1.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography sx={flytoTextStyles.codeLabel}>
            {t('warroom.containerRunLedger')}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {runsQ.isFetching && <LoadingState variant="spinner" py={0} />}
        </Box>
        {runs.length === 0 && !runsQ.isLoading && (
          <Typography variant="body2" color="text.secondary">{t('warroom.containerRunEmpty')}</Typography>
        )}
        <Stack spacing={0.75}>
          {runs.slice(0, 5).map(run => (
            <ContainerRunRow
              key={run.id}
              run={run}
              selected={selectedRunId === run.id}
              onEvidence={() => setSelectedRunId(selectedRunId === run.id ? undefined : run.id)}
            />
          ))}
        </Stack>
        {selectedRunId && (
          <FlytoCodeBlock
            label={t('warroom.containerEvidence')}
            detail={evidenceQ.data?.evidence_signature ?? ''}
            icon={<FileText size={13} />}
            value={evidenceQ.isLoading ? t('common.loading') : prettyEvidence}
            density="compact"
            maxHeight={220}
            sx={{ mt: 1 }}
            preSx={{
              ...flytoTextStyles.codeTiny,
              bgcolor: dark ? alpha(colors.brandDarkest, 0.22) : alpha(colors.semantic.neutral, 0.09),
            }}
          />
        )}
      </Box>
    </FlytoSurface>
  )
}

function ContainerConnectionRow({ conn, running, onRun }: {
  conn: ContainerConnection
  running: boolean
  onRun: () => void
}) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
      gap: 1,
      alignItems: 'center',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      px: 1,
      py: 0.75,
      minWidth: 0,
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Typography sx={flytoTextStyles.codeValue} noWrap>
            {conn.name}
          </Typography>
          <Chip size="small" label={t(containerConnectionStatusKey(conn.status))} sx={{ height: 20, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
          {conn.has_credential && (
            <Chip size="small" label={t('warroom.containerCredentialSealed')} sx={{ height: 20, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
          )}
        </Box>
        <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>
          {t(containerConnectionKindKey(conn.kind))} · {conn.provider || conn.kind} · {(conn.image_refs ?? []).length} {t('warroom.containerImages')}
        </Typography>
        {conn.last_error && (
          <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'error.main' }} noWrap>
            {conn.last_error}
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Play size={13} />}
        disabled={conn.status !== 'active' || running}
        onClick={onRun}
      >
        {t(running ? 'warroom.containerScanRunning' : 'warroom.containerRunScan')}
      </Button>
    </Box>
  )
}

function ContainerRunRow({ run, selected, onEvidence }: {
  run: ContainerScanRun
  selected: boolean
  onEvidence: () => void
}) {
  const statusColor = run.status === 'failed' ? colors.severity.critical : run.status === 'complete' ? SECURE : ACCENT
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
      gap: 1,
      alignItems: 'center',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      px: 1,
      py: 0.75,
      minWidth: 0,
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Chip
            size="small"
            label={t(containerRunStatusKey(run.status))}
            sx={{ height: 20, borderRadius: 1, ...flytoTextStyles.codeTiny, color: statusColor, borderColor: alpha(statusColor, 0.4) }}
            variant="outlined"
          />
          <Typography sx={flytoTextStyles.codeLabel} noWrap>
            {run.source_type}
          </Typography>
          <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>
            {formatMaybeDate(run.created_at)}
          </Typography>
        </Box>
        <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>
          {run.images_scanned}/{run.images_requested} {t('warroom.containerImages')} · {run.findings_created} {t('warroom.containerFindings')}
        </Typography>
        {run.error && (
          <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'error.main' }} noWrap>
            {run.error}
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        variant={selected ? 'contained' : 'outlined'}
        startIcon={<FileText size={13} />}
        onClick={onEvidence}
        disabled={!run.evidence_signature && run.status !== 'complete' && run.status !== 'failed'}
      >
        {t('warroom.containerViewEvidence')}
      </Button>
    </Box>
  )
}

function parseImageRefs(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map(ref => ref.trim())
    .filter(Boolean)
}

function formatMaybeDate(raw?: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function containerConnectionKindKey(kind: string): string {
  return kind === 'kubernetes' ? 'warroom.containerKindKubernetes' : 'warroom.containerKindRegistry'
}

function containerConnectionStatusKey(status: string): string {
  return status === 'disabled' ? 'warroom.containerConnectionDisabled' : 'warroom.containerConnectionActive'
}

function containerRunStatusKey(status: string): string {
  if (status === 'queued') return 'warroom.containerRunQueued'
  if (status === 'running') return 'warroom.containerRunRunning'
  if (status === 'complete') return 'warroom.containerRunComplete'
  if (status === 'failed') return 'warroom.containerRunFailed'
  return 'warroom.containerRunUnknown'
}

// ── Per-image scan report card ──────────────────────────────────────

const ROW_CAP = 8

function ContainerSourceSectionView({ section, dark, busyFindingId, onAction }: {
  section: ContainerSourceSection
  dark: boolean
  busyFindingId?: string
  onAction: (action: ContainerFindingAction, findingId: string) => void
}) {
  const color = containerSourceColor(section.sourceKind)
  const sourceCounts = SEV_ORDER.filter(s => section.counts[s] > 0)
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      borderTop: '1px solid',
      borderColor: alpha(color, dark ? 0.35 : 0.25),
      pt: 1.25,
      minWidth: 0,
    }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
        gap: 1,
        alignItems: 'center',
        minWidth: 0,
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
            <Chip
              size="small"
              label={section.sourceLabel}
              sx={{
                height: 22,
                borderRadius: 1,
                ...flytoTextStyles.codeTiny,
                fontWeight: 900,
                color,
                bgcolor: alpha(color, dark ? 0.16 : 0.1),
                border: `1px solid ${alpha(color, 0.38)}`,
              }}
            />
            <Typography sx={{ ...flytoTextStyles.codeStrong, fontSize: 14, minWidth: 0 }} noWrap title={section.subjectLabel}>
              {section.subjectKindLabel}: {section.subjectLabel}
            </Typography>
            {section.subjectDetail && (
              <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary', minWidth: 0 }} noWrap title={section.subjectDetail}>
                {section.subjectDetail}
              </Typography>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, maxWidth: 860 }}>
            {section.sourceDescription}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
          <Chip size="small" label={`${section.imageGroups.length} ${t('warroom.containerImages')}`} sx={{ height: 22, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
          <Chip size="small" label={`${section.items.length} ${t('warroom.containerFindings')}`} sx={{ height: 22, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
          {sourceCounts.map(sev => (
            <Chip
              key={sev}
              size="small"
              label={`${section.counts[sev]} ${sev[0]}`}
              sx={{
                height: 22,
                borderRadius: 1,
                ...flytoTextStyles.codeTiny,
                fontWeight: 800,
                color: SEV[sev],
                bgcolor: alpha(SEV[sev], dark ? 0.16 : 0.1),
              }}
            />
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        {section.imageGroups.map(group => (
          <ImageReport
            key={`${section.key}:${group.image}`}
            group={group}
            dark={dark}
            busyFindingId={busyFindingId}
            onAction={onAction}
          />
        ))}
      </Box>
    </Box>
  )
}

function ImageReport({ group, dark, busyFindingId, onAction }: {
  group: { image: string; items: ContainerFinding[]; counts: Record<string, number>; worst: number }
  dark: boolean
  busyFindingId?: string
  onAction: (action: ContainerFindingAction, findingId: string) => void
}) {
  const worstColor = SEV[SEV_ORDER[group.worst] ?? 'LOW']
  const shown = group.items.slice(0, ROW_CAP)
  const hidden = group.items.length - shown.length
  const repo = group.items[0]?.repo_id

  return (
    <Paper variant="outlined" sx={{
      borderColor: 'divider', borderRadius: 2, overflow: 'hidden',
      borderLeft: '3px solid', borderLeftColor: worstColor,
      minWidth: 0,
    }}>
      {/* Title bar — monospace image ref + severity summary */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
        borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: alpha(worstColor, dark ? 0.1 : 0.05),
        flexWrap: 'wrap',
      }}>
        <Layers size={14} style={{ color: worstColor, flexShrink: 0 }} />
        <Typography sx={{
          flex: '1 1 220px',
          ...flytoTextStyles.codeValue,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }} title={group.image} noWrap>
          {group.image}
        </Typography>
        <Box sx={{ flex: { xs: '0 0 100%', sm: 1 }, display: { xs: 'none', sm: 'block' } }} />
        {SEV_ORDER.filter(s => group.counts[s] > 0).map(s => (
          <Chip key={s} size="small" label={`${group.counts[s]} ${s[0]}`}
            sx={{
              height: 20, ...flytoTextStyles.codeTiny, fontWeight: 800, borderRadius: 1,
              color: SEV[s], bgcolor: alpha(SEV[s], dark ? 0.16 : 0.1),
              border: `1px solid ${alpha(SEV[s], 0.4)}`,
            }} />
        ))}
        {repo && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5, minWidth: 0, maxWidth: { xs: '100%', sm: 220 } }}>
            <GitBranch size={11} style={{ opacity: 0.5 }} />
            <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>{repo}</Typography>
          </Box>
        )}
      </Box>

      {/* CVE rows */}
      <Box>
        {shown.map(f => {
          const color = SEV[normSev(f.severity)]
          return (
            <Box key={f.id} sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'auto minmax(0, 1fr)', md: 'auto 150px minmax(0, 1fr) auto auto' },
              alignItems: 'center', gap: 1.25, px: 1.5, py: 0.85,
              borderTop: '1px solid', borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
              minWidth: 0,
            }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 6px ${alpha(color, 0.6)}`, flexShrink: 0 }} />
              <Typography sx={{ ...flytoTextStyles.codeValue, color, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
                {f.cve_id || '—'}
              </Typography>
              <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.secondary', display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5, minWidth: 0 }} noWrap>
                <Package size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
                {f.package_name}@{f.installed_version}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: { xs: 'start', md: 'end' }, gridColumn: { xs: '2 / -1', md: 'auto' }, minWidth: 0 }}>
                {f.fixed_version ? (
                  <>
                    <ArrowRight size={12} style={{ color: SECURE }} />
                    <Typography sx={{ ...flytoTextStyles.codeValue, color: SECURE, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
                      {f.fixed_version}
                    </Typography>
                  </>
                ) : (
                  <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.disabled' }} noWrap>
                    {t('warroom.containerNoFix')}
                  </Typography>
                )}
              </Box>
              <FindingActions
                finding={f}
                busy={busyFindingId === f.id}
                onAction={onAction}
              />
            </Box>
          )
        })}
      </Box>

      {hidden > 0 && (
        <Box sx={{ px: 1.5, py: 0.75, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
          <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }}>
            + {hidden} {t('warroom.moreCves')}
          </Typography>
        </Box>
      )}
    </Paper>
  )
}

function FindingActions({ finding, busy, onAction }: {
  finding: ContainerFinding
  busy: boolean
  onAction: (action: ContainerFindingAction, findingId: string) => void
}) {
  const disabled = busy
  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.25,
      justifySelf: { xs: 'start', md: 'end' },
      gridColumn: { xs: '2 / -1', md: 'auto' },
    }}>
      <Tooltip title={t('warroom.containerVerifyFixed')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('warroom.containerVerifyFixed')}
            disabled={disabled || finding.status === 'false_positive'}
            onClick={() => onAction('verify', finding.id)}
            sx={{ width: 30, height: 30 }}
          >
            <CheckCircle2 size={14} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('warroom.containerFalsePositive')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('warroom.containerFalsePositive')}
            disabled={disabled || finding.status === 'false_positive'}
            onClick={() => onAction('false_positive', finding.id)}
            sx={{ width: 30, height: 30 }}
          >
            <ShieldOff size={14} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('warroom.containerReopen')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('warroom.containerReopen')}
            disabled={disabled || finding.status === 'open'}
            onClick={() => onAction('reopen', finding.id)}
            sx={{ width: 30, height: 30 }}
          >
            <RotateCcw size={14} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  )
}

// ── "All clear" panel — shown when there are zero findings ──────────

function SecurePanel({ imageCount, dark }: { imageCount: number; dark: boolean }) {
  return (
    <Paper variant="outlined" sx={{
      borderColor: alpha(SECURE, dark ? 0.4 : 0.3), borderRadius: 2,
      p: { xs: 3, md: 5 }, textAlign: 'center',
      bgcolor: alpha(SECURE, dark ? 0.06 : 0.04),
      boxShadow: dark ? `inset 0 0 60px ${alpha(SECURE, 0.06)}` : 'none',
    }}>
      <Box sx={{
        width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: 2,
        display: 'grid', placeItems: 'center',
        bgcolor: alpha(SECURE, 0.14), border: `1px solid ${alpha(SECURE, 0.4)}`,
        boxShadow: `0 0 24px ${alpha(SECURE, 0.35)}`, color: SECURE,
      }}>
        <ShieldCheck size={30} />
      </Box>
      <Typography sx={{ ...flytoTextStyles.codeStrong, fontSize: 22, letterSpacing: '0.05em', color: SECURE }}>
        {t('warroom.containerSecure')}
      </Typography>
      <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.secondary', mt: 1 }}>
        {imageCount} {t('warroom.imagesScannedClean')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2, maxWidth: 560, mx: 'auto', lineHeight: 1.5 }}>
        {t('warroom.containerEmptyDesc')}
      </Typography>
    </Paper>
  )
}
