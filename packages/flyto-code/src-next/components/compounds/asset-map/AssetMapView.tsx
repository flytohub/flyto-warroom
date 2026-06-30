/**
 * AssetMapView - kernel-backed cross-surface asset map.
 *
 * The read model is /asset-map/kernel. Legacy /asset-mappings is no longer
 * used as the page's source of truth, so code/container/cloud resources and
 * multi-surface asset_scores[] render from the backend contract directly.
 */

import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import { alpha } from '@mui/material/styles'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Link2,
  Network,
  Radar,
  RefreshCw,
  ShieldAlert,
  Code as CodeIcon,
  type LucideIcon,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  markDiscoveryComplete,
  markDiscoveryStarted,
  useDiscoverySeed,
  useDiscoveryStatus,
} from '@hooks/useDiscoveryStatus'
import { surfaceDef, surfaceColor, SURFACE_LIST } from '@lib/surfaces'
import { SeverityChip } from '@atoms/SeverityChip'
import { StatusDot } from '@atoms/StatusDot'
import { TabBar } from '@atoms/TabBar'
import { DataBoundary } from '@atoms/DataBoundary'
import {
  getKernelAssetMap,
  type KernelAssetMapEdge,
  type KernelAssetMapNode,
  type KernelAssetScore,
} from '@lib/engine'
// Direct-path import (decoupling rule): NEW per-asset lifecycle clients
// live in the easm-footprint domain folder, NOT the @lib/engine barrel.
import {
  validateAttackSurfaceAsset,
  scanAttackSurfaceAsset,
} from '@lib/engine/code/footprintSurface'

// Host-shaped external assets are the only nodes the per-asset
// validate / scan endpoints accept: validate marks ownership of a
// discovered domain/subdomain, and the scan handler's kernel-first
// path only promotes domain/subdomain resources to a scan target.
function isHostAsset(node: KernelAssetMapNode): boolean {
  return (
    (node.surface || 'unknown') === 'external' &&
    (node.type === 'domain' || node.type === 'subdomain')
  )
}

// Wave-1 superset fields on /asset-map/kernel nodes — the cross-surface
// code↔asset join. Declared as a local narrowing because the kernel
// client type (lib/engine/ctem/asset-map.ts) is owned by another lane;
// these are read-only and may be absent on older payloads.
interface CodeAlertFields {
  code_alert_count?: number
  code_alert_repo_ids?: string[]
}

function codeAlertCount(node: KernelAssetMapNode): number {
  return (node as KernelAssetMapNode & CodeAlertFields).code_alert_count ?? 0
}

function codeAlertRepoIds(node: KernelAssetMapNode): string[] {
  return (node as KernelAssetMapNode & CodeAlertFields).code_alert_repo_ids ?? []
}

type ValidationLocal = 'verified' | 'false_positive'

interface AssetRowActions {
  // Optimistic local validation override, keyed by resource_id. The
  // asset-map kernel node carries no validation_status, so the toggle
  // result is tracked client-side until the next refetch.
  validatedById: Record<string, ValidationLocal>
  validatingId: string | null
  scanningId: string | null
  isScanningResource: (resourceId: string) => boolean
  onValidate: (node: KernelAssetMapNode, status: ValidationLocal) => void
  onScan: (node: KernelAssetMapNode) => void
  // Deep-link into a contributing repo's alerts (code↔asset join).
  onOpenRepoAlerts: (repoId: string) => void
}

// Surface order + metadata now derive from the canonical registry
// (@lib/surfaces) instead of a local SURFACE_META/SURFACE_ORDER duplicate.
const SURFACE_ORDER: string[] = SURFACE_LIST.map(s => s.id)
const FLYTO_PURPLE = '#7c3aed'
const MONO = "'ui-monospace','SFMono-Regular','Menlo','Consolas',monospace"
// Translucent tints (not opaque light hex) so they read correctly in BOTH
// light and dark mode — an opaque pastel becomes a bright blob on dark.
const FLYTO_PURPLE_SOFT = 'rgba(124, 58, 237, 0.16)'
const FLYTO_PURPLE_LINE = 'rgba(124, 58, 237, 0.28)'
const FLYTO_PURPLE_TINT = 'rgba(124, 58, 237, 0.08)'
const FLYTO_PURPLE_TINT_HOVER = 'rgba(124, 58, 237, 0.1)'
const FLYTO_PURPLE_FOCUS = 'rgba(124, 58, 237, 0.2)'

function surfaceMeta(surface?: string) {
  return surfaceDef(surface)
}

function displayName(node: KernelAssetMapNode) {
  return node.display_name || node.canonical_value || node.resource_id
}

function scoreLabel(score: KernelAssetScore) {
  return `${score.surface}: ${score.display_score ?? score.score}${score.grade ? ` ${score.grade}` : ''}`
}

