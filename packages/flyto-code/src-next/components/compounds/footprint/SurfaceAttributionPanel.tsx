/**
 * SurfaceAttributionPanel — the unified "why is this mine?" surface view.
 *
 * Lists every resolved surface item (GET /footprint/surface) across all
 * source tables, with a per-pool filter (main / candidate / noise / all).
 * Clicking a row that carries a kernel resource_id opens the per-asset
 * attribution evidence chain (GET /footprint/surface/{rid}/evidence) —
 * the supports/refutes claim ledger that answers ownership.
 *
 * Client functions imported by DIRECT FILE PATH per decoupling rule.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { CircularProgress } from '@mui/material'
import { AlertTriangle, Building2, GitBranch, ShieldCheck } from 'lucide-react'

import {
  DataTable,
  EvidenceDrawer,
  type MRT_ColumnDef,
} from '@compounds/_shared'
import { SEVERITY_TONE } from '@lib/tokens/severity'

import {
  getCompanyScopeGraph,
  getFootprintSurface,
  getSurfaceEvidence,
  type CompanyScopeGraphResponse,
  type SourceQualitySummary,
  type SurfaceItem,
  type SurfacePool,
} from '@lib/engine/code/footprintSurface'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';

interface Props {
  orgId: string
}

// Labels are resolved at the render site (not here) so tOr runs after i18n init.
const POOLS: { value: SurfacePool; labelKey: string; labelEn: string }[] = [
  { value: 'main', labelKey: 'footprint.attribution.poolMain', labelEn: 'Main' },
  { value: 'confirmed', labelKey: 'footprint.attribution.poolConfirmed', labelEn: 'Owned assets' },
  { value: 'candidate', labelKey: 'footprint.attribution.poolCandidate', labelEn: 'Candidate assets' },
  { value: 'noise', labelKey: 'footprint.attribution.poolNoise', labelEn: 'Noise' },
  { value: 'all', labelKey: 'footprint.attribution.poolAll', labelEn: 'All' },
]

function poolTone(pool?: string) {
  switch (pool) {
    case 'confirmed':
      return SEVERITY_TONE['low'] // neutral-positive slate
    case 'candidate':
      return SEVERITY_TONE['medium']
    case 'noise':
      return SEVERITY_TONE['']
    default:
      return SEVERITY_TONE['']
  }
}

function qualityTone(status?: string) {
  switch (status) {
    case 'confirmed':
      return SEVERITY_TONE['low']
    case 'corroborated':
      return SEVERITY_TONE['medium']
    case 'candidate':
      return SEVERITY_TONE['medium']
    case 'conflict':
      return SEVERITY_TONE['critical']
    case 'not_collected':
      return SEVERITY_TONE['high']
    default:
      return SEVERITY_TONE['']
  }
}

function qualityLabel(q?: SourceQualitySummary) {
  return q?.coverage_status?.replace(/_/g, ' ') || 'not collected'
}

const EFFECT_COLOR: Record<string, 'success' | 'error' | 'default'> = {
  supports: 'success',
  refutes: 'error',
  neutral: 'default',
}

export function SurfaceAttributionPanel({ orgId }: Props) {
  const [pool, setPool] = useState<SurfacePool>('main')
  const [selected, setSelected] = useState<SurfaceItem | null>(null)

  const q = useQuery({
    queryKey: qk.footprint.surface(orgId, pool),
    queryFn: () => getFootprintSurface(orgId, pool),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const scopeQ = useQuery({
    queryKey: qk.footprint.companyScope(orgId),
    queryFn: () => getCompanyScopeGraph(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const evidenceQ = useQuery({
    queryKey: qk.footprint.surfaceEvidence(orgId, selected?.ResourceID),
    queryFn: () => getSurfaceEvidence(orgId, selected!.ResourceID),
    enabled: !!orgId && !!selected?.ResourceID,
    staleTime: 30_000,
  })

  const rows = useMemo(() => q.data?.items ?? [], [q.data])

  const columns = useMemo<MRT_ColumnDef<SurfaceItem>[]>(
    () => [
      {
        accessorKey: 'CanonicalValue',
        header: t('footprint.attribution.colAsset'),
        size: 240,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {row.original.CanonicalValue}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.original.Type} · {row.original.Category}
            </Typography>
          </Stack>
        ),
      },
      {
        id: 'owner',
        header: t('footprint.attribution.colOwner'),
        size: 170,
        accessorFn: (r) => r.owner_display_name ?? '',
        Cell: ({ row }) => (
          row.original.owner_display_name ? (
            <Stack spacing={0.2}>
              <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                {row.original.owner_display_name}
              </Typography>
              {row.original.owner_relation_type && (
                <Typography variant="caption" color="text.secondary">
                  {row.original.owner_relation_type.replace(/_/g, ' ')}
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary">{t('footprint.attribution.unattributed')}</Typography>
          )
        ),
      },
      {
        id: 'pool',
        header: t('footprint.attribution.colPool'),
        size: 110,
        accessorFn: (r) => r.attribution_pool ?? '',
        Cell: ({ row }) => {
          const p = row.original.attribution_pool
          if (!p) return <Typography variant="caption" color="text.secondary">—</Typography>
          const t = poolTone(p)
          return (
            <Chip
              size="small"
              label={p}
              sx={{ bgcolor: t.soft, color: t.tone, border: `1px solid ${t.ring}`, textTransform: 'capitalize' }}
            />
          )
        },
      },
      {
        id: 'quality',
        header: t('footprint.attribution.colQuality'),
        size: 150,
        accessorFn: (r) => r.source_quality?.coverage_status ?? '',
        Cell: ({ row }) => {
          const q = row.original.source_quality
          const t = qualityTone(q?.coverage_status)
          return (
            <Stack spacing={0.35}>
              <Chip
                size="small"
                label={qualityLabel(q)}
                sx={{ bgcolor: t.soft, color: t.tone, border: `1px solid ${t.ring}`, textTransform: 'capitalize' }}
              />
              <Typography variant="caption" color="text.secondary">
                {q?.distinct_source_count ?? row.original.distinct_source_count ?? 0} src · {q?.evidence_count ?? row.original.evidence_count ?? 0} ev
              </Typography>
            </Stack>
          )
        },
      },
      {
        id: 'sources',
        header: t('footprint.attribution.colSources'),
        size: 200,
        accessorFn: (r) => (r.Sources ?? []).join(', '),
        Cell: ({ row }) => (
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {(row.original.Sources ?? []).map((s) => (
              <Chip key={s} size="small" variant="outlined" label={s} />
            ))}
          </Stack>
        ),
      },
      {
        accessorKey: 'evidence_count',
        header: t('footprint.attribution.colEvidence'),
        size: 90,
        Cell: ({ row }) => row.original.evidence_count ?? 0,
      },
    ],
    [],
  )

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }} flexWrap="wrap" gap={1}>
        <Stack>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t('footprint.attribution.title')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('footprint.attribution.subtitle')}
          </Typography>
        </Stack>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={pool}
          onChange={(_, v) => v && setPool(v as SurfacePool)}
        >
          {POOLS.map((p) => (
            <ToggleButton key={p.value} value={p.value}>
              {tOr(p.labelKey, p.labelEn)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('footprint.attribution.lede')}
      </Typography>

      <CompanyScopeStrip data={scopeQ.data} loading={scopeQ.isLoading} />

      <DataTable
        columns={columns}
        data={rows}
        isLoading={q.isLoading}
        maxBodyHeight={420}
        emptyText={t('footprint.attribution.empty')}
        onRowClick={(row) => setSelected(row)}
      />

      <EvidenceDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.CanonicalValue ?? ''}
        subtitle={selected ? `${selected.Type} · ${selected.Category}` : undefined}
        sections={
          selected
            ? [
                {
                  title: t('footprint.attribution.secResolvedFrom'),
                  content: (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {(selected.Sources ?? []).length
                        ? (selected.Sources ?? []).map((s) => <Chip key={s} size="small" label={s} />)
                        : <Typography variant="body2" color="text.secondary">{t('footprint.surface.noSourceTables')}</Typography>}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.attribution.secOwnerQuality'),
                  content: (
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap">
                        <Chip
                          size="small"
                          variant={selected.owner_display_name ? 'filled' : 'outlined'}
                          label={selected.owner_display_name ? `Owner: ${selected.owner_display_name}` : t('footprint.attribution.unattributed')}
                        />
                        <Chip size="small" label={`Quality: ${qualityLabel(selected.source_quality)}`} />
                        <Chip size="small" variant="outlined" label={`${selected.source_quality?.distinct_source_count ?? selected.distinct_source_count ?? 0} sources`} />
                        <Chip size="small" variant="outlined" label={`${selected.source_quality?.evidence_count ?? selected.evidence_count ?? 0} evidence`} />
                      </Stack>
                      {(selected.source_quality?.notes ?? []).map((note) => (
                        <Typography key={note} variant="body2" color="text.secondary">{note}</Typography>
                      ))}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.attribution.secEvidenceChain'),
                  content: !selected.ResourceID ? (
                    <Typography variant="body2" color="text.secondary">
                      {t('footprint.attribution.noResourceId')}
                    </Typography>
                  ) : evidenceQ.isLoading ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">{t('footprint.attribution.derivingChain')}</Typography>
                    </Stack>
                  ) : evidenceQ.isError ? (
                    <Typography variant="body2" color="error">
                      {(evidenceQ.error as Error)?.message ?? t('footprint.attribution.noEvidenceFound')}
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          size="small"
                          color={evidenceQ.data?.owned ? 'success' : 'default'}
                          label={evidenceQ.data?.owned ? t('footprint.attribution.chipOwned') : t('footprint.attribution.chipUnverified')}
                        />
                        <Typography variant="body2">
                          {t('footprint.attribution.poolLabel')}: <b>{evidenceQ.data?.attribution_pool}</b> · {t('footprint.attribution.confidenceLabel')} {evidenceQ.data?.confidence ?? 0}
                        </Typography>
                      </Stack>
                      {evidenceQ.data?.source_quality && (
                        <Stack direction="row" spacing={0.75} flexWrap="wrap">
                          <Chip size="small" label={`Quality: ${qualityLabel(evidenceQ.data.source_quality)}`} />
                          {evidenceQ.data.owner_display_name && <Chip size="small" variant="outlined" label={`Owner: ${evidenceQ.data.owner_display_name}`} />}
                        </Stack>
                      )}
                      {(evidenceQ.data?.chain ?? []).map((step, i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                          <Chip size="small" color={EFFECT_COLOR[step.effect] ?? 'default'} label={step.effect} />
                          <Box>
                            <Typography variant="body2">{step.description}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {step.kind} · {step.source}
                              {step.weight ? ` · weight ${step.weight}` : ''}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                      {(evidenceQ.data?.chain ?? []).length === 0 && (
                        <Typography variant="body2" color="text.secondary">{t('footprint.surface.noClaimsRecorded')}</Typography>
                      )}
                    </Stack>
                  ),
                },
              ]
            : undefined
        }
      />
    </Box>
  )
}

function CompanyScopeStrip({ data, loading }: { data?: CompanyScopeGraphResponse; loading: boolean }) {
  const summary = data?.summary
  const status = data?.source_status
  const tone = qualityTone(status?.coverage_status)
  const gaps = data?.gaps ?? []
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' },
        gap: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1,
        mb: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      <ScopeMetric icon={<Building2 size={14} />} label={t('footprint.companyScope.entities')} value={loading ? '…' : summary?.business_entities ?? 0} />
      <ScopeMetric icon={<GitBranch size={14} />} label={t('footprint.companyScope.edges')} value={loading ? '…' : data?.edges.length ?? 0} />
      <ScopeMetric icon={<ShieldCheck size={14} />} label={t('footprint.companyScope.assets')} value={loading ? '…' : summary?.owned_assets ?? 0} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700 }}>
          {t('footprint.companyScope.sourceStatus')}
        </Typography>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
          <Chip
            size="small"
            label={loading ? '…' : qualityLabel(status)}
            sx={{ bgcolor: tone.soft, color: tone.tone, border: `1px solid ${tone.ring}`, textTransform: 'capitalize' }}
          />
          {gaps.length > 0 && (
            <Chip
              size="small"
              icon={<AlertTriangle size={13} />}
              label={`${gaps.length} gaps`}
              color={gaps.some(g => g.severity === 'critical') ? 'error' : 'warning'}
              variant="outlined"
            />
          )}
        </Stack>
      </Box>
    </Box>
  )
}

function ScopeMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}>
      <Box sx={{ color: 'text.secondary', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</Typography>
      </Box>
    </Box>
  )
}
