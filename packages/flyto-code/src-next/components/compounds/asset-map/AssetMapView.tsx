/**
 * AssetMapView - engineer asset relationship workbench.
 *
 * The source of truth is still /asset-map/kernel. This view keeps the
 * backend-owned data intact and focuses on making the operator workflow
 * readable: find an asset, inspect relations, then validate or scan.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Code as CodeIcon,
  ExternalLink,
  GitBranch,
  Link2,
  Network,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { t, tOr } from '@lib/i18n'
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  markDiscoveryComplete,
  markDiscoveryStarted,
  useDiscoverySeed,
  useDiscoveryStatus,
} from '@hooks/useDiscoveryStatus'
import { surfaceDef, surfaceColor, SURFACE_LIST } from '@lib/surfaces'
import { DataBoundary } from '@atoms/DataBoundary'
import {
  getKernelAssetMap,
  type KernelAssetMapEdge,
  type KernelAssetMapNode,
  type KernelAssetScore,
} from '@lib/engine'
import {
  validateAttackSurfaceAsset,
  scanAttackSurfaceAsset,
} from '@lib/engine/code/footprintSurface'

const SURFACE_ORDER: string[] = SURFACE_LIST.map(surface => surface.id)
const FLYTO_PURPLE = '#7c3aed'
const MONO = "'ui-monospace','SFMono-Regular','Menlo','Consolas',monospace"
const PANEL_RADIUS = 1
const PANEL_SHADOW = '0 10px 28px rgba(15, 23, 42, 0.06)'
const LIVE_ASSET_TYPE_TONES: Record<string, string> = {
  'vm': '#0f766e',
  'workload': '#0369a1',
  'kubernetes_workload': '#2563eb',
  'container_image': '#7c3aed',
}

type ValidationLocal = 'verified' | 'false_positive'

interface CodeAlertFields {
  code_alert_count?: number
  code_alert_repo_ids?: string[]
}

interface AssetRowActions {
  validatedById: Record<string, ValidationLocal>
  validatingId: string | null
  scanningId: string | null
  isScanningResource: (resourceId: string) => boolean
  onValidate: (node: KernelAssetMapNode, status: ValidationLocal) => void
  onScan: (node: KernelAssetMapNode) => void
  onOpenRepoAlerts: (repoId: string) => void
}

interface RelationCard {
  edge: KernelAssetMapEdge
  other?: KernelAssetMapNode
  direction: 'from' | 'to'
}

interface SurfaceCount {
  surface: string
  count: number
}

function isHostAsset(node: KernelAssetMapNode): boolean {
  return (
    (node.surface || 'unknown') === 'external' &&
    (node.type === 'domain' || node.type === 'subdomain')
  )
}

function displayName(node: KernelAssetMapNode) {
  return node.display_name || node.canonical_value || node.resource_id
}

function codeAlertCount(node: KernelAssetMapNode): number {
  return (node as KernelAssetMapNode & CodeAlertFields).code_alert_count ?? 0
}

function codeAlertRepoIds(node: KernelAssetMapNode): string[] {
  return (node as KernelAssetMapNode & CodeAlertFields).code_alert_repo_ids ?? []
}

function surfaceMeta(surface?: string) {
  return surfaceDef(surface)
}

function assetTone(node?: KernelAssetMapNode): string {
  if (!node) return '#64748b'
  return LIVE_ASSET_TYPE_TONES[node.type || ''] ?? surfaceColor(node.surface)
}

function sortBySurface<T extends { surface?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const ai = SURFACE_ORDER.indexOf(a.surface || 'unknown')
    const bi = SURFACE_ORDER.indexOf(b.surface || 'unknown')
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

function formatConfidence(value?: number) {
  if (value === undefined || value === null || value <= 0) return '-'
  return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function searchText(node: KernelAssetMapNode) {
  return [
    displayName(node),
    node.resource_id,
    node.canonical_value,
    node.surface,
    node.type,
    node.status,
    node.review_status,
    node.current_tier,
    ...(node.dimensions ?? []),
    ...(node.legacy_sources ?? []),
  ].filter(Boolean).join(' ').toLowerCase()
}

function statusLabel(node: KernelAssetMapNode, local?: ValidationLocal) {
  if (local === 'verified') return '已驗證'
  if (local === 'false_positive') return '誤報'
  const value = node.validation_status || node.review_status || node.status || 'unreviewed'
  const normalized = value.toLowerCase()
  if (normalized === 'verified') return '已驗證'
  if (normalized === 'false_positive') return '誤報'
  if (normalized === 'auto_confirmed') return '自動確認'
  if (normalized === 'confirmed') return '已確認'
  if (normalized === 'unreviewed') return '未審核'
  if (normalized === 'candidate') return '候選'
  if (normalized === 'lead') return '線索'
  return value
}

function scoreLabel(score: KernelAssetScore) {
  const scoreValue = score.display_score ?? score.score
  return `${surfaceMeta(score.surface).label} ${scoreValue}${score.grade ? ` ${score.grade}` : ''}`
}

function panelSx() {
  return {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: PANEL_RADIUS,
    bgcolor: 'background.paper',
    boxShadow: PANEL_SHADOW,
    minHeight: 0,
    overflow: 'hidden',
  }
}

export function AssetMapView() {
  const { org, loading: orgLoading, ready: orgReady, error: orgError } = useOrg()
  const orgId = org?.id
  const qc = useQueryClient()
  const navigate = useNavigate()
  useDiscoverySeed(orgId)
  const { isScanning: isDiscoveryScanning } = useDiscoveryStatus()
  const [selectedSurface, setSelectedSurface] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showLeads, setShowLeads] = useState(true)
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null)
  const [validatedById, setValidatedById] = useState<Record<string, ValidationLocal>>({})
  const [validatingId, setValidatingId] = useState<string | null>(null)
  const [scanningId, setScanningId] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.assetMapKernelMode(orgId, showLeads ? 'leads' : 'confirmed'),
    queryFn: () => getKernelAssetMap(orgId!, { showDiscoveryLeads: showLeads }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const showToast = useCallback((msg: string, severity: 'success' | 'error') => {
    setToast({ msg, severity })
  }, [])

  const validateMut = useMutation({
    mutationFn: ({ resourceId, status }: { resourceId: string; status: ValidationLocal }) =>
      validateAttackSurfaceAsset(orgId!, resourceId, status),
    onMutate: ({ resourceId }) => setValidatingId(resourceId),
    onSuccess: (_res, { resourceId, status }) => {
      setValidatedById(prev => ({ ...prev, [resourceId]: status }))
      showToast(
        status === 'verified'
          ? t('assetMap.validateVerified')
          : t('assetMap.validateFalsePositive'),
        'success',
      )
    },
    onError: (err) => {
      const detail = err instanceof Error ? err.message : ''
      const label = t('assetMap.validateFailed')
      showToast(detail ? `${label}: ${detail.slice(0, 90)}` : label, 'error')
    },
    onSettled: () => {
      setValidatingId(null)
      qc.invalidateQueries({ queryKey: qk.assetMapKernelMode(orgId, showLeads ? 'leads' : 'confirmed') })
    },
  })

  const scanMut = useMutation({
    mutationFn: (resourceId: string) => scanAttackSurfaceAsset(orgId!, resourceId),
    onMutate: (resourceId) => {
      setScanningId(resourceId)
      markDiscoveryStarted(resourceId)
    },
    onSuccess: (_data, resourceId) => {
      markDiscoveryStarted(resourceId)
      showToast(t('assetMap.scanStarted'), 'success')
      qc.invalidateQueries({ queryKey: qk.exposure.discoveriesActive(orgId) })
      setTimeout(() => qc.invalidateQueries({ queryKey: qk.assetMapKernel(orgId) }), 8000)
    },
    onError: (err, resourceId) => {
      markDiscoveryComplete(resourceId)
      const detail = err instanceof Error ? err.message : ''
      const label = t('assetMap.scanFailed')
      showToast(detail ? `${label}: ${detail.slice(0, 90)}` : label, 'error')
    },
    onSettled: () => setScanningId(null),
  })

  const handleValidate = useCallback((node: KernelAssetMapNode, status: ValidationLocal) => {
    if (!orgId) return
    validateMut.mutate({ resourceId: node.resource_id, status })
  }, [orgId, validateMut])

  const handleScan = useCallback((node: KernelAssetMapNode) => {
    if (!orgId) return
    scanMut.mutate(node.resource_id)
  }, [orgId, scanMut])

  const handleOpenRepoAlerts = useCallback((repoId: string) => {
    if (!orgId || !repoId) return
    navigate(`/projects/${orgId}/repos/${repoId}`)
  }, [orgId, navigate])

  const nodes = useMemo(() => data?.nodes ?? [], [data?.nodes])
  const edges = useMemo(() => data?.edges ?? [], [data?.edges])

  const nodeById = useMemo(() => {
    const byId = new Map<string, KernelAssetMapNode>()
    for (const node of nodes) byId.set(node.resource_id, node)
    return byId
  }, [nodes])

  const relationshipCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of edges) {
      counts.set(edge.source_resource_id, (counts.get(edge.source_resource_id) ?? 0) + 1)
      counts.set(edge.target_resource_id, (counts.get(edge.target_resource_id) ?? 0) + 1)
    }
    return counts
  }, [edges])

  const surfaces = useMemo<SurfaceCount[]>(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      const surface = node.surface || 'unknown'
      counts.set(surface, (counts.get(surface) ?? 0) + 1)
    }
    return sortBySurface([...counts.entries()].map(([surface, count]) => ({ surface, count })))
  }, [nodes])

  const visibleNodes = useMemo(() => {
    const query = search.trim().toLowerCase()
    return nodes
      .filter(node => selectedSurface === 'all' || (node.surface || 'unknown') === selectedSurface)
      .filter(node => !query || searchText(node).includes(query))
      .sort((a, b) => {
        const findingDelta = (b.finding_count ?? 0) - (a.finding_count ?? 0)
        if (findingDelta) return findingDelta
        const alertDelta = codeAlertCount(b) - codeAlertCount(a)
        if (alertDelta) return alertDelta
        const relDelta = (relationshipCounts.get(b.resource_id) ?? 0) - (relationshipCounts.get(a.resource_id) ?? 0)
        if (relDelta) return relDelta
        return displayName(a).localeCompare(displayName(b))
      })
  }, [nodes, relationshipCounts, search, selectedSurface])

  const selectedNode = useMemo(() => {
    if (selectedId) {
      const explicit = visibleNodes.find(node => node.resource_id === selectedId) ?? nodeById.get(selectedId)
      if (explicit) return explicit
    }
    return visibleNodes[0] ?? nodes[0]
  }, [nodeById, nodes, selectedId, visibleNodes])

  const selectedRelations = useMemo<RelationCard[]>(() => {
    if (!selectedNode) return []
    return edges
      .filter(edge => edge.source_resource_id === selectedNode.resource_id || edge.target_resource_id === selectedNode.resource_id)
      .map(edge => {
        const isSource = edge.source_resource_id === selectedNode.resource_id
        return {
          edge,
          other: nodeById.get(isSource ? edge.target_resource_id : edge.source_resource_id),
          direction: isSource ? 'to' as const : 'from' as const,
        }
      })
      .sort((a, b) => {
        const leadDelta = Number(a.edge.edge_class === 'lead') - Number(b.edge.edge_class === 'lead')
        if (leadDelta) return leadDelta
        return b.edge.confidence - a.edge.confidence
      })
  }, [edges, nodeById, selectedNode])

  const actions: AssetRowActions = {
    validatedById,
    validatingId,
    scanningId,
    isScanningResource: (resourceId: string) => scanningId === resourceId || isDiscoveryScanning(resourceId),
    onValidate: handleValidate,
    onScan: handleScan,
    onOpenRepoAlerts: handleOpenRepoAlerts,
  }

  const totals = useMemo(() => {
    const hosts = nodes.filter(isHostAsset).length
    const findings = nodes.filter(node => (node.finding_count ?? 0) > 0).length
    const codeAlerts = nodes.reduce((sum, node) => sum + codeAlertCount(node), 0)
    const leads = edges.filter(edge => edge.edge_class === 'lead').length
    return { hosts, findings, codeAlerts, leads }
  }, [edges, nodes])

  if ((orgLoading && !org) || orgError || (orgReady && !org) || isLoading || isError) {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3 }}>
        <DataBoundary
          isLoading={(orgLoading && !org) || isLoading}
          isError={!!orgError || isError}
          error={orgError ?? error}
          onRetry={() => { void refetch() }}
          hasData={false}
          empty={orgReady && !org}
          label="asset map"
          emptyTitle={t('assetMap.workspaceUnavailable')}
          emptyDescription={t('assetMap.workspaceUnavailableDesc')}
          loadingVariant="spinner"
        >
          <span />
        </DataBoundary>
      </Box>
    )
  }

  return (
    <>
      <Box sx={{ height: '100%', display: 'grid', gridTemplateRows: 'auto auto 1fr', overflow: 'hidden', bgcolor: 'background.default' }}>
        <EngineerHeader
          assetCount={nodes.length}
          relationCount={edges.length}
          hostCount={totals.hosts}
          codeAlertCount={totals.codeAlerts}
          truncated={!!data?.truncated}
          showLeads={showLeads}
          isFetching={isFetching}
          onToggleLeads={() => setShowLeads(value => !value)}
          onRefresh={() => { void refetch() }}
        />
        <EngineerToolbar
          total={nodes.length}
          visible={visibleNodes.length}
          findings={totals.findings}
          search={search}
          surfaces={surfaces}
          selectedSurface={selectedSurface}
          onSearch={setSearch}
          onSelectSurface={setSelectedSurface}
        />

        {nodes.length === 0 ? (
          <Box sx={{ minHeight: 0, overflow: 'auto', p: 1.5 }}>
            <EmptyState
              hasAnyAssets={false}
              showLeads={showLeads}
              isFetching={isFetching}
              onRefresh={() => { void refetch() }}
              onShowLeads={() => setShowLeads(true)}
            />
          </Box>
        ) : (
          <Box
            sx={{
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                md: 'minmax(0, 1fr) minmax(320px, 360px)',
                xl: 'minmax(0, 1fr) 390px',
              },
              gap: 1.25,
              p: 1.25,
              overflow: { xs: 'auto', md: 'hidden' },
            }}
          >
            <AssetTablePanel
              nodes={visibleNodes}
              selectedId={selectedNode?.resource_id ?? null}
              relationshipCounts={relationshipCounts}
              actions={actions}
              onSelect={setSelectedId}
            />
            <AssetInspectorPanel
              node={selectedNode}
              relations={selectedRelations}
              relationshipCount={selectedNode ? relationshipCounts.get(selectedNode.resource_id) ?? 0 : 0}
              actions={actions}
            />
          </Box>
        )}
      </Box>
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  )
}

function EngineerHeader({
  assetCount,
  relationCount,
  hostCount,
  codeAlertCount,
  truncated,
  showLeads,
  isFetching,
  onToggleLeads,
  onRefresh,
}: {
  assetCount: number
  relationCount: number
  hostCount: number
  codeAlertCount: number
  truncated: boolean
  showLeads: boolean
  isFetching: boolean
  onToggleLeads: () => void
  onRefresh: () => void
}) {
  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 2 },
        py: 1.2,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
        <Box sx={{ width: 38, height: 38, borderRadius: 1, display: 'grid', placeItems: 'center', color: FLYTO_PURPLE, bgcolor: alpha(FLYTO_PURPLE, 0.12), boxShadow: `inset 0 0 0 1px ${alpha(FLYTO_PURPLE, 0.25)}`, flexShrink: 0 }}>
          <Network size={19} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" variant="h6" fontWeight={900} noWrap sx={{ lineHeight: 1.15 }}>
            資產關係工作台
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {assetCount} 資產 / {relationCount} 關係
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexShrink: 0 }}>
        <HeaderMetric icon={Radar} label="掃描目標" value={hostCount} tone="#0891b2" />
        <HeaderMetric icon={CodeIcon} label="代碼告警" value={codeAlertCount} tone="#ea580c" />
        {truncated && <Chip color="warning" label={tOr('assetMap.truncated', 'Truncated')} size="small" sx={{ height: 26, borderRadius: 1, fontWeight: 800 }} />}
        <LeadToggle active={showLeads} onClick={onToggleLeads} />
        <IconButton
          onClick={onRefresh}
          disabled={isFetching}
          size="small"
          aria-label={t('common.refresh')}
          title={t('common.refresh')}
          sx={{ width: 34, height: 34, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
        >
          {isFetching ? <CircularProgress size={15} /> : <RefreshCw size={16} />}
        </IconButton>
      </Box>
    </Box>
  )
}

function HeaderMetric({ icon: Icon, label, value, tone }: {
  icon: LucideIcon
  label: string
  value: number
  tone: string
}) {
  return (
    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.6, px: 0.8, py: 0.45, borderRadius: 1, bgcolor: alpha(tone, 0.08), color: tone, border: '1px solid', borderColor: alpha(tone, 0.18) }}>
      <Icon size={14} />
      <Typography variant="body2" fontWeight={900} sx={{ lineHeight: 1 }}>{value}</Typography>
      <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>{label}</Typography>
    </Box>
  )
}

function LeadToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      title={active ? '隱藏候選關係' : '顯示候選關係'}
      sx={{
        height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.45,
        px: 0.8,
        borderRadius: 1,
        border: '1px solid',
        borderColor: active ? alpha('#f59e0b', 0.5) : 'divider',
        bgcolor: active ? alpha('#f59e0b', 0.12) : 'background.default',
        color: active ? '#b45309' : 'text.secondary',
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: 850,
        transition: 'border-color .15s, background-color .15s',
        '&:hover': { borderColor: alpha('#f59e0b', 0.55), bgcolor: alpha('#f59e0b', active ? 0.15 : 0.06) },
      }}
    >
      <GitBranch size={14} />
      <Box component="span" sx={{ fontSize: 13, lineHeight: 1 }}>
        候選關係
      </Box>
      <Box component="span" sx={{ fontSize: 12, fontWeight: 900, color: active ? '#b45309' : 'text.disabled' }}>
        {active ? '開' : '關'}
      </Box>
    </Box>
  )
}

function EngineerToolbar({
  total,
  visible,
  findings,
  search,
  surfaces,
  selectedSurface,
  onSearch,
  onSelectSurface,
}: {
  total: number
  visible: number
  findings: number
  search: string
  surfaces: SurfaceCount[]
  selectedSurface: string
  onSearch: (value: string) => void
  onSelectSurface: (surface: string) => void
}) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
          <SurfaceButton
            surface="all"
            count={total}
            active={selectedSurface === 'all'}
            onClick={() => onSelectSurface('all')}
          />
          {surfaces.map(item => (
            <SurfaceButton
              key={item.surface}
              surface={item.surface}
              count={item.count}
              active={selectedSurface === item.surface}
              onClick={() => onSelectSurface(item.surface)}
            />
          ))}
          {findings > 0 && (
            <Chip
              icon={<AlertTriangle size={13} />}
              label={`${findings} ${tOr('assetMap.findings', 'findings')}`}
              size="small"
              color="warning"
              variant="outlined"
              sx={{ height: 30, borderRadius: 1, fontWeight: 800 }}
            />
          )}
        </Box>
        <TextField
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={tOr('common.search', 'Search')}
          size="small"
          sx={{
            width: { xs: 190, sm: 260, md: 320 },
            flexShrink: 0,
            '& .MuiOutlinedInput-root': {
              height: 36,
              borderRadius: 1,
              bgcolor: alpha(FLYTO_PURPLE, 0.03),
              '& fieldset': { borderColor: alpha(FLYTO_PURPLE, 0.26) },
              '&:hover fieldset': { borderColor: alpha(FLYTO_PURPLE, 0.42) },
              '&.Mui-focused fieldset': { borderColor: FLYTO_PURPLE },
            },
          }}
          InputProps={{
            startAdornment: <Search size={16} style={{ marginRight: 8, color: '#64748b', flexShrink: 0 }} />,
          }}
        />
        <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 66, textAlign: 'right' }}>
          {visible} / {total}
        </Typography>
      </Box>
    </Box>
  )
}

function SurfaceButton({
  surface,
  count,
  active,
  onClick,
}: {
  surface: string
  count: number
  active: boolean
  onClick: () => void
}) {
  const isAll = surface === 'all'
  const meta = surfaceMeta(isAll ? 'unknown' : surface)
  const Icon = isAll ? Network : meta.Icon
  const color = isAll ? FLYTO_PURPLE : meta.color
  const label = isAll ? '全部' : t(meta.labelKey)
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.55,
        px: 0.9,
        borderRadius: 1,
        border: '1px solid',
        borderColor: active ? alpha(color, 0.65) : 'divider',
        bgcolor: active ? alpha(color, 0.12) : 'background.default',
        color: active ? color : 'text.primary',
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: 850,
        boxShadow: active ? `0 0 0 2px ${alpha(color, 0.08)}` : 'none',
        transition: 'background-color .15s, border-color .15s',
        '&:hover': { borderColor: alpha(color, 0.55), bgcolor: alpha(color, 0.08) },
      }}
    >
      <Icon size={14} />
      <Box component="span" sx={{ fontSize: 13, lineHeight: 1 }}>{label}</Box>
      <Box component="span" sx={{ minWidth: 22, px: 0.55, py: 0.1, borderRadius: 0.75, bgcolor: alpha(color, active ? 0.18 : 0.1), color, fontFamily: MONO, fontSize: 12, fontWeight: 900, lineHeight: 1.35 }}>
        {count}
      </Box>
    </Box>
  )
}

function AssetTablePanel({
  nodes,
  selectedId,
  relationshipCounts,
  actions,
  onSelect,
}: {
  nodes: KernelAssetMapNode[]
  selectedId: string | null
  relationshipCounts: Map<string, number>
  actions: AssetRowActions
  onSelect: (id: string) => void
}) {
  return (
    <Paper variant="outlined" sx={{ ...panelSx(), display: 'grid', gridTemplateRows: 'auto 1fr', minWidth: 0 }}>
      <PanelHeader icon={GitBranch} title="處理列表" count={nodes.length} />
      <Box sx={{ minHeight: 0, overflow: 'auto' }}>
          <Box sx={{ minWidth: 0 }}>
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              display: 'grid',
              gridTemplateColumns: 'minmax(170px, 1fr) 76px 48px 52px 92px 34px',
              alignItems: 'center',
              columnGap: 1,
              px: 1.25,
              py: 0.9,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              boxShadow: '0 1px 0 rgba(15, 23, 42, 0.04)',
            }}
          >
            <HeaderCell text="資產" />
            <HeaderCell text="表面" />
            <HeaderCell text="關係" />
            <HeaderCell text="證據" />
            <HeaderCell text="狀態" />
            <HeaderCell text="" />
          </Box>
          {nodes.length === 0 ? (
            <EmptyLine text={tOr('assetMap.emptyFilteredTitle', 'No matching assets')} />
          ) : nodes.map(node => (
            <AssetTableRow
              key={node.resource_id}
              node={node}
              selected={selectedId === node.resource_id}
              relationCount={relationshipCounts.get(node.resource_id) ?? 0}
              actions={actions}
              onSelect={() => onSelect(node.resource_id)}
            />
          ))}
        </Box>
      </Box>
    </Paper>
  )
}

function HeaderCell({ text }: { text: string }) {
  return (
    <Typography variant="caption" color="text.secondary" fontWeight={900} noWrap sx={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {text}
    </Typography>
  )
}

function AssetTableRow({
  node,
  selected,
  relationCount,
  actions,
  onSelect,
}: {
  node: KernelAssetMapNode
  selected: boolean
  relationCount: number
  actions: AssetRowActions
  onSelect: () => void
}) {
  const color = assetTone(node)
  const findings = node.finding_count ?? 0
  const alerts = codeAlertCount(node)
  const local = actions.validatedById[node.resource_id]
  const isScanning = actions.isScanningResource(node.resource_id)
  const repoId = codeAlertRepoIds(node)[0]
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(170px, 1fr) 76px 48px 52px 92px 34px',
        alignItems: 'center',
        columnGap: 1,
        px: 1.25,
        py: 0.95,
        borderBottom: 1,
        borderColor: 'divider',
        borderLeft: '3px solid',
        borderLeftColor: selected ? color : 'transparent',
        bgcolor: selected ? alpha(color, 0.09) : 'background.paper',
        cursor: 'pointer',
        outline: 'none',
        '&:hover': { bgcolor: selected ? alpha(color, 0.11) : alpha(color, 0.04) },
        '&:focus-visible': { boxShadow: `inset 0 0 0 2px ${alpha(color, 0.28)}` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <SurfaceIcon surface={node.surface} tone={color} />
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.45, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} noWrap title={displayName(node)} sx={{ minWidth: 0 }}>
              {displayName(node)}
            </Typography>
            {findings > 0 && (
              <Chip
                label={findings}
                size="small"
                color="warning"
                sx={{ height: 18, minWidth: 22, borderRadius: 0.75, fontSize: 11, fontWeight: 900, flexShrink: 0 }}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontFamily: MONO, maxWidth: 360 }}>
            {node.resource_id}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <SurfaceChip surface={node.surface} />
          <Typography variant="caption" noWrap sx={{ display: 'block', mt: 0.25, color }}>
            {node.type}
          </Typography>
      </Box>
      <NumberCell value={relationCount} />
      <NumberCell value={node.evidence_count ?? 0} />
      <StatusChip label={statusLabel(node, local)} tone={local === 'verified' ? '#16a34a' : color} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, justifyContent: 'flex-end' }} onClick={(event) => event.stopPropagation()}>
        {alerts > 0 && repoId && (
          <IconButton
            size="small"
            onClick={() => actions.onOpenRepoAlerts(repoId)}
            title={tOr('assetMap.openRepoAlerts', 'Open repo alerts')}
            aria-label={tOr('assetMap.openRepoAlerts', 'Open repo alerts')}
            sx={{ width: 28, height: 28, borderRadius: 1, color: '#ea580c' }}
          >
            <CodeIcon size={15} />
          </IconButton>
        )}
        {isHostAsset(node) && (
          <IconButton
            size="small"
            disabled={isScanning}
            onClick={() => actions.onScan(node)}
            title={tOr('assetMap.scanThis', 'Scan')}
            aria-label={tOr('assetMap.scanThis', 'Scan')}
            sx={{ width: 28, height: 28, borderRadius: 1, color: FLYTO_PURPLE }}
          >
            {isScanning ? <CircularProgress size={14} /> : <Radar size={15} />}
          </IconButton>
        )}
      </Box>
    </Box>
  )
}

function AssetInspectorPanel({
  node,
  relations,
  relationshipCount,
  actions,
}: {
  node?: KernelAssetMapNode
  relations: RelationCard[]
  relationshipCount: number
  actions: AssetRowActions
}) {
  if (!node) {
    return (
      <Paper variant="outlined" sx={{ ...panelSx(), display: 'grid', placeItems: 'center', minHeight: 260 }}>
        <EmptyLine text={tOr('assetMap.emptyTitle', 'No assets yet')} />
      </Paper>
    )
  }

  const meta = surfaceMeta(node.surface)
  const Icon = meta.Icon
  const scores = sortBySurface(node.asset_scores ?? [])
  const local = actions.validatedById[node.resource_id]
  const isValidating = actions.validatingId === node.resource_id
  const isScanning = actions.isScanningResource(node.resource_id)
  const repoIds = codeAlertRepoIds(node)

  return (
    <Paper variant="outlined" sx={{ ...panelSx(), display: 'grid', gridTemplateRows: 'auto 1fr', minWidth: 0 }}>
      <PanelHeader icon={ShieldCheck} title="焦點資產" count={relationshipCount} />
      <Box sx={{ minHeight: 0, overflow: 'auto', p: 1.25 }}>
        <Box sx={{ p: 1.25, borderRadius: 1, border: '1px solid', borderColor: alpha(meta.color, 0.35), bgcolor: alpha(meta.color, 0.08) }}>
          <Box sx={{ display: 'flex', gap: 1, minWidth: 0, alignItems: 'center' }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(meta.color, 0.16), color: meta.color, boxShadow: `inset 0 0 0 1px ${alpha(meta.color, 0.28)}`, flexShrink: 0 }}>
              <Icon size={20} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={900} noWrap title={displayName(node)}>
                {displayName(node)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {t(meta.labelKey)} / {node.type}
              </Typography>
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontFamily: MONO, wordBreak: 'break-all' }}>
            {node.resource_id}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75, mt: 1 }}>
          <DetailFact label="信心度" value={formatConfidence(node.confidence)} />
          <DetailFact label="證據" value={node.evidence_count ?? 0} />
          <DetailFact label="關係" value={relationshipCount} />
          <DetailFact label="發現" value={node.finding_count ?? 0} warn={(node.finding_count ?? 0) > 0} />
          <DetailFact label="最後看見" value={formatDate(node.last_seen_at)} />
          <DetailFact label="狀態" value={statusLabel(node, local)} />
        </Box>

        <Box sx={{ display: 'flex', gap: 0.55, flexWrap: 'wrap', mt: 1 }}>
          {isHostAsset(node) && (
            <>
              <Button
                size="small"
                variant="contained"
                color="success"
                disabled={isValidating || local === 'verified'}
                startIcon={isValidating ? <CircularProgress size={13} color="inherit" /> : <CheckCircle2 size={15} />}
                onClick={() => actions.onValidate(node, 'verified')}
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 850 }}
              >
                {tOr('assetMap.markVerified', 'Mark verified')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                disabled={isValidating || local === 'false_positive'}
                startIcon={<XCircle size={15} />}
                onClick={() => actions.onValidate(node, 'false_positive')}
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 850 }}
              >
                {tOr('assetMap.falsePositive', 'False positive')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={isScanning}
                startIcon={isScanning ? <CircularProgress size={13} /> : <Radar size={15} />}
                onClick={() => actions.onScan(node)}
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 850 }}
              >
                {tOr('assetMap.scanThis', 'Scan')}
              </Button>
            </>
          )}
          {repoIds[0] && (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<ExternalLink size={15} />}
              onClick={() => actions.onOpenRepoAlerts(repoIds[0])}
              sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 850 }}
            >
              查看代碼告警
            </Button>
          )}
        </Box>

        <SectionTitle icon={<Link2 size={14} />} text="關聯關係" count={relations.length} />
        <Box sx={{ display: 'grid', gap: 0.65 }}>
          {relations.length === 0 ? (
            <EmptyLine compact text={tOr('assetMap.noRelationships', 'No relationships')} />
          ) : relations.slice(0, 80).map(relation => (
            <RelationItem key={relation.edge.id} relation={relation} />
          ))}
        </Box>

        <SectionTitle icon={<ShieldCheck size={14} />} text="表面評分" count={scores.length} />
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {scores.length === 0 ? (
            <StatusChip label={tOr('assetMap.unscored', 'Unscored')} tone="#64748b" />
          ) : scores.map(score => <ScoreChip key={score.surface} score={score} />)}
        </Box>

        {(node.dimensions?.length ?? 0) > 0 && (
          <>
            <SectionTitle icon={<CircleDot size={14} />} text="維度" count={node.dimensions.length} />
            <Box sx={{ display: 'flex', gap: 0.45, flexWrap: 'wrap' }}>
              {node.dimensions.map(item => (
                <Chip key={item} label={item} size="small" variant="outlined" sx={{ height: 23, borderRadius: 1, fontWeight: 750 }} />
              ))}
            </Box>
          </>
        )}
      </Box>
    </Paper>
  )
}

function RelationItem({ relation }: { relation: RelationCard }) {
  const edge = relation.edge
  const other = relation.other
  const color = assetTone(other)
  return (
    <Box sx={{ border: '1px solid', borderColor: edge.edge_class === 'lead' ? alpha('#f59e0b', 0.35) : 'divider', borderRadius: 1, p: 0.85, bgcolor: edge.edge_class === 'lead' ? alpha('#f59e0b', 0.06) : 'background.paper' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, minWidth: 0 }}>
        <Chip
          label={relation.direction === 'to' ? '指向' : '來源'}
          size="small"
          sx={{ height: 20, borderRadius: 1, bgcolor: alpha(color, 0.12), color, fontWeight: 850 }}
        />
        <Typography variant="body2" fontWeight={850} noWrap title={other ? displayName(other) : edge.target_resource_id} sx={{ minWidth: 0, flex: 1 }}>
          {other ? displayName(other) : (relation.direction === 'to' ? edge.target_resource_id : edge.source_resource_id)}
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={800}>{formatConfidence(edge.confidence)}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.45, flexWrap: 'wrap', mt: 0.55 }}>
        <Chip label={edge.relation_type} size="small" variant="outlined" sx={{ height: 20, borderRadius: 1, fontSize: 11 }} />
        {edge.edge_class === 'lead' && <Chip label={tOr('assetMap.lead', 'Lead')} size="small" color="warning" variant="outlined" sx={{ height: 20, borderRadius: 1, borderStyle: 'dashed', fontSize: 11 }} />}
        {edge.evidence_count > 0 && <Chip label={`${edge.evidence_count} ${tOr('assetMap.evidence', 'evidence')}`} size="small" variant="outlined" sx={{ height: 20, borderRadius: 1, fontSize: 11 }} />}
      </Box>
    </Box>
  )
}

function PanelHeader({ icon: Icon, title, count }: {
  icon: LucideIcon
  title: string
  count?: number
}) {
  return (
    <Box sx={{ px: 1.25, py: 0.95, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: 'background.paper' }}>
      <Icon size={15} style={{ color: FLYTO_PURPLE, flexShrink: 0 }} />
      <Typography variant="body2" fontWeight={900} noWrap sx={{ flex: 1 }}>{title}</Typography>
      {count !== undefined && (
        <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 900, px: 0.65, py: 0.15, borderRadius: 0.75, bgcolor: alpha(FLYTO_PURPLE, 0.14), color: FLYTO_PURPLE }}>
          {count}
        </Box>
      )}
    </Box>
  )
}

function SectionTitle({ icon, text, count }: {
  icon: ReactNode
  text: string
  count?: number
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.35, mb: 0.65, color: FLYTO_PURPLE }}>
      {icon}
      <Typography variant="body2" fontWeight={900} sx={{ color: 'text.primary', flex: 1 }}>{text}</Typography>
      {count !== undefined && (
        <Typography variant="caption" color="text.secondary" fontWeight={800}>{count}</Typography>
      )}
    </Box>
  )
}

function DetailFact({ label, value, warn = false }: {
  label: string
  value: string | number
  warn?: boolean
}) {
  return (
    <Box sx={{ p: 0.85, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800} noWrap sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={900} noWrap title={String(value)} sx={{ color: warn ? 'warning.main' : 'text.primary' }}>
        {value}
      </Typography>
    </Box>
  )
}

function SurfaceIcon({ surface, tone }: { surface?: string; tone?: string }) {
  const meta = surfaceMeta(surface)
  const Icon = meta.Icon
  const color = tone ?? meta.color
  return (
    <Box sx={{ width: 30, height: 30, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(color, 0.13), color, boxShadow: `inset 0 0 0 1px ${alpha(color, 0.25)}`, flexShrink: 0 }}>
      <Icon size={16} />
    </Box>
  )
}

function SurfaceChip({ surface }: { surface?: string }) {
  const meta = surfaceMeta(surface)
  return (
    <Chip
      label={t(meta.labelKey)}
      size="small"
      sx={{ height: 22, borderRadius: 1, fontSize: 12, bgcolor: alpha(meta.color, 0.13), color: meta.color, fontWeight: 850 }}
    />
  )
}

function StatusChip({ label, tone }: { label: string; tone: string }) {
  return (
    <Chip
      label={label}
      size="small"
      sx={{ maxWidth: '100%', height: 23, borderRadius: 1, bgcolor: alpha(tone, 0.13), color: tone, fontWeight: 850, '.MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
    />
  )
}

function ScoreChip({ score }: { score: KernelAssetScore }) {
  const meta = surfaceMeta(score.surface)
  return (
    <Chip
      label={scoreLabel(score)}
      title={scoreLabel(score)}
      size="small"
      sx={{ height: 23, borderRadius: 1, bgcolor: alpha(meta.color, 0.13), color: meta.color, fontWeight: 850 }}
    />
  )
}

function NumberCell({ value, warn = false }: { value: number; warn?: boolean }) {
  return (
    <Typography variant="body2" fontWeight={900} noWrap sx={{ color: warn ? 'warning.main' : 'text.primary', fontFamily: MONO }}>
      {value}
    </Typography>
  )
}

function EmptyLine({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <Box sx={{ px: compact ? 0 : 1.5, py: compact ? 0.5 : 2, color: 'text.secondary' }}>
      <Typography variant="body2">{text}</Typography>
    </Box>
  )
}

function EmptyState({
  hasAnyAssets,
  showLeads,
  isFetching,
  onRefresh,
  onShowLeads,
}: {
  hasAnyAssets: boolean
  showLeads: boolean
  isFetching: boolean
  onRefresh: () => void
  onShowLeads: () => void
}) {
  const title = hasAnyAssets
    ? tOr('assetMap.emptyFilteredTitle', 'No matching assets')
    : tOr('assetMap.emptyTitle', 'No assets yet')
  const description = hasAnyAssets
    ? tOr('assetMap.emptyFilteredDescription', 'Adjust the surface filter or search.')
    : tOr('assetMap.emptyDescription', 'Refresh the kernel asset map after discovery finishes.')

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', mt: 4, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', p: 2.5, boxShadow: PANEL_SHADOW }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
        <Box sx={{ width: 42, height: 42, borderRadius: 1, bgcolor: alpha(FLYTO_PURPLE, 0.12), color: FLYTO_PURPLE, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Network size={21} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" fontWeight={900}>{title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.5 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={isFetching ? <CircularProgress size={13} color="inherit" /> : <RefreshCw size={15} />}
              onClick={onRefresh}
              disabled={isFetching}
              sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 850 }}
            >
              {t('common.refresh')}
            </Button>
            {!showLeads && (
              <Button
                variant="outlined"
                size="small"
                onClick={onShowLeads}
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 850 }}
              >
                {tOr('assetMap.showLeads', 'Show leads')}
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