function sortBySurface<T extends { surface?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const ai = SURFACE_ORDER.indexOf(a.surface || 'unknown')
    const bi = SURFACE_ORDER.indexOf(b.surface || 'unknown')
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
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
  // Split the board into local-scroll tabs (operator: 整體不滾動,局部滾動)
  // so the relationship inspector isn't piled below the asset clusters.
  const [assetTab, setAssetTab] = useState<'assets' | 'relations'>('assets')
  // confirmed_asset_graph is the default; the operator opts into the
  // candidate-edge overlay (rendered dashed/faded) via this toggle.
  const [showLeads, setShowLeads] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.assetMapKernelMode(orgId, showLeads ? 'leads' : 'confirmed'),
    queryFn: () => getKernelAssetMap(orgId!, { showDiscoveryLeads: showLeads }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // ─── Per-asset lifecycle: validate ownership + one-click scan ──────
  // Inline row actions on host-shaped external nodes. The kernel asset
  // map has no validation_status field, so the validate result is held
  // optimistically client-side (validatedById) until the next refetch.
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null)
  const [validatedById, setValidatedById] = useState<Record<string, ValidationLocal>>({})
  const [validatingId, setValidatingId] = useState<string | null>(null)
  const [scanningId, setScanningId] = useState<string | null>(null)

  const showToast = useCallback((msg: string, severity: 'success' | 'error') => {
    setToast({ msg, severity })
  }, [])

  const validateMut = useMutation({
    mutationFn: ({ resourceId, status }: { resourceId: string; status: ValidationLocal }) =>
      validateAttackSurfaceAsset(orgId!, resourceId, status),
    onMutate: ({ resourceId }) => setValidatingId(resourceId),
    onSuccess: (_res, { resourceId, status }) => {
      // Optimistic local override — the map node doesn't carry the
      // field, so reflect the new state without a full refetch.
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
    onSettled: () => setValidatingId(null),
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
      // Score / finding badges update once discovery lands — nudge a
      // refetch after a short delay so the card reflects new state.
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

  // Deep-link into the contributing repo's alerts. Mirrors the
  // `_repo:<id>` → /projects/{org}/repos/{id} mapping used by Pulse /
  // Issues (see sectionNav.sectionToPath); the repo detail view is the
  // canonical place its open code alerts render.
  const handleOpenRepoAlerts = useCallback((repoId: string) => {
    if (!orgId || !repoId) return
    navigate(`/projects/${orgId}/repos/${repoId}`)
  }, [orgId, navigate])

  const rowActions: AssetRowActions = {
    validatedById,
    validatingId,
    scanningId,
    isScanningResource: (resourceId: string) => scanningId === resourceId || isDiscoveryScanning(resourceId),
    onValidate: handleValidate,
    onScan: handleScan,
    onOpenRepoAlerts: handleOpenRepoAlerts,
  }

  const nodes = useMemo(() => data?.nodes ?? [], [data?.nodes])
  const edges = useMemo(() => data?.edges ?? [], [data?.edges])
  const visibleNodes = useMemo(() => {
    if (selectedSurface === 'all') return nodes
    return nodes.filter(n => (n.surface || 'unknown') === selectedSurface)
  }, [nodes, selectedSurface])

  const nodeById = useMemo(() => {
    const m = new Map<string, KernelAssetMapNode>()
    for (const n of nodes) m.set(n.resource_id, n)
    return m
  }, [nodes])

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.resource_id)), [visibleNodes])
  const visibleEdges = useMemo(() => {
    return edges.filter(e => visibleNodeIds.has(e.source_resource_id) && visibleNodeIds.has(e.target_resource_id))
  }, [edges, visibleNodeIds])
  const relationshipCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of edges) {
      counts.set(e.source_resource_id, (counts.get(e.source_resource_id) ?? 0) + 1)
      counts.set(e.target_resource_id, (counts.get(e.target_resource_id) ?? 0) + 1)
    }
    return counts
  }, [edges])
  const selectedNode = selectedId && visibleNodeIds.has(selectedId) ? nodeById.get(selectedId) : undefined
  const panelEdges = useMemo(() => {
    if (!selectedNode) return visibleEdges
    return visibleEdges.filter(e => e.source_resource_id === selectedNode.resource_id || e.target_resource_id === selectedNode.resource_id)
  }, [selectedNode, visibleEdges])

  const surfaceCounts = data?.summary?.by_surface ?? {}
  const surfaces = sortBySurface(Object.keys(surfaceCounts).map(surface => ({ surface, count: surfaceCounts[surface] })))
  const scoredNodes = nodes.filter(n => (n.asset_scores?.length ?? 0) > 0).length
  const findingNodes = nodes.filter(n => (n.finding_count ?? 0) > 0).length

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
    <Box sx={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', overflow: 'hidden' }}>
      <Box
        sx={{
          px: 2, py: 1.25,
          borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Network size={18} style={{ color: FLYTO_PURPLE, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" variant="subtitle1" fontWeight={700} noWrap sx={{ lineHeight: 1.2 }}>
              {t('assetMap.title')}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {t('assetMap.subtitle')}
            </Typography>
          </Box>
          {/* Non-redundant metrics only — the resource total + surface
              breakdown live in the filter bar below, so we don't repeat
              them here. Relationships / Scored / Findings are unique. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 1, pl: 1.5, borderLeft: 1, borderColor: 'divider' }}>
            <HeaderMetric icon={Link2} label={t('assetMap.relationships')} value={edges.length} />
            <HeaderMetric icon={ShieldAlert} label={t('assetMap.scoredAssets')} value={scoredNodes} />
            <HeaderMetric icon={AlertTriangle} label={t('assetMap.findingBadges')} value={findingNodes} warn={findingNodes > 0} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {data?.truncated && nodes.length > 0 && (
            <Chip color="warning" label={t('assetMap.truncated')} size="small" sx={{ height: 24, fontWeight: 600, borderRadius: 1 }} />
          )}
          <Chip
            label={t('assetMap.showLeads')}
            size="small"
            clickable
            onClick={() => setShowLeads(v => !v)}
            color={showLeads ? 'warning' : 'default'}
            variant={showLeads ? 'filled' : 'outlined'}
            title={t('assetMap.showLeadsHint')}
            sx={{ height: 24, fontWeight: 600, borderRadius: 1, borderStyle: 'dashed' }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={isFetching ? <CircularProgress size={12} /> : <RefreshCw size={14} />}
            onClick={() => refetch()}
            disabled={isFetching}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1 }}
          >
            {t('common.refresh')}
          </Button>
        </Box>
      </Box>

      <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
        {nodes.length > 0 && (
          <SurfaceFilterBar
            total={nodes.length}
            surfaces={surfaces}
            selectedSurface={selectedSurface}
            onSelect={setSelectedSurface}
            types={data?.summary?.by_type ?? {}}
          />
        )}
        {visibleNodes.length === 0 ? (
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Box sx={{ maxWidth: 1320, mx: 'auto', px: { xs: 1, md: 1.5 }, pb: 1.5 }}>
              <EmptyState
                hasAnyAssets={nodes.length > 0}
                showLeads={showLeads}
                isFetching={isFetching}
                onRefresh={() => refetch()}
                onShowLeads={() => setShowLeads(true)}
              />
            </Box>
          </Box>
        ) : (
          <>
            {/* Tabs — Assets vs Relationships, each its own local scroll
                region so the page shell never scrolls as a whole. */}
            <Box sx={{ px: { xs: 1, md: 1.5 }, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
              <Box sx={{ maxWidth: 1320, mx: 'auto' }}>
                <TabBar
                  accentColor={FLYTO_PURPLE}
                  value={assetTab}
                  onChange={(v) => setAssetTab(v as 'assets' | 'relations')}
                  items={[
                    { value: 'assets', label: t('assetMap.tabAssets'), count: visibleNodes.length },
                    { value: 'relations', label: t('assetMap.tabRelations'), count: visibleEdges.length },
                  ]}
                />
              </Box>
            </Box>

            {assetTab === 'assets' && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <Box sx={{ maxWidth: 1320, mx: 'auto' }}>
                  <AssetGrid
                    nodes={visibleNodes}
                    actions={rowActions}
                    relationshipCounts={relationshipCounts}
                    selectedId={selectedNode?.resource_id ?? null}
                    onSelect={setSelectedId}
                  />
                </Box>
              </Box>
            )}

            {assetTab === 'relations' && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.25 }}>
                <Box sx={{ maxWidth: 1320, mx: 'auto' }}>
                  <RelationshipBlock edges={panelEdges} nodeById={nodeById} />
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>
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

function HeaderMetric({ icon: Icon, label, value, warn = false }: {
  icon: LucideIcon
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
      <Icon size={14} style={{ color: warn ? '#dc2626' : '#94a3b8', flexShrink: 0 }} />
      <Typography variant="body2" fontWeight={800} sx={{ color: warn ? 'error.main' : 'text.primary', lineHeight: 1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
    </Box>
  )
}

function SurfaceFilterBar({
  total,
  surfaces,
  selectedSurface,
  onSelect,
  types,
}: {
  total: number
  surfaces: Array<{ surface: string; count: number }>
  selectedSurface: string
  onSelect: (surface: string) => void
  types: Record<string, number>
}) {
  const topTypes = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <Box sx={{
      borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper',
      // faint grid-dot texture → terminal/console feel.
      backgroundImage: `radial-gradient(circle at 1px 1px, ${alpha(FLYTO_PURPLE, 0.05)} 1px, transparent 0)`,
      backgroundSize: '20px 20px',
    }}>
      <Box sx={{ maxWidth: 1320, mx: 'auto', px: { xs: 1, md: 1.5 }, py: 1 }}>
        <Box sx={{ display: 'flex', gap: 0.6, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterLabel text={t('assetMap.surfaces')} color={FLYTO_PURPLE} />
          <SurfacePill
            surface="all"
            count={total}
            active={selectedSurface === 'all'}
            onClick={() => onSelect('all')}
          />
          {surfaces.map(s => (
            <SurfacePill
              key={s.surface}
              surface={s.surface || 'unknown'}
              count={s.count}
              active={selectedSurface === (s.surface || 'unknown')}
              onClick={() => onSelect(s.surface || 'unknown')}
            />
          ))}
        </Box>
        {topTypes.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap', mt: 0.85 }}>
            <FilterLabel text={t('assetMap.types')} color="#64748b" />
            {topTypes.map(([type, count]) => {
              const c = typeColor(type)
              return (
                <Box key={type} sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.55,
                  px: 0.7, py: 0.3, borderRadius: 1,
                  border: '1px solid', borderColor: alpha(c, 0.28), bgcolor: alpha(c, 0.05),
                }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: c, flexShrink: 0 }} />
                  <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary' }}>{type}</Box>
                  <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: c }}>{count}</Box>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// Section label — mono uppercase with a colored tick, for the filter bar.
function FilterLabel({ text, color }: { text: string; color: string }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, mr: 0.5 }}>
      <Box sx={{ width: 3, height: 12, borderRadius: 1, bgcolor: color }} />
      <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>
        {text}
      </Box>
    </Box>
  )
}

// Asset-type → surface accent colour, so the type chips are colour-keyed
// to the same palette as the surface pills (tech, consistent).
function typeColor(type: string): string {
  if (type === 'repo') return surfaceColor('code')
  if (type === 'container_image') return surfaceColor('container')
  if (['cloud_account', 'cloud_resource', 'aws_account', 'gcp_project', 'azure_subscription', 'kubernetes_cluster'].includes(type)) return surfaceColor('cloud')
  if ([
    'runtime_event',
    'runtime_agent',
    'mcp_server',
    'mcp_tool',
    'ai_agent',
    'agent_session',
    'workload',
    'kubernetes_workload',
    'pod',
    'deployment',
    'vm',
    'host',
    'process',
  ].includes(type)) return surfaceColor('runtime')
  if (['subdomain', 'domain', 'ip', 'url', 'handle', 'organization'].includes(type)) return surfaceColor('external')
  return '#64748b'
}

function AssetGrid({
  nodes,
  actions,
  relationshipCounts,
  selectedId,
  onSelect,
}: {
  nodes: KernelAssetMapNode[]
  actions: AssetRowActions
  relationshipCounts: Map<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const groups = useMemo(() => {
    const bySurface = new Map<string, KernelAssetMapNode[]>()
    for (const node of nodes) {
      const key = node.surface || 'unknown'
      bySurface.set(key, [...(bySurface.get(key) ?? []), node])
    }
    return sortBySurface([...bySurface.entries()].map(([surface, items]) => ({ surface, nodes: items })))
  }, [nodes])
  const selected = selectedId ? nodes.find(node => node.resource_id === selectedId) : nodes[0]

  // Uniform card grid — every card is the SAME width (one auto-fill
  // column) and top-aligned, so the layout reads as an even, scannable
  // board instead of the old arbitrary-span masonry that left holes and
  // looked scattered ("東一塊西一塊"). Cards flow: focused asset → one
  // card per surface cluster → relationship inspector.
  return (
    <Box sx={{
      p: 1.25,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
      gap: 1,
      alignItems: 'start',
    }}>
      {selected && (
        <SelectedAssetBlock
          node={selected}
          actions={actions}
          relationshipCount={relationshipCounts.get(selected.resource_id) ?? 0}
          onSelect={() => onSelect(selected.resource_id)}
        />
      )}
      {groups.map((group) => (
        <AssetClusterBlock
          key={group.surface}
          surface={group.surface}
          nodes={group.nodes}
          actions={actions}
          relationshipCounts={relationshipCounts}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </Box>
  )
}

function RelationshipBlock({
  edges,
  nodeById,
}: {
  edges: KernelAssetMapEdge[]
  nodeById: Map<string, KernelAssetMapNode>
}) {
  // Lives in its own scrolling tab now, so show a generous slice.
  const shown = edges.slice(0, 200)
  const hidden = edges.length - shown.length

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Box sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ width: 22, height: 22, borderRadius: 0.75, bgcolor: FLYTO_PURPLE_SOFT, color: FLYTO_PURPLE, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <GitBranch size={12} />
        </Box>
        <Typography variant="body2" fontWeight={800} noWrap sx={{ flex: 1 }}>
          {t('assetMap.relationships')}
        </Typography>
        <Typography variant="caption" color="text.secondary">{edges.length}</Typography>
      </Box>
      {shown.length === 0 ? (
        <Box sx={{ px: 1, py: 1.25 }}>
          <Typography variant="body2" color="text.secondary">
            {t('assetMap.noRelationships')}
          </Typography>
        </Box>
      ) : (
        <Box>
          {shown.map(edge => (
            <RelationshipMiniRow
              key={edge.id}
              edge={edge}
              source={nodeById.get(edge.source_resource_id)}
              target={nodeById.get(edge.target_resource_id)}
            />
          ))}
        </Box>
      )}
      {hidden > 0 && (
        <Box sx={{ px: 1, py: 0.6, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
          <Typography variant="caption" color="text.secondary">+{hidden} {t('assetMap.more')}</Typography>
        </Box>
      )}
    </Box>
  )
}

function RelationshipMiniRow({
  edge,
  source,
  target,
}: {
  edge: KernelAssetMapEdge
  source?: KernelAssetMapNode
  target?: KernelAssetMapNode
}) {
  const isLead = edge.edge_class === 'lead'

  return (
    <Box sx={{
      px: 1,
      py: 0.7,
      borderTop: 1,
      borderTopColor: 'divider',
      ...(isLead && { opacity: 0.68, borderLeft: '2px dashed', borderLeftColor: 'warning.main' }),
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, mb: 0.35 }}>
        <Chip label={edge.relation_type} size="small" sx={{ height: 19, fontSize: 12, fontWeight: 700, borderRadius: 1 }} />
        {isLead && (
          <Chip
            label={t('assetMap.lead')}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ height: 19, fontSize: 12, borderRadius: 1, borderStyle: 'dashed' }}
          />
        )}
        {edge.confidence_label && <Chip label={edge.confidence_label} size="small" variant="outlined" sx={{ height: 19, fontSize: 12, borderRadius: 1 }} />}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
          {formatConfidence(edge.confidence)}
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.1 }}>
        <Typography variant="caption" fontWeight={700} noWrap title={source ? displayName(source) : edge.source_resource_id}>
          {source ? displayName(source) : edge.source_resource_id}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap title={target ? displayName(target) : edge.target_resource_id}>
          {target ? displayName(target) : edge.target_resource_id}
        </Typography>
      </Box>
      {edge.evidence_count > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {edge.evidence_count} {t('assetMap.evidence')}
        </Typography>
      )}
    </Box>
  )
}

function SelectedAssetBlock({
  node,
  actions,
  relationshipCount,
  onSelect,
}: {
  node: KernelAssetMapNode
  actions: AssetRowActions
  relationshipCount: number
  onSelect: () => void
}) {
  const meta = surfaceMeta(node.surface)
  const Icon = meta.Icon
  const scores = sortBySurface(node.asset_scores ?? [])
  const host = isHostAsset(node)
  const validated = actions.validatedById[node.resource_id]
  const isValidating = actions.validatingId === node.resource_id
  const isScanning = actions.isScanningResource(node.resource_id)

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
        cursor: 'pointer',
        gridColumn: { xs: '1 / -1', md: 'span 5', xl: 'span 5' },
        p: 1,
        border: 1,
        borderColor: FLYTO_PURPLE,
        borderRadius: 1,
        bgcolor: FLYTO_PURPLE_TINT,
        boxShadow: `inset 0 2px 0 ${FLYTO_PURPLE}`,
        outline: 'none',
        '&:hover': { bgcolor: FLYTO_PURPLE_TINT_HOVER },
        '&:focus-visible': { borderColor: FLYTO_PURPLE, boxShadow: `0 0 0 2px ${FLYTO_PURPLE_FOCUS}` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <Box sx={{ width: 24, height: 24, borderRadius: 0.75, bgcolor: alpha(meta.color, 0.16), color: meta.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={13} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={800} noWrap title={displayName(node)}>{displayName(node)}</Typography>
        </Box>
        <SurfaceChip surface={node.surface} />
      </Box>

      <Box sx={{ display: 'flex', gap: 1.25, mt: 1, flexWrap: 'wrap' }}>
        <InlineDatum label={t('assetMap.type')} value={node.type} />
        <InlineDatum label={t('assetMap.relationships')} value={relationshipCount} />
        <InlineDatum label={t('assetMap.findings')} value={node.finding_count ?? 0} warn={(node.finding_count ?? 0) > 0} />
        <InlineDatum label={t('assetMap.confidence')} value={node.confidence > 0 ? formatConfidence(node.confidence) : '-'} />
      </Box>

      <Box sx={{ display: 'flex', gap: 0.35, flexWrap: 'wrap', mt: 0.75 }}>
        {node.current_tier && <Chip label={node.current_tier} size="small" variant="outlined" sx={tinyChipSx} />}
        {scores.length > 0 ? scores.slice(0, 2).map(score => <ScoreChip key={score.surface} score={score} />) : (
          <Chip label={t('assetMap.unscored')} size="small" variant="outlined" sx={tinyChipSx} />
        )}
        {scores.length > 2 && <Chip label={`+${scores.length - 2}`} size="small" variant="outlined" sx={tinyChipSx} />}
        {validated && (
          <Chip
            label={validated === 'verified' ? t('assetMap.verified') : t('assetMap.falsePositive')}
            size="small"
            color={validated === 'verified' ? 'success' : 'default'}
            variant={validated === 'verified' ? 'filled' : 'outlined'}
            sx={{ ...tinyChipSx, fontWeight: 700 }}
          />
        )}
        <CodeAlertsBadge node={node} onOpenRepoAlerts={actions.onOpenRepoAlerts} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, fontFamily: 'monospace' }}>
          {node.resource_id}
        </Typography>
        {host ? (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              size="small"
              variant="text"
              color="success"
              disabled={isValidating || validated === 'verified'}
              startIcon={isValidating ? <CircularProgress size={12} /> : <CheckCircle2 size={14} />}
              onClick={() => actions.onValidate(node, 'verified')}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, minWidth: 0 }}
            >
              {t('assetMap.markVerified')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={isScanning}
              startIcon={isScanning ? <CircularProgress size={12} /> : <Radar size={14} />}
              onClick={() => actions.onScan(node)}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12, minWidth: 0 }}
            >
              {t('assetMap.scanThis')}
            </Button>
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{t('assetMap.noAssetActions')}</Typography>
        )}
      </Box>
    </Box>
  )
}

function AssetClusterBlock({
  surface,
  nodes,
  actions,
  relationshipCounts,
  selectedId,
  onSelect,
}: {
  surface: string
  nodes: KernelAssetMapNode[]
  actions: AssetRowActions
  relationshipCounts: Map<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const meta = surfaceMeta(surface)
  const Icon = meta.Icon
  const shown = nodes.slice(0, 6)
  const hidden = nodes.length - shown.length

  return (
    <Paper variant="outlined" sx={{ borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Surface header — coloured chip + label + count. */}
      <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: alpha(meta.color, 0.16), color: meta.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={13} />
        </Box>
        <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1 }}>{meta.label}</Typography>
        <Chip label={nodes.length} size="small" variant="outlined" sx={{ height: 20, fontSize: 12, fontWeight: 700, borderRadius: 1 }} />
      </Box>
      <Box>
        {shown.map(node => (
          <AssetMiniRow
            key={node.resource_id}
            node={node}
            actions={actions}
            relationshipCount={relationshipCounts.get(node.resource_id) ?? 0}
            selected={selectedId === node.resource_id}
            onSelect={() => onSelect(node.resource_id)}
          />
        ))}
      </Box>
      {hidden > 0 && (
        <Box sx={{ px: 1.5, py: 0.75, borderTop: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>+{hidden} {t('assetMap.more')}</Typography>
        </Box>
      )}
    </Paper>
  )
}

function AssetMiniRow({
  node,
  actions,
  relationshipCount,
  selected,
  onSelect,
}: {
  node: KernelAssetMapNode
  actions: AssetRowActions
  relationshipCount: number
  selected: boolean
  onSelect: () => void
}) {
  const scores = sortBySurface(node.asset_scores ?? [])
  const host = isHostAsset(node)
  const validated = actions.validatedById[node.resource_id]
  const isScanning = actions.isScanningResource(node.resource_id)
  const findings = node.finding_count ?? 0
  const alerts = codeAlertCount(node)
  const alertRepoId = codeAlertRepoIds(node)[0]

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
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.85,
        borderTop: 1,
        borderTopColor: 'divider',
        cursor: 'pointer',
        bgcolor: selected ? 'action.selected' : 'transparent',
        borderLeft: '2px solid',
        borderLeftColor: selected ? FLYTO_PURPLE : 'transparent',
        outline: 'none',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
        '&:focus-visible': { boxShadow: `inset 0 0 0 2px ${FLYTO_PURPLE_FOCUS}` },
      }}
    >
      <StatusDot color={surfaceColor(node.surface)} size={8} sx={{ flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} noWrap title={displayName(node)}>{displayName(node)}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {node.type} · {relationshipCount} {t('assetMap.relationshipAbbr')}
          {scores[0] ? ` · ${scoreLabel(scores[0])}` : ''}
          {validated === 'verified' ? ` · ${t('assetMap.verified')}` : ''}
        </Typography>
      </Box>
      {/* Findings badge — the one thing that should pop. */}
      {findings > 0 && <SeverityChip severity="high" label={String(findings)} size="small" sx={{ flexShrink: 0 }} />}
      {/* Code-alert deep link (code↔asset join). */}
      {alerts > 0 && (
        <Chip
          label={alerts}
          size="small"
          icon={<CodeIcon size={11} />}
          variant="outlined"
          color="warning"
          onClick={alertRepoId ? (e) => { e.stopPropagation(); actions.onOpenRepoAlerts(alertRepoId) } : undefined}
          title={t('assetMap.openRepoAlerts')}
          sx={{ height: 20, fontSize: 12, fontWeight: 700, borderRadius: 1, flexShrink: 0, cursor: alertRepoId ? 'pointer' : 'default' }}
        />
      )}
      {host && (
        <IconButton
          size="small"
          disabled={isScanning}
          onClick={(e) => { e.stopPropagation(); actions.onScan(node) }}
          aria-label={t('assetMap.scanThis')}
          title={t('assetMap.scanThis')}
          sx={{ flexShrink: 0, opacity: 0.55, '&:hover': { opacity: 1, color: 'primary.main' } }}
        >
          {isScanning ? <CircularProgress size={13} /> : <Radar size={14} />}
        </IconButton>
      )}
    </Box>
  )
}

const tinyChipSx = {
  height: 19,
  fontSize: 12,
  borderRadius: 1,
}

function formatConfidence(value: number) {
  return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`
}

function InlineDatum({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.35, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 12 }}>{label}</Typography>
      <Typography variant="caption" fontWeight={800} color={warn ? 'warning.dark' : 'text.primary'} noWrap>{value}</Typography>
    </Box>
  )
}

function SurfacePill({ surface, count, active, onClick }: {
  surface: string
  count: number
  active: boolean
  onClick: () => void
}) {
  const meta = surfaceMeta(surface)
  const isAll = surface === 'all'
  const Icon = isAll ? Network : meta.Icon
  const color = isAll ? FLYTO_PURPLE : meta.color
  const label = isAll ? t('common.all') : t(meta.labelKey)
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75,
        px: 0.85, py: 0.4, borderRadius: 1.5, cursor: 'pointer',
        border: '1px solid',
        borderColor: active ? alpha(color, 0.6) : 'divider',
        bgcolor: active ? alpha(color, 0.12) : 'transparent',
        boxShadow: active ? `0 0 12px ${alpha(color, 0.3)}` : 'none',
        transition: 'border-color .15s, background-color .15s, box-shadow .15s',
        '&:hover': { borderColor: alpha(color, 0.5), bgcolor: alpha(color, active ? 0.16 : 0.06) },
      }}
    >
      {/* surface-tinted glyph chip */}
      <Box sx={{ width: 18, height: 18, borderRadius: 0.75, display: 'grid', placeItems: 'center', bgcolor: alpha(color, active ? 0.22 : 0.14), color, flexShrink: 0 }}>
        <Icon size={11} />
      </Box>
      <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: active ? 'text.primary' : 'text.secondary' }}>
        {label}
      </Box>
      {/* count badge */}
      <Box component="span" sx={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, px: 0.55, py: 0.05, borderRadius: 0.75, bgcolor: alpha(color, 0.18), color }}>
        {count}
      </Box>
    </Box>
  )
}

function SurfaceChip({ surface }: { surface?: string }) {
  const meta = surfaceMeta(surface)
  return (
    <Chip
      label={t(meta.labelKey)}
      size="small"
      sx={{ height: 20, fontSize: 12, bgcolor: alpha(meta.color, 0.16), color: meta.color, fontWeight: 700 }}
    />
  )
}

// Cross-surface code↔asset join: a clickable chip that deep-links into
// the contributing repo's alerts. Hidden when the node carries zero code
// alerts (no fabricated counts). When several repos contribute, the chip
// opens the first and notes the remainder in its tooltip.
function CodeAlertsBadge({ node, onOpenRepoAlerts }: {
  node: KernelAssetMapNode
  onOpenRepoAlerts: (repoId: string) => void
}) {
  const count = codeAlertCount(node)
  const repoIds = codeAlertRepoIds(node)
  if (count <= 0) return null
  const primaryRepo = repoIds[0]
  const extraRepos = repoIds.length > 1 ? repoIds.length - 1 : 0
  const label = count === 1
    ? t('assetMap.codeAlertOne')
    : `${count} ${t('assetMap.codeAlerts')}`
  const tip = primaryRepo
    ? (extraRepos > 0
        ? `${t('assetMap.openRepoAlerts')} (+${extraRepos} ${t('assetMap.more')})`
        : t('assetMap.openRepoAlerts'))
    : t('assetMap.codeAlertsNoRepo')
  const clickable = !!primaryRepo
  return (
    <Chip
      icon={<CodeIcon size={12} />}
      label={label}
      size="small"
      color="warning"
      variant="outlined"
      clickable={clickable}
      title={tip}
      onClick={clickable ? (e) => { e.stopPropagation(); onOpenRepoAlerts(primaryRepo) } : undefined}
      sx={{
        height: 20,
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 1,
        '.MuiChip-icon': { fontSize: 12, ml: 0.5 },
        ...(clickable && { cursor: 'pointer' }),
      }}
    />
  )
}

function ScoreChip({ score }: { score: KernelAssetScore }) {
  const meta = surfaceMeta(score.surface)
  return (
    <Chip
      title={scoreLabel(score)}
      label={`${meta.label} ${score.display_score ?? score.score}${score.grade ? ` ${score.grade}` : ''}`}
      size="small"
      sx={{ height: 22, fontSize: 12, bgcolor: alpha(meta.color, 0.16), color: meta.color, fontWeight: 700 }}
    />
  )
}

export function EdgeRow({ edge, source, target }: {
  edge: KernelAssetMapEdge
  source?: KernelAssetMapNode
  target?: KernelAssetMapNode
}) {
  // A "lead" edge is a low-confidence candidate (discovery lead) — render it
  // faded with a dashed left border so it never reads as a confirmed edge.
  const isLead = edge.edge_class === 'lead'
  return (
    <Box sx={{
      px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' },
      ...(isLead && { opacity: 0.6, borderLeft: '2px dashed', borderLeftColor: 'warning.main' }),
    }}>
      <Box className="flex items-center gap-1" sx={{ mb: 0.5 }}>
        <Chip label={edge.relation_type} size="small" sx={{ height: 20, fontSize: 12, fontWeight: 700 }} />
        {isLead && (
          <Chip label={t('assetMap.lead')} size="small" color="warning" variant="outlined"
            sx={{ height: 20, fontSize: 12, borderStyle: 'dashed' }} />
        )}
        {edge.confidence_label && <Chip label={edge.confidence_label} size="small" variant="outlined" sx={{ height: 20, fontSize: 12 }} />}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{edge.confidence}%</Typography>
      </Box>
      <Typography variant="caption" fontWeight={700} noWrap sx={{ display: 'block' }}>
        {source ? displayName(source) : edge.source_resource_id}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>to</Typography>
      <Typography variant="caption" fontWeight={700} noWrap sx={{ display: 'block' }}>
        {target ? displayName(target) : edge.target_resource_id}
      </Typography>
      {edge.evidence_count > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {edge.evidence_count} {t('assetMap.evidence')}
        </Typography>
      )}
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
    ? t('assetMap.emptyFilteredTitle')
    : t('assetMap.emptyTitle')
  const description = hasAnyAssets
    ? t('assetMap.emptyFilteredDescription')
    : t('assetMap.emptyDescription')
  const steps = hasAnyAssets
    ? [
        t('assetMap.emptyFilteredStepOne'),
        t('assetMap.emptyFilteredStepTwo'),
        t('assetMap.emptyFilteredStepThree'),
      ]
    : [
        t('assetMap.emptyStepOne'),
        t('assetMap.emptyStepTwo'),
        t('assetMap.emptyStepThree'),
      ]

  return (
    <Box sx={{ py: { xs: 5, md: 8 } }}>
      <Box sx={{ maxWidth: 880, mx: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'auto minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 1, bgcolor: FLYTO_PURPLE_SOFT, color: FLYTO_PURPLE, display: 'grid', placeItems: 'center' }}>
            <Network size={22} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 0.75 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>
              {description}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 2 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={isFetching ? <CircularProgress size={12} color="inherit" /> : <RefreshCw size={14} />}
                onClick={onRefresh}
                disabled={isFetching}
                sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 1 }}
              >
                {t('common.refresh')}
              </Button>
              {!showLeads && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onShowLeads}
                  sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 1 }}
                >
                  {t('assetMap.showLeads')}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, borderTop: 1, borderColor: FLYTO_PURPLE_LINE, bgcolor: 'background.default' }}>
          {steps.map((step, index) => (
            <Box key={step} sx={{ px: 2, py: 1.5, borderLeft: { md: index === 0 ? 0 : 1 }, borderTop: { xs: index === 0 ? 0 : 1, md: 0 }, borderColor: FLYTO_PURPLE_LINE }}>
              <Typography variant="caption" color="text.secondary" fontWeight={800}>
                {String(index + 1).padStart(2, '0')}
              </Typography>
              <Typography variant="body2" fontWeight={700} sx={{ mt: 0.25 }}>
                {step}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
