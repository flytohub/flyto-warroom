/**
 * AssetMapManagerView - manager-mode asset relationship workbench.
 *
 * The backend-owned /asset-map/kernel read model remains the source of truth:
 * this view only lays out returned nodes, edges, score badges, and lifecycle
 * fields so managers can see exposure hubs, candidate links, and review gaps.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleDot,
  GitBranch,
  Layers3,
  Network,
  RefreshCw,
  Route,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'

import { DataBoundary } from '@atoms/DataBoundary'
import { qk } from '@lib/queryKeys'
import { tOr } from '@lib/i18n'
import { surfaceDef, SURFACE_LIST } from '@lib/surfaces'
import { colors } from '@/styles/designTokens'
import {
  getKernelAssetMap,
  updateKernelAssetAttributes,
  type KernelAssetAttributesPatch,
  type KernelAssetMapEdge,
  type KernelAssetMapNode,
} from '@lib/engine/ctem/asset-map'

type Pane = 'map' | 'governance' | 'relations' | 'gaps'
type AssetTier = '' | 'crown_jewel' | 'customer_facing' | 'internal' | 'sandbox'
type GovernanceDecision = 'Pending' | 'Keep' | 'Remove'

interface GovernanceDraft {
  asset_tier?: AssetTier
  validation_status?: 'verified' | 'false_positive'
}

interface RelationCard {
  edge: KernelAssetMapEdge
  source: KernelAssetMapNode
  target: KernelAssetMapNode
}

interface GapGroup {
  id: string
  label: string
  count: number
  tone: string
  assets: KernelAssetMapNode[]
}

interface FocusRelation {
  card: RelationCard
  other: KernelAssetMapNode
  direction: 'inbound' | 'outbound'
  tone: string
  weight: number
}

interface FocusLayout {
  focusNode?: KernelAssetMapNode
  left: FocusRelation[]
  right: FocusRelation[]
  all: FocusRelation[]
  crossSurfaceCount: number
  leadCount: number
}

interface GraphPoint {
  node: KernelAssetMapNode
  x: number
  y: number
  tone: string
}

interface SurfaceHeader {
  surface: string
  x: number
  count: number
  tone: string
  label?: string
}

const ACCENT = colors.brand
const TECH = colors.tech
const GRAPH_HEIGHT = 356
const ASSET_TIER_OPTIONS: Array<{ value: AssetTier; label: string; disabled?: boolean }> = [
  { value: '', label: '未歸類', disabled: true },
  { value: 'crown_jewel', label: 'Crown jewel' },
  { value: 'customer_facing', label: 'Customer-facing' },
  { value: 'internal', label: 'Internal' },
  { value: 'sandbox', label: 'Sandbox' },
]
const DECISION_OPTIONS: Array<{ value: GovernanceDecision; label: string; disabled?: boolean }> = [
  { value: 'Pending', label: 'Pending', disabled: true },
  { value: 'Keep', label: 'Keep' },
  { value: 'Remove', label: 'Remove' },
]

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${Math.round(value)}%`
}

function formatDate(value?: string | null): string {
  if (!value) return '--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '--'
  return date.toLocaleDateString()
}

function nodeName(node: KernelAssetMapNode): string {
  return node.display_name || node.canonical_value || node.resource_id
}

function nodeMeta(node: KernelAssetMapNode): string {
  return [surfaceLabel(node.surface), node.type, node.current_tier].filter(Boolean).join(' / ')
}

function surfaceLabel(surface?: string | null): string {
  const def = surfaceDef(surface)
  return tOr(def.labelKey, def.label)
}

function relationLabel(type: string): string {
  return type.replace(/[._]/g, ' ')
}

function assetSignals(node: KernelAssetMapNode): number {
  return (node.finding_count ?? 0) + (node.code_alert_count ?? 0)
}

function hasScores(node: KernelAssetMapNode): boolean {
  return (node.asset_scores?.length ?? 0) > 0 || !!node.asset_grade
}

function relationshipCount(node: KernelAssetMapNode, counts: Record<string, number>): number {
  return counts[node.resource_id] ?? 0
}

function assetRank(node: KernelAssetMapNode, counts: Record<string, number>): number {
  const candidate = node.current_tier === 'candidate' || node.review_status === 'unreviewed' ? 8 : 0
  return assetSignals(node) * 40 + relationshipCount(node, counts) * 12 + candidate + (hasScores(node) ? 3 : 0) + node.confidence / 100
}

function sortAssetsBySignal(nodes: KernelAssetMapNode[], counts: Record<string, number>): KernelAssetMapNode[] {
  return [...nodes].sort((a, b) => {
    const rank = assetRank(b, counts) - assetRank(a, counts)
    if (rank !== 0) return rank
    return nodeName(a).localeCompare(nodeName(b))
  })
}

function sortAssetsByHubValue(nodes: KernelAssetMapNode[], counts: Record<string, number>): KernelAssetMapNode[] {
  return [...nodes].sort((a, b) => {
    const rank =
      relationshipCount(b, counts) * 120 + assetSignals(b) * 2 + b.confidence / 100 -
      (relationshipCount(a, counts) * 120 + assetSignals(a) * 2 + a.confidence / 100)
    if (rank !== 0) return rank
    return nodeName(a).localeCompare(nodeName(b))
  })
}

function sortEntries(source: Record<string, number> | undefined): Array<[string, number]> {
  return Object.entries(source ?? {})
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
}

function governanceDecision(node: KernelAssetMapNode, draft?: GovernanceDraft): GovernanceDecision {
  const status = draft?.validation_status ?? node.validation_status
  if (status === 'verified') return 'Keep'
  if (status === 'false_positive') return 'Remove'
  return 'Pending'
}

function decisionTone(value: GovernanceDecision): string {
  if (value === 'Keep') return colors.semantic.success
  if (value === 'Remove') return colors.semantic.danger
  return colors.semantic.warning
}

function nodeSourceLabel(node: KernelAssetMapNode): string {
  const sources = node.legacy_sources?.length ? node.legacy_sources : node.dimensions
  if (!sources?.length) return '--'
  const visible = sources.slice(0, 2).join(', ')
  return sources.length > 2 ? `${visible} +${sources.length - 2}` : visible
}

export function AssetMapManagerView() {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const { orgId } = useParams<{ orgId: string }>()
  const [pane, setPane] = useState<Pane>('map')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [governanceDrafts, setGovernanceDrafts] = useState<Record<string, GovernanceDraft>>({})

  const q = useQuery({
    queryKey: qk.assetMapKernelMode(orgId, 'leads'),
    queryFn: () => getKernelAssetMap(orgId!, { showDiscoveryLeads: true }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const attributeMutation = useMutation({
    mutationFn: ({ resourceId, patch }: { resourceId: string; patch: KernelAssetAttributesPatch }) =>
      updateKernelAssetAttributes(orgId!, resourceId, patch),
    onMutate: ({ resourceId, patch }) => {
      setGovernanceDrafts((current) => ({
        ...current,
        [resourceId]: {
          ...current[resourceId],
          ...('asset_tier' in patch ? { asset_tier: patch.asset_tier as AssetTier } : {}),
          ...('validation_status' in patch ? { validation_status: patch.validation_status } : {}),
        },
      }))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assetMapKernelMode(orgId, 'leads') })
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assetMapKernelMode(orgId, 'leads') })
    },
  })

  const handleAttributeUpdate = (resourceId: string, patch: KernelAssetAttributesPatch) => {
    if (!orgId) return
    attributeMutation.mutate({ resourceId, patch })
  }

  const data = q.data
  const nodes = useMemo(() => data?.nodes ?? [], [data?.nodes])
  const edges = useMemo(() => data?.edges ?? [], [data?.edges])

  const nodeById = useMemo(() => {
    const map = new Map<string, KernelAssetMapNode>()
    for (const node of nodes) map.set(node.resource_id, node)
    return map
  }, [nodes])

  const relationCards = useMemo<RelationCard[]>(() => {
    const cards: RelationCard[] = []
    for (const edge of edges) {
      const source = nodeById.get(edge.source_resource_id)
      const target = nodeById.get(edge.target_resource_id)
      if (source && target) cards.push({ edge, source, target })
    }
    return cards.sort((a, b) => {
      const aLead = a.edge.edge_class === 'lead' ? 1 : 0
      const bLead = b.edge.edge_class === 'lead' ? 1 : 0
      if (aLead !== bLead) return bLead - aLead
      return (b.edge.evidence_count ?? 0) - (a.edge.evidence_count ?? 0)
    })
  }, [edges, nodeById])

  const relationshipCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const edge of edges) {
      counts[edge.source_resource_id] = (counts[edge.source_resource_id] ?? 0) + 1
      counts[edge.target_resource_id] = (counts[edge.target_resource_id] ?? 0) + 1
    }
    return counts
  }, [edges])

  const sortedAssets = useMemo(() => sortAssetsBySignal(nodes, relationshipCounts), [nodes, relationshipCounts])
  const sortedHubAssets = useMemo(() => sortAssetsByHubValue(nodes, relationshipCounts), [nodes, relationshipCounts])
  const selectedNode = selectedId ? nodeById.get(selectedId) : undefined
  const focusNode = selectedNode ?? sortedHubAssets[0] ?? sortedAssets[0]

  const connectedRelations = useMemo(() => {
    if (!focusNode) return []
    return relationCards.filter(({ edge }) =>
      edge.source_resource_id === focusNode.resource_id ||
      edge.target_resource_id === focusNode.resource_id)
  }, [focusNode, relationCards])

  const candidateAssets = useMemo(() => nodes.filter((node) => node.current_tier === 'candidate' || node.review_status === 'unreviewed'), [nodes])
  const unscoredAssets = useMemo(() => nodes.filter((node) => !hasScores(node)), [nodes])
  const isolatedAssets = useMemo(() => nodes.filter((node) => relationshipCount(node, relationshipCounts) === 0), [nodes, relationshipCounts])
  const lowConfidenceAssets = useMemo(() => nodes.filter((node) => node.confidence > 0 && node.confidence < 70), [nodes])
  const gapGroups = useMemo<GapGroup[]>(() => [
    {
      id: 'candidate',
      label: tOr('assetMap.lead', 'Lead'),
      count: candidateAssets.length,
      tone: colors.semantic.warning,
      assets: sortAssetsBySignal(candidateAssets, relationshipCounts),
    },
    {
      id: 'unscored',
      label: tOr('assetMap.unscored', 'Unscored'),
      count: unscoredAssets.length,
      tone: ACCENT,
      assets: sortAssetsBySignal(unscoredAssets, relationshipCounts),
    },
    {
      id: 'isolated',
      label: tOr('assetMap.noRelationships', 'No relationships'),
      count: isolatedAssets.length,
      tone: colors.semantic.neutral,
      assets: sortAssetsBySignal(isolatedAssets, relationshipCounts),
    },
    {
      id: 'confidence',
      label: tOr('assetMap.confidence', 'Confidence'),
      count: lowConfidenceAssets.length,
      tone: TECH,
      assets: sortAssetsBySignal(lowConfidenceAssets, relationshipCounts),
    },
  ], [candidateAssets, isolatedAssets, lowConfidenceAssets, relationshipCounts, unscoredAssets])
  const gapAssetCount = useMemo(() => {
    const ids = new Set<string>()
    for (const group of gapGroups) {
      for (const asset of group.assets) ids.add(asset.resource_id)
    }
    return ids.size
  }, [gapGroups])

  const surfaceEntries = useMemo(() => sortEntries(data?.summary?.by_surface), [data?.summary?.by_surface])
  const typeEntries = useMemo(() => sortEntries(data?.summary?.by_type).slice(0, 6), [data?.summary?.by_type])
  const totalAssets = data?.node_count ?? nodes.length
  const totalEdges = data?.edge_count ?? edges.length

  if (!orgId || q.isError) {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3 }}>
        <DataBoundary
          isLoading={q.isLoading}
          isError={q.isError}
          error={q.error}
          onRetry={() => { void q.refetch() }}
          hasData={false}
          empty={!orgId}
          label="asset map"
          loadingVariant="spinner"
        >
          <span />
        </DataBoundary>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.1,
        p: { xs: 1.1, md: 1.5 },
        width: '100%',
        maxWidth: 1500,
        mx: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          flex: '0 0 auto',
          minHeight: 64,
          px: 1.35,
          py: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: alpha(ACCENT, 0.3),
          borderLeft: `3px solid ${ACCENT}`,
          bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.7 : 0.96),
          backgroundImage: `linear-gradient(90deg, ${alpha(ACCENT, 0.09)}, transparent 62%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <IconBadge tone={ACCENT}><Network size={19} /></IconBadge>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 950, lineHeight: 1.05 }} noWrap>
              {tOr('assetMap.managerView.title', 'Asset Map')}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {formatNumber(totalAssets)} {tOr('assetMap.managerView.kpi.resources', 'Resources')} / {formatNumber(totalEdges)} {tOr('assetMap.managerView.kpi.relationships', 'Relationships')}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {data?.truncated && <StatusPill label={tOr('assetMap.truncated', 'Truncated')} tone={colors.semantic.warning} />}
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 750 }}>
            {formatDate(data?.generated_at)}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => { void q.refetch() }}
            disabled={q.isFetching}
            startIcon={q.isFetching ? <CircularProgress size={13} /> : <RefreshCw size={14} />}
            sx={{ height: 34, borderRadius: 1, fontWeight: 850, textTransform: 'none' }}
          >
            {tOr('common.refresh', 'Refresh')}
          </Button>
        </Box>
      </Paper>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.45fr) minmax(330px, 0.55fr)' },
          gap: 1.1,
          overflow: { xs: 'auto', md: 'hidden' },
          pb: 0.2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <PaneTabs value={pane} onChange={setPane} relationCount={relationCards.length} governanceCount={totalAssets} gapCount={gapAssetCount} />
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.1, bgcolor: alpha(ACCENT, theme.palette.mode === 'dark' ? 0.035 : 0.025) }}>
            {pane === 'map' && (
              <RelationshipMap
                nodes={nodes}
                relationCards={relationCards}
                relationshipCounts={relationshipCounts}
                selectedId={focusNode?.resource_id ?? null}
                onSelect={setSelectedId}
                loading={q.isLoading}
              />
            )}
            {pane === 'relations' && (
              <RelationList
                relations={relationCards}
                selectedId={selectedNode?.resource_id ?? null}
                onSelect={setSelectedId}
                loading={q.isLoading}
              />
            )}
            {pane === 'governance' && (
              <GovernanceTable
                assets={sortedAssets}
                relationshipCounts={relationshipCounts}
                selectedId={selectedNode?.resource_id ?? null}
                drafts={governanceDrafts}
                pendingResourceId={attributeMutation.isPending ? attributeMutation.variables?.resourceId : undefined}
                onSelect={setSelectedId}
                onUpdate={handleAttributeUpdate}
                loading={q.isLoading}
              />
            )}
            {pane === 'gaps' && (
              <GapPanel groups={gapGroups} onSelect={setSelectedId} loading={q.isLoading} />
            )}
          </Box>
        </Paper>

        <Box sx={{ minWidth: 0, minHeight: { xs: 430, md: 0 }, overflow: { xs: 'visible', md: 'hidden' }, display: 'flex', flexDirection: 'column', gap: 1.1 }}>
          <FocusPanel
            node={focusNode}
            relationCards={connectedRelations}
            relationshipCounts={relationshipCounts}
            typeEntries={typeEntries}
            onSelect={setSelectedId}
            loading={q.isLoading}
          />
          <SurfacePanel entries={surfaceEntries} total={totalAssets} />
        </Box>
      </Box>
    </Box>
  )
}

function PaneTabs({
  value,
  onChange,
  relationCount,
  governanceCount,
  gapCount,
}: {
  value: Pane
  onChange: (pane: Pane) => void
  relationCount: number
  governanceCount: number
  gapCount: number
}) {
  const items: Array<{ value: Pane; label: string; icon: ReactNode; count: number }> = [
    { value: 'map', label: tOr('assetMap.title', 'Asset Map'), icon: <Network size={15} />, count: relationCount },
    { value: 'governance', label: '治理表', icon: <SlidersHorizontal size={15} />, count: governanceCount },
    { value: 'relations', label: tOr('assetMap.relationshipPanel', 'Relationships'), icon: <Route size={15} />, count: relationCount },
    { value: 'gaps', label: tOr('assetMap.managerView.exceptions.title', 'Asset exceptions'), icon: <AlertTriangle size={15} />, count: gapCount },
  ]

  return (
    <Box sx={{ flex: '0 0 auto', minHeight: 50, p: 0.8, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.7, flexWrap: 'wrap', overflow: 'hidden' }}>
      {items.map((item) => {
        const selected = value === item.value
        return (
          <ButtonBase
            key={item.value}
            onClick={() => onChange(item.value)}
            sx={{
              height: 36,
              px: 1,
              borderRadius: 1,
              border: '1px solid',
              borderColor: selected ? alpha(ACCENT, 0.5) : 'divider',
              bgcolor: selected ? alpha(ACCENT, 0.13) : 'background.default',
              color: selected ? ACCENT : 'text.secondary',
              display: 'flex',
              alignItems: 'center',
              gap: 0.7,
              flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' },
              minWidth: 0,
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            {item.icon}
            <Box component="span" sx={{ color: selected ? ACCENT : 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</Box>
            <Chip size="small" label={formatNumber(item.count)} sx={{ height: 20, borderRadius: 0.8, fontSize: 11, fontWeight: 900, bgcolor: selected ? alpha(ACCENT, 0.16) : 'action.hover' }} />
          </ButtonBase>
        )
      })}
    </Box>
  )
}

function RelationshipMap({
  nodes,
  relationCards,
  relationshipCounts,
  selectedId,
  onSelect,
  loading,
}: {
  nodes: KernelAssetMapNode[]
  relationCards: RelationCard[]
  relationshipCounts: Record<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
}) {
  const theme = useTheme()
  const layout = useMemo(() => buildGraphLayout(nodes, relationCards, relationshipCounts, selectedId), [nodes, relationCards, relationshipCounts, selectedId])
  const focusLayout = useMemo(() => buildFocusLayout(nodes, relationCards, relationshipCounts, selectedId), [nodes, relationCards, relationshipCounts, selectedId])

  if (loading) return <LoadingBlock />
  if (!nodes.length) return <EmptyLine text={tOr('assetMap.emptyTitle', 'No assets yet')} />

  return (
    <Box sx={{ height: '100%', minHeight: GRAPH_HEIGHT, display: 'grid', gridTemplateRows: 'minmax(300px, 1fr) auto', gap: 1 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(190px, 0.8fr) minmax(0, 1fr)' },
          alignItems: 'stretch',
          gap: 1,
          px: 1,
          pt: 1.35,
          pb: 1,
          minHeight: 300,
          borderRadius: 1,
          border: '1px solid',
          borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.1),
          bgcolor: theme.palette.mode === 'dark' ? alpha('#020617', 0.3) : '#ffffff',
          overflow: 'hidden',
        }}
      >
        <RelationColumn title="來源側" subtitle="外部曝險 / 雲端 / runtime" relations={focusLayout.left} side="left" onSelect={onSelect} />
        <FocusHubCard node={focusLayout.focusNode} relationshipCounts={relationshipCounts} relationCount={focusLayout.all.length} />
        <RelationColumn title="服務側" subtitle="程式碼 / 容器 / 實作" relations={focusLayout.right} side="right" onSelect={onSelect} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 0.8 }}>
        <MiniReadout label="跨表面關聯" value={formatNumber(focusLayout.crossSurfaceCount)} tone={TECH} />
        <MiniReadout label={tOr('assetMap.lead', 'Lead')} value={formatNumber(focusLayout.leadCount)} tone={colors.semantic.warning} />
        <MiniReadout label={tOr('assetMap.findings', 'Findings')} value={formatNumber(nodes.filter((node) => assetSignals(node) > 0).length)} tone={colors.semantic.danger} />
      </Box>
    </Box>
  )

  return (
    <Box sx={{ height: '100%', minHeight: GRAPH_HEIGHT, display: 'grid', gridTemplateRows: 'minmax(300px, 1fr) auto', gap: 1 }}>
      <Box
        sx={{
          position: 'relative',
          minHeight: 300,
          borderRadius: 1,
          border: '1px solid',
          borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.1),
          bgcolor: theme.palette.mode === 'dark' ? alpha('#020617', 0.3) : '#ffffff',
          overflow: 'hidden',
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <linearGradient id="asset-map-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.6" />
              <stop offset="100%" stopColor={TECH} stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {layout.lines.map(({ edge, source, target }) => {
            const selected = selectedId === source.node.resource_id || selectedId === target.node.resource_id
            const sourceX = source.x + (source.x < target.x ? 9 : -9)
            const targetX = target.x + (source.x < target.x ? -9 : 9)
            const midX = (sourceX + targetX) / 2
            return (
              <path
                key={edge.id}
                d={`M ${sourceX} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${targetX} ${target.y}`}
                fill="none"
                stroke={selected ? 'url(#asset-map-line)' : alpha(theme.palette.text.primary, 0.26)}
                strokeWidth={selected ? 1.65 : 0.9}
                strokeDasharray={edge.edge_class === 'lead' ? '1.4 1.1' : undefined}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>

        {layout.surfaceHeaders.map((header) => (
          <Box
            key={`${header.label ?? header.surface}-${header.x}`}
            sx={{
              position: 'absolute',
              left: `${header.x}%`,
              top: 14,
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 0.55,
              color: header.tone,
              maxWidth: 140,
            }}
          >
            <CircleDot size={12} />
            <Typography variant="caption" sx={{ fontWeight: 950 }} noWrap>
              {header.label ?? surfaceLabel(header.surface)} {header.count}
            </Typography>
          </Box>
        ))}

        {layout.points.map((point) => {
          const selected = selectedId === point.node.resource_id
          const signals = assetSignals(point.node)
          return (
            <ButtonBase
              key={point.node.resource_id}
              onClick={() => onSelect(point.node.resource_id)}
              sx={{
                position: 'absolute',
                left: `${point.x}%`,
                top: `${point.y}%`,
                transform: 'translate(-50%, -50%)',
                width: { xs: 104, sm: 118 },
                height: 42,
                px: 0.75,
                borderRadius: 1,
                border: '1px solid',
                borderColor: selected ? point.tone : alpha(point.tone, 0.28),
                bgcolor: selected ? alpha(point.tone, 0.18) : alpha(point.tone, 0.08),
                boxShadow: selected ? `0 0 0 3px ${alpha(point.tone, 0.12)}` : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 0.65,
                textAlign: 'left',
                overflow: 'hidden',
              }}
            >
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: point.tone, flex: '0 0 auto', boxShadow: `0 0 0 4px ${alpha(point.tone, 0.13)}` }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 950, lineHeight: 1.15 }} noWrap title={nodeName(point.node)}>
                  {nodeName(point.node)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, lineHeight: 1.15 }} noWrap>
                  {formatNumber(relationshipCount(point.node, relationshipCounts))} {tOr('assetMap.relationshipAbbr', 'rel')}{signals > 0 ? ` / ${formatNumber(signals)} ${tOr('assetMap.findings', 'findings')}` : ''}
                </Typography>
              </Box>
            </ButtonBase>
          )
        })}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 0.8 }}>
        <MiniReadout label="跨表面關聯" value={formatNumber(layout.crossSurfaceCount)} tone={TECH} />
        <MiniReadout label={tOr('assetMap.lead', 'Lead')} value={formatNumber(relationCards.filter((card) => card.edge.edge_class === 'lead').length)} tone={colors.semantic.warning} />
        <MiniReadout label={tOr('assetMap.findings', 'Findings')} value={formatNumber(nodes.filter((node) => assetSignals(node) > 0).length)} tone={colors.semantic.danger} />
      </Box>
    </Box>
  )
}

function buildGraphLayout(
  nodes: KernelAssetMapNode[],
  relationCards: RelationCard[],
  relationshipCounts: Record<string, number>,
  selectedId: string | null,
) {
  const relationWeight = (card: RelationCard) => (card.edge.evidence_count ?? 0) * 10 + card.edge.confidence
  const surfaces = SURFACE_LIST
    .map((surface) => surface.id)
    .filter((surface) => nodes.some((node) => (node.surface || 'unknown') === surface))
  if (!surfaces.includes('unknown') && nodes.some((node) => !SURFACE_LIST.some((surface) => surface.id === node.surface))) {
    surfaces.push('unknown')
  }
  const activeSurfaces = surfaces.length ? surfaces : ['unknown']
  const maxRows = activeSurfaces.length > 3 ? 4 : 5
  const columnSpan = activeSurfaces.length <= 2 ? 46 : activeSurfaces.length === 3 ? 56 : 72
  const columnStart = (100 - columnSpan) / 2
  const columnStep = activeSurfaces.length === 1 ? 0 : columnSpan / (activeSurfaces.length - 1)
  const points: GraphPoint[] = []
  const pointById = new Map<string, GraphPoint>()
  const focusLinkWeight = new Map<string, number>()
  const focusNode = selectedId ? nodes.find((node) => node.resource_id === selectedId) : undefined

  if (selectedId && focusNode) {
    for (const card of relationCards) {
      const { edge } = card
      if (edge.source_resource_id !== selectedId && edge.target_resource_id !== selectedId) continue
      const otherId = edge.source_resource_id === selectedId ? edge.target_resource_id : edge.source_resource_id
      focusLinkWeight.set(otherId, (focusLinkWeight.get(otherId) ?? 0) + relationWeight(card))
    }
  }

  if (selectedId && focusNode && focusLinkWeight.size > 0) {
    const focusSurface = focusNode.surface || 'unknown'
    const focusPoint = { node: focusNode, x: 18, y: 48, tone: surfaceDef(focusSurface).color }
    points.push(focusPoint)
    pointById.set(focusNode.resource_id, focusPoint)

    const directNodes = [...focusLinkWeight.entries()]
      .map(([resourceId, weight]) => ({ node: nodes.find((item) => item.resource_id === resourceId), weight }))
      .filter((entry): entry is { node: KernelAssetMapNode; weight: number } => !!entry.node)
      .sort((a, b) => b.weight - a.weight || assetRank(b.node, relationshipCounts) - assetRank(a.node, relationshipCounts))

    const groupMap = new Map<string, Array<{ node: KernelAssetMapNode; weight: number }>>()
    for (const entry of directNodes) {
      const surface = entry.node.surface || 'unknown'
      const group = groupMap.get(surface) ?? []
      group.push(entry)
      groupMap.set(surface, group)
    }

    const groups = [...groupMap.entries()]
      .map(([surface, entries]) => ({
        surface,
        entries,
        weight: entries.reduce((sum, entry) => sum + entry.weight, 0),
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)

    const columnXs = groups.length <= 1 ? [62] : groups.length === 2 ? [50, 76] : [42, 64, 86]
    groups.forEach((group, columnIndex) => {
      const x = columnXs[columnIndex] ?? 82
      const rows = group.entries.slice(0, 5)
      rows.forEach((entry, row) => {
        const y = rows.length === 1 ? 48 : 24 + row * (60 / Math.max(rows.length - 1, 1))
        const point = { node: entry.node, x, y, tone: surfaceDef(group.surface).color }
        points.push(point)
        pointById.set(entry.node.resource_id, point)
      })
    })

    const focusLines = relationCards
      .filter((card) => card.edge.source_resource_id === selectedId || card.edge.target_resource_id === selectedId)
      .sort((a, b) => relationWeight(b) - relationWeight(a))
      .map((card) => ({
        edge: card.edge,
        source: pointById.get(card.edge.source_resource_id),
        target: pointById.get(card.edge.target_resource_id),
      }))
      .filter((line): line is { edge: KernelAssetMapEdge; source: GraphPoint; target: GraphPoint } => !!line.source && !!line.target)
      .slice(0, 16)

    const crossSurfaceCount = relationCards.filter((card) => card.source.surface !== card.target.surface).length
    const surfaceHeaders: SurfaceHeader[] = [
      {
        surface: focusSurface,
        x: focusPoint.x,
        count: relationshipCount(focusNode, relationshipCounts),
        tone: focusPoint.tone,
        label: tOr('assetMap.focus', '焦點'),
      },
      ...groups.map((group, index) => ({
        surface: group.surface,
        x: columnXs[index] ?? 82,
        count: group.entries.length,
        tone: surfaceDef(group.surface).color,
      })),
    ]

    return { points, lines: focusLines, surfaceHeaders, crossSurfaceCount }
  }

  activeSurfaces.forEach((surface, index) => {
    const x = activeSurfaces.length === 1 ? 50 : columnStart + columnStep * index
    const group = sortAssetsBySignal(nodes.filter((node) => (node.surface || 'unknown') === surface), relationshipCounts)
      .sort((a, b) => {
        if (!selectedId) return 0
        if (a.resource_id === selectedId) return -1
        if (b.resource_id === selectedId) return 1
        const linked = (focusLinkWeight.get(b.resource_id) ?? 0) - (focusLinkWeight.get(a.resource_id) ?? 0)
        return linked || assetRank(b, relationshipCounts) - assetRank(a, relationshipCounts)
      })
    let picked = group.slice(0, maxRows)
    const selected = selectedId ? group.find((node) => node.resource_id === selectedId) : undefined
    if (selected && !picked.some((node) => node.resource_id === selected.resource_id)) {
      picked = [...picked.slice(0, Math.max(0, maxRows - 1)), selected]
    }
    picked.forEach((node, row) => {
      const y = 23 + row * (64 / Math.max(maxRows - 1, 1))
      const point = { node, x, y, tone: surfaceDef(surface).color }
      points.push(point)
      pointById.set(node.resource_id, point)
    })
  })

  const crossSurfaceLines = relationCards
    .map((card) => ({
      edge: card.edge,
      source: pointById.get(card.edge.source_resource_id),
      target: pointById.get(card.edge.target_resource_id),
    }))
    .filter((line): line is { edge: KernelAssetMapEdge; source: GraphPoint; target: GraphPoint } => !!line.source && !!line.target)
    .filter((line) => line.source.node.surface !== line.target.node.surface)

  const sortedLines = [...crossSurfaceLines]
    .sort((a, b) =>
      (b.edge.evidence_count ?? 0) - (a.edge.evidence_count ?? 0) ||
      b.edge.confidence - a.edge.confidence)
  const selectedLines = selectedId
    ? sortedLines.filter((line) => line.edge.source_resource_id === selectedId || line.edge.target_resource_id === selectedId)
    : []
  const lines = (selectedLines.length ? selectedLines : sortedLines).slice(0, selectedLines.length ? 16 : 10)

  const surfaceHeaders: SurfaceHeader[] = activeSurfaces.map((surface, index) => ({
    surface,
    x: activeSurfaces.length === 1 ? 50 : columnStart + columnStep * index,
    count: nodes.filter((node) => (node.surface || 'unknown') === surface).length,
    tone: surfaceDef(surface).color,
  }))

  return { points, lines, surfaceHeaders, crossSurfaceCount: crossSurfaceLines.length }
}

function RelationColumn({
  title,
  subtitle,
  relations,
  side,
  onSelect,
}: {
  title: string
  subtitle: string
  relations: FocusRelation[]
  side: 'left' | 'right'
  onSelect: (id: string) => void
}) {
  const theme = useTheme()
  return (
    <Box sx={{ minWidth: 0, minHeight: 0, display: 'grid', gridTemplateRows: '42px minmax(0, 1fr)', gap: 0.65 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0, px: 0.25, position: 'relative', zIndex: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 950, color: 'text.primary', lineHeight: 1.15 }} noWrap>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, lineHeight: 1.2, mt: 0.25 }} noWrap>
            {subtitle}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={formatNumber(relations.length)}
          sx={{ height: 20, borderRadius: 0.8, fontSize: 11, fontWeight: 950, bgcolor: alpha(ACCENT, 0.1), color: ACCENT }}
        />
      </Box>

      <Box sx={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'grid', alignContent: 'start', gap: 0.65, pt: 0.25, pb: 0.45, pr: 0.2 }}>
        {relations.length ? relations.map((relation) => (
          <RelationRow key={relation.card.edge.id} relation={relation} side={side} onSelect={onSelect} />
        )) : (
          <Box sx={{ minHeight: 92, borderRadius: 1, border: '1px dashed', borderColor: alpha(theme.palette.text.primary, 0.16), display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
            <Typography variant="caption" sx={{ fontWeight: 850 }}>沒有直接關係</Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}

function RelationRow({
  relation,
  side,
  onSelect,
}: {
  relation: FocusRelation
  side: 'left' | 'right'
  onSelect: (id: string) => void
}) {
  const node = relation.other
  const tone = relation.tone
  const connector = (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      {side === 'right' && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tone, boxShadow: `0 0 0 4px ${alpha(tone, 0.12)}` }} />}
      <Box sx={{ height: 2, flex: 1, minWidth: 18, bgcolor: alpha(tone, 0.36), borderRadius: 99 }} />
      {side === 'left' && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tone, boxShadow: `0 0 0 4px ${alpha(tone, 0.12)}` }} />}
    </Box>
  )
  const card = (
    <ButtonBase
      onClick={() => onSelect(node.resource_id)}
      sx={{
        minWidth: 0,
        width: '100%',
        minHeight: 50,
        px: 0.85,
        py: 0.65,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(tone, 0.24),
        bgcolor: alpha(tone, 0.08),
        textAlign: 'left',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 0.7,
        alignItems: 'center',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 950, lineHeight: 1.15 }} noWrap title={nodeName(node)}>
          {nodeName(node)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, lineHeight: 1.2 }} noWrap>
          {relationLabel(relation.card.edge.relation_type)}
        </Typography>
      </Box>
      <Box sx={{ textAlign: 'right', minWidth: 42 }}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 950, color: tone, lineHeight: 1.1 }}>
          {formatPercent(relation.card.edge.confidence)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10.5, lineHeight: 1.1 }} noWrap>
          {formatNumber(relation.card.edge.evidence_count)} 證據
        </Typography>
      </Box>
    </ButtonBase>
  )

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: side === 'left' ? 'minmax(0, 1fr) 34px' : '34px minmax(0, 1fr)',
        gap: 0.45,
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      {side === 'left' ? <>{card}{connector}</> : <>{connector}{card}</>}
    </Box>
  )
}

function FocusHubCard({
  node,
  relationshipCounts,
  relationCount,
}: {
  node?: KernelAssetMapNode
  relationshipCounts: Record<string, number>
  relationCount: number
}) {
  if (!node) return <EmptyLine text={tOr('assetMap.emptyTitle', 'No assets yet')} compact />
  const tone = surfaceDef(node.surface).color
  return (
    <Box
      sx={{
        alignSelf: 'center',
        minWidth: 0,
        p: 1,
        borderRadius: 1.2,
        border: '1px solid',
        borderColor: alpha(tone, 0.34),
        bgcolor: alpha(tone, 0.11),
        boxShadow: `0 0 0 4px ${alpha(tone, 0.07)}`,
        display: 'grid',
        gap: 0.85,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <IconBadge tone={tone} small><Network size={15} /></IconBadge>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 950, lineHeight: 1.15 }} noWrap title={nodeName(node)}>
            {nodeName(node)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11 }} noWrap>
            {surfaceLabel(node.surface)} / {node.type || '--'}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.55 }}>
        <Fact label="關係" value={formatNumber(relationshipCount(node, relationshipCounts) || relationCount)} />
        <Fact label="信心" value={formatPercent(node.confidence)} />
        <Fact label="證據" value={formatNumber(node.evidence_count)} />
        <Fact label="評分資產" value={hasScores(node) ? '1' : '0'} />
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        <StatusPill label={node.current_tier || 'unranked'} tone={tone} />
        {assetSignals(node) > 0 && <StatusPill label={`${formatNumber(assetSignals(node))} 發現`} tone={colors.semantic.warning} />}
      </Box>
    </Box>
  )
}

function buildFocusLayout(
  nodes: KernelAssetMapNode[],
  relationCards: RelationCard[],
  relationshipCounts: Record<string, number>,
  selectedId: string | null,
): FocusLayout {
  const focusNode = selectedId
    ? nodes.find((node) => node.resource_id === selectedId)
    : sortAssetsByHubValue(nodes, relationshipCounts)[0]

  if (!focusNode) return { left: [], right: [], all: [], crossSurfaceCount: 0, leadCount: 0 }

  const direct = relationCards
    .filter(({ edge }) => edge.source_resource_id === focusNode.resource_id || edge.target_resource_id === focusNode.resource_id)
    .map<FocusRelation>((card) => {
      const outbound = card.edge.source_resource_id === focusNode.resource_id
      const other = outbound ? card.target : card.source
      return {
        card,
        other,
        direction: outbound ? 'outbound' : 'inbound',
        tone: surfaceDef(other.surface).color,
        weight: relationWeight(card),
      }
    })
    .sort((a, b) => b.weight - a.weight || assetRank(b.other, relationshipCounts) - assetRank(a.other, relationshipCounts))

  const left: FocusRelation[] = []
  const right: FocusRelation[] = []
  for (const relation of direct) {
    if (relationSide(focusNode, relation) === 'left') left.push(relation)
    else right.push(relation)
  }

  if (!left.length && right.length > 3) left.push(...right.splice(0, Math.ceil(right.length / 2)))
  if (!right.length && left.length > 3) right.push(...left.splice(Math.ceil(left.length / 2)))

  return {
    focusNode,
    left,
    right,
    all: direct,
    crossSurfaceCount: direct.filter((relation) => relation.other.surface !== focusNode.surface).length,
    leadCount: direct.filter((relation) => relation.card.edge.edge_class === 'lead').length,
  }
}

function relationWeight(card: RelationCard): number {
  return (card.edge.evidence_count ?? 0) * 10 + card.edge.confidence
}

function relationSide(focusNode: KernelAssetMapNode, relation: FocusRelation): 'left' | 'right' {
  const surface = relation.other.surface || 'unknown'
  if (surface === 'code' || surface === 'container') return 'right'
  if (surface === 'external' || surface === 'cloud' || surface === 'runtime') return 'left'
  if ((focusNode.surface || 'unknown') === 'external') return 'left'
  return relation.direction === 'inbound' ? 'left' : 'right'
}

function GovernanceTable({
  assets,
  relationshipCounts,
  selectedId,
  drafts,
  pendingResourceId,
  onSelect,
  onUpdate,
  loading,
}: {
  assets: KernelAssetMapNode[]
  relationshipCounts: Record<string, number>
  selectedId: string | null
  drafts: Record<string, GovernanceDraft>
  pendingResourceId?: string
  onSelect: (id: string) => void
  onUpdate: (resourceId: string, patch: KernelAssetAttributesPatch) => void
  loading?: boolean
}) {
  const theme = useTheme()
  if (loading) return <LoadingBlock />
  if (!assets.length) return <EmptyLine text={tOr('assetMap.emptyTitle', 'No assets yet')} />

  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      <Paper
        elevation={0}
        sx={{
          p: 0.95,
          borderRadius: 1,
          border: '1px solid',
          borderColor: alpha(ACCENT, 0.22),
          bgcolor: alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.055),
          display: 'flex',
          alignItems: 'center',
          gap: 0.8,
          flexWrap: 'wrap',
        }}
      >
        <IconBadge tone={ACCENT} small><SlidersHorizontal size={14} /></IconBadge>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 950 }} noWrap>
            資產歸類治理表
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            類似比對表的 Remark 流程，分類與 Keep/Remove 都寫回後端 kernel_resource_attributes。
          </Typography>
        </Box>
      </Paper>

      <Box sx={{ minWidth: 0, display: 'grid', gap: 0.55 }}>
        <Box
          sx={{
            position: 'sticky',
            top: -9,
            zIndex: 2,
            display: { xs: 'none', md: 'grid' },
            gridTemplateColumns: '42px minmax(170px, 1.45fr) 118px 118px 148px 124px 78px',
            gap: 0.75,
            alignItems: 'center',
            minHeight: 40,
            px: 1,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: theme.palette.background.paper,
            boxShadow: `0 8px 20px ${alpha(theme.palette.background.default, 0.72)}`,
          }}
        >
          {['#', 'Asset', 'Source', 'Status', 'Asset tier', 'Remark', 'Signals'].map((label) => (
            <Typography key={label} variant="caption" sx={{ fontWeight: 950, color: 'text.secondary' }} noWrap>
              {label}
            </Typography>
          ))}
        </Box>

        {assets.map((asset, index) => {
          const draft = drafts[asset.resource_id]
          const selected = selectedId === asset.resource_id
          const tier = (draft?.asset_tier ?? asset.asset_tier ?? '') as AssetTier
          const decision = governanceDecision(asset, draft)
          const pending = pendingResourceId === asset.resource_id
          const tone = surfaceDef(asset.surface).color
          const links = relationshipCount(asset, relationshipCounts)
          const signals = assetSignals(asset)

          return (
            <Box
              key={asset.resource_id}
              sx={{
                minWidth: 0,
                p: { xs: 0.9, md: 0.75 },
                borderRadius: 1,
                border: '1px solid',
                borderColor: selected ? alpha(ACCENT, 0.48) : 'divider',
                bgcolor: selected ? alpha(ACCENT, 0.08) : 'background.paper',
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '42px minmax(170px, 1.45fr) 118px 118px 148px 124px 78px' },
                gap: { xs: 0.75, md: 0.75 },
                alignItems: { xs: 'stretch', md: 'center' },
                boxShadow: selected ? `inset 3px 0 0 ${ACCENT}` : 'none',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' }, fontWeight: 900 }}>
                {index + 1}
              </Typography>

              <Box sx={{ minWidth: 0 }}>
                <ButtonBase
                  onClick={() => onSelect(asset.resource_id)}
                  sx={{
                    maxWidth: '100%',
                    textAlign: 'left',
                    borderRadius: 0.7,
                    color: 'text.primary',
                    display: 'block',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 950 }} noWrap title={nodeName(asset)}>
                    {nodeName(asset)}
                  </Typography>
                </ButtonBase>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap title={nodeMeta(asset)}>
                  {surfaceLabel(asset.surface)} / {asset.type}
                </Typography>
              </Box>

              <InlineFact label="Source" value={nodeSourceLabel(asset)} tone={tone} />
              <InlineFact label="Status" value={asset.current_tier || asset.review_status || asset.status || '--'} tone={decisionTone(decision)} />

              <GovernanceSelect
                ariaLabel={`Asset tier for ${nodeName(asset)}`}
                value={tier}
                options={ASSET_TIER_OPTIONS}
                disabled={pending}
                onChange={(value) => onUpdate(asset.resource_id, { asset_tier: value })}
              />

              <GovernanceSelect
                ariaLabel={`Decision for ${nodeName(asset)}`}
                value={decision}
                options={DECISION_OPTIONS}
                disabled={pending}
                onChange={(value) => {
                  if (value === 'Keep') onUpdate(asset.resource_id, { validation_status: 'verified' })
                  if (value === 'Remove') onUpdate(asset.resource_id, { validation_status: 'false_positive' })
                }}
                tone={decisionTone(decision)}
              />

              <Box sx={{ minWidth: 0, display: 'flex', gap: 0.45, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusPill label={`${formatNumber(links)} rel`} tone={TECH} />
                {signals > 0 && <StatusPill label={formatNumber(signals)} tone={colors.semantic.warning} />}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function GovernanceSelect({
  ariaLabel,
  value,
  options,
  disabled,
  onChange,
  tone = ACCENT,
}: {
  ariaLabel: string
  value: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
  disabled?: boolean
  onChange: (value: string) => void
  tone?: string
}) {
  return (
    <Box
      component="select"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(String(event.target.value))}
      sx={{
        width: '100%',
        minWidth: 0,
        height: 34,
        px: 1,
        borderRadius: 0.8,
        border: '1px solid',
        borderColor: alpha(tone, 0.35),
        bgcolor: 'background.default',
        color: 'text.primary',
        font: 'inherit',
        fontSize: 13,
        fontWeight: 850,
        outline: 'none',
        '&:focus': {
          borderColor: tone,
          boxShadow: `0 0 0 3px ${alpha(tone, 0.13)}`,
        },
        '&:disabled': {
          opacity: 0.62,
        },
      }}
    >
      {options.map((option) => (
        <option key={option.value || 'empty'} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </Box>
  )
}

function InlineFact({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, fontWeight: 800 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 900, color: tone }} noWrap title={value}>
        {value}
      </Typography>
    </Box>
  )
}

function RelationList({
  relations,
  selectedId,
  onSelect,
  loading,
}: {
  relations: RelationCard[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
}) {
  if (loading) return <LoadingBlock />
  if (!relations.length) return <EmptyLine text={tOr('assetMap.noRelationships', 'No relationships')} />

  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      {relations.map(({ edge, source, target }) => {
        const selected = selectedId === source.resource_id || selectedId === target.resource_id
        const tone = edge.edge_class === 'lead' ? colors.semantic.warning : TECH
        return (
          <ButtonBase
            key={edge.id}
            onClick={() => onSelect(source.resource_id)}
            sx={{
              width: '100%',
              p: 0.9,
              borderRadius: 1,
              border: '1px solid',
              borderColor: selected ? alpha(tone, 0.45) : 'divider',
              bgcolor: selected ? alpha(tone, 0.09) : 'background.paper',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
              gap: 0.8,
              textAlign: 'left',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 950 }} noWrap title={`${nodeName(source)} -> ${nodeName(target)}`}>
                {nodeName(source)} {'->'} {nodeName(target)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {relationLabel(edge.relation_type)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' }, flexWrap: 'wrap' }}>
              <StatusPill label={edge.edge_class === 'lead' ? tOr('assetMap.lead', 'Lead') : tOr('assetMap.confirmed', 'Confirmed')} tone={tone} />
              <StatusPill label={formatPercent(edge.confidence)} tone={TECH} />
              <StatusPill label={`${formatNumber(edge.evidence_count)} ${tOr('assetMap.evidence', 'evidence')}`} tone={ACCENT} />
            </Box>
          </ButtonBase>
        )
      })}
    </Box>
  )
}

function GapPanel({
  groups,
  onSelect,
  loading,
}: {
  groups: GapGroup[]
  onSelect: (id: string) => void
  loading?: boolean
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  if (loading) return <LoadingBlock />

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
      {groups.map((group) => {
        const expanded = !!expandedGroups[group.id]
        const shownAssets = expanded ? group.assets : group.assets.slice(0, 5)
        const hiddenCount = group.assets.length - shownAssets.length
        return (
          <Paper
            key={group.id}
            elevation={0}
            sx={{
              minHeight: 180,
              p: 1,
              borderRadius: 1,
              border: '1px solid',
              borderColor: alpha(group.tone, 0.25),
              bgcolor: alpha(group.tone, 0.055),
              display: 'flex',
              flexDirection: 'column',
              gap: 0.8,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <IconBadge tone={group.tone} small><AlertTriangle size={14} /></IconBadge>
              <Typography variant="subtitle2" sx={{ fontWeight: 950, minWidth: 0 }} noWrap>{group.label}</Typography>
              <Chip size="small" label={formatNumber(group.count)} sx={{ ml: 'auto', height: 22, borderRadius: 0.8, fontWeight: 900, bgcolor: alpha(group.tone, 0.16), color: group.tone }} />
            </Box>
            <Box sx={{ display: 'grid', gap: 0.55, maxHeight: expanded ? 320 : undefined, overflow: expanded ? 'auto' : 'visible', pr: expanded ? 0.2 : 0 }}>
              {shownAssets.map((asset) => (
                <ButtonBase
                  key={asset.resource_id}
                  onClick={() => onSelect(asset.resource_id)}
                  sx={{
                    minHeight: 32,
                    px: 0.7,
                    borderRadius: 0.8,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: alpha(group.tone, 0.16),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.7,
                    textAlign: 'left',
                  }}
                >
                  <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: group.tone, flex: '0 0 auto' }} />
                  <Typography variant="caption" sx={{ fontWeight: 850, minWidth: 0 }} noWrap title={nodeName(asset)}>
                    {nodeName(asset)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
                    {surfaceLabel(asset.surface)}
                  </Typography>
                </ButtonBase>
              ))}
              {group.assets.length === 0 && <EmptyLine compact text={tOr('assetMap.verified', 'Verified')} />}
            </Box>
            {group.assets.length > 5 && (
              <ExpandInlineButton
                expanded={expanded}
                hiddenCount={hiddenCount}
                onClick={() => setExpandedGroups(prev => ({ ...prev, [group.id]: !expanded }))}
              />
            )}
          </Paper>
        )
      })}
    </Box>
  )
}

function ExpandInlineButton({
  expanded,
  hiddenCount,
  onClick,
}: {
  expanded: boolean
  hiddenCount: number
  onClick: () => void
}) {
  const Icon = expanded ? ChevronUp : ChevronDown
  return (
    <Button
      type="button"
      size="small"
      variant="text"
      onClick={onClick}
      endIcon={<Icon size={14} />}
      sx={{
        justifySelf: 'start',
        minHeight: 28,
        px: 0.6,
        borderRadius: 0.8,
        textTransform: 'none',
        fontWeight: 900,
        color: ACCENT,
      }}
    >
      {expanded ? '收合' : `展開 ${formatNumber(hiddenCount)} 筆`}
    </Button>
  )
}

function FocusPanel({
  node,
  relationCards,
  relationshipCounts,
  typeEntries,
  onSelect,
  loading,
}: {
  node?: KernelAssetMapNode
  relationCards: RelationCard[]
  relationshipCounts: Record<string, number>
  typeEntries: Array<[string, number]>
  onSelect: (id: string) => void
  loading?: boolean
}) {
  const theme = useTheme()
  const [relationsExpanded, setRelationsExpanded] = useState(false)
  if (loading) return <Panel title={tOr('assetMap.focused', 'Focused')} icon={<Sparkles size={15} />} grow><LoadingBlock /></Panel>
  if (!node) return <Panel title={tOr('assetMap.focused', 'Focused')} icon={<Sparkles size={15} />} grow><EmptyLine text={tOr('assetMap.emptyTitle', 'No assets yet')} /></Panel>

  const tone = surfaceDef(node.surface).color
  const links = relationshipCount(node, relationshipCounts)
  const signals = assetSignals(node)
  const shownRelations = relationsExpanded ? relationCards : relationCards.slice(0, 8)
  const hiddenRelations = relationCards.length - shownRelations.length

  return (
    <Panel title={tOr('assetMap.focused', 'Focused')} icon={<Sparkles size={15} />} grow>
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ p: 1, borderRadius: 1, bgcolor: alpha(tone, 0.08), border: '1px solid', borderColor: alpha(tone, 0.25) }}>
          <Box sx={{ display: 'flex', gap: 0.8, alignItems: 'flex-start', minWidth: 0 }}>
            <IconBadge tone={tone}><Network size={17} /></IconBadge>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 950, lineHeight: 1.1 }} noWrap title={nodeName(node)}>
                {nodeName(node)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {nodeMeta(node)}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            <StatusPill label={`${formatNumber(links)} ${tOr('assetMap.relationshipAbbr', 'rel')}`} tone={TECH} />
            <StatusPill label={formatPercent(node.confidence)} tone={tone} />
            {signals > 0 && <StatusPill label={`${formatNumber(signals)} ${tOr('assetMap.findings', 'findings')}`} tone={colors.semantic.warning} />}
            {node.validation_status && <StatusPill label={node.validation_status} tone={colors.semantic.success} />}
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
          <Fact label={tOr('assetMap.type', 'Type')} value={node.type} />
          <Fact label={tOr('assetMap.confidence', 'Confidence')} value={formatPercent(node.confidence)} />
          <Fact label={tOr('assetMap.evidence', 'Evidence')} value={formatNumber(node.evidence_count)} />
          <Fact label={tOr('assetMap.scoredAssets', 'Scored')} value={formatNumber(node.asset_scores?.length ?? (node.asset_grade ? 1 : 0))} />
        </Box>

        <Box>
          <SectionTitle icon={<ShieldAlert size={14} />} text={tOr('assetMap.surfaceScores', 'Surface scores')} />
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.6 }}>
            {node.asset_scores?.length ? (
              node.asset_scores.map((score) => (
                <StatusPill
                  key={`${score.surface}-${score.grade}-${score.display_score}`}
                  label={`${surfaceLabel(score.surface)} ${score.grade || score.display_score}`}
                  tone={surfaceDef(score.surface).color}
                />
              ))
            ) : node.asset_grade ? (
              <StatusPill label={`${surfaceLabel(node.asset_surface)} ${node.asset_grade}`} tone={tone} />
            ) : (
              <StatusPill label={tOr('assetMap.unscored', 'Unscored')} tone={colors.semantic.neutral} />
            )}
          </Box>
        </Box>

        <Box>
          <SectionTitle icon={<Route size={14} />} text={tOr('assetMap.relationshipPanel', 'Relationships')} />
          <Box sx={{ mt: 0.6, display: 'grid', gap: 0.55, maxHeight: relationsExpanded ? 340 : 210, overflow: 'auto', pr: 0.2 }}>
            {shownRelations.map(({ edge, source, target }) => {
              const other = source.resource_id === node.resource_id ? target : source
              const edgeTone = edge.edge_class === 'lead' ? colors.semantic.warning : TECH
              return (
                <ButtonBase
                  key={edge.id}
                  onClick={() => onSelect(other.resource_id)}
                  sx={{
                    width: '100%',
                    minHeight: 42,
                    p: 0.7,
                    borderRadius: 0.8,
                    border: '1px solid',
                    borderColor: alpha(edgeTone, 0.18),
                    bgcolor: theme.palette.mode === 'dark' ? alpha(edgeTone, 0.08) : alpha(edgeTone, 0.055),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.7,
                    textAlign: 'left',
                  }}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: edgeTone, flex: '0 0 auto' }} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 900 }} noWrap title={nodeName(other)}>
                      {nodeName(other)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11 }} noWrap>
                      {relationLabel(edge.relation_type)}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ fontWeight: 900, color: edgeTone, flexShrink: 0 }}>
                    {formatPercent(edge.confidence)}
                  </Typography>
                </ButtonBase>
              )
            })}
            {relationCards.length === 0 && <EmptyLine compact text={tOr('assetMap.noRelationships', 'No relationships')} />}
          </Box>
          {relationCards.length > 8 && (
            <Box sx={{ mt: 0.55 }}>
              <ExpandInlineButton
                expanded={relationsExpanded}
                hiddenCount={hiddenRelations}
                onClick={() => setRelationsExpanded(value => !value)}
              />
            </Box>
          )}
        </Box>

        <Box>
          <SectionTitle icon={<Layers3 size={14} />} text={tOr('assetMap.types', 'Types')} />
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.6 }}>
            {typeEntries.map(([label, value]) => (
              <StatusPill key={label} label={`${label} ${formatNumber(value)}`} tone={ACCENT} />
            ))}
          </Box>
        </Box>
      </Box>
    </Panel>
  )
}

function SurfacePanel({ entries, total }: { entries: Array<[string, number]>; total: number }) {
  return (
    <Panel title={tOr('assetMap.surfaces', 'Surfaces')} icon={<GitBranch size={15} />}>
      <Box sx={{ display: 'grid', gap: 0.75 }}>
        {entries.map(([surface, count]) => {
          const tone = surfaceDef(surface).color
          const pct = total > 0 ? Math.max(3, Math.round((count / total) * 100)) : 0
          return (
            <Box key={surface} sx={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 0.35fr) minmax(0, 1fr) auto', alignItems: 'center', gap: 0.7 }}>
              <Typography variant="caption" sx={{ fontWeight: 900 }} noWrap>{surfaceLabel(surface)}</Typography>
              <Box sx={{ height: 12, borderRadius: 999, bgcolor: alpha(tone, 0.1), overflow: 'hidden' }}>
                <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: tone, borderRadius: 999 }} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900 }}>{formatNumber(count)}</Typography>
            </Box>
          )
        })}
        {entries.length === 0 && <EmptyLine compact text={tOr('assetMap.managerView.empty.surface', 'No surface data')} />}
      </Box>
    </Panel>
  )
}

function Panel({
  title,
  icon,
  children,
  grow,
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
  grow?: boolean
}) {
  const theme = useTheme()
  return (
    <Paper
      elevation={0}
      sx={{
        minHeight: grow ? 0 : undefined,
        flex: grow ? 1 : '0 0 auto',
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.1),
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ minHeight: 38, px: 1.1, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: alpha(ACCENT, 0.055) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65, minWidth: 0, color: ACCENT }}>
          {icon}
          <Typography variant="subtitle2" sx={{ fontWeight: 950, color: 'text.primary' }} noWrap>
            {title}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ p: 1, minHeight: 0, overflow: grow ? 'auto' : 'hidden' }}>
        {children}
      </Box>
    </Paper>
  )
}

function IconBadge({ children, tone, small }: { children: ReactNode; tone: string; small?: boolean }) {
  const size = small ? 30 : 36
  return (
    <Box sx={{ width: size, height: size, borderRadius: 1, display: 'grid', placeItems: 'center', flex: '0 0 auto', color: tone, bgcolor: alpha(tone, 0.12), boxShadow: `inset 0 0 0 1px ${alpha(tone, 0.23)}` }}>
      {children}
    </Box>
  )
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{ height: 23, borderRadius: 0.8, fontSize: 11.5, fontWeight: 900, bgcolor: alpha(tone, 0.12), color: tone }}
    />
  )
}

function MiniReadout({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Box sx={{ minHeight: 44, px: 1, py: 0.75, borderRadius: 1, border: '1px solid', borderColor: alpha(tone, 0.18), bgcolor: alpha(tone, 0.055), display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tone, flex: '0 0 auto' }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, minWidth: 0 }} noWrap>{label}</Typography>
      <Typography variant="body2" sx={{ ml: 'auto', fontWeight: 950, color: tone }}>{value}</Typography>
    </Box>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minHeight: 48, p: 0.8, borderRadius: 0.8, border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 800 }} noWrap>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 950 }} noWrap title={value}>{value}</Typography>
    </Box>
  )
}

function SectionTitle({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55, color: ACCENT }}>
      {icon}
      <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 950 }}>{text}</Typography>
    </Box>
  )
}

function LoadingBlock() {
  return (
    <Box sx={{ minHeight: 170, display: 'grid', placeItems: 'center' }}>
      <CircularProgress size={24} />
    </Box>
  )
}

function EmptyLine({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <Box sx={{ minHeight: compact ? 42 : 120, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="body2">{text}</Typography>
    </Box>
  )
}
