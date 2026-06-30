/**
 * PostureHeader — surfaces the orphaned aggregate *posture* reads that
 * sit on top of the per-finding scan lists.
 *
 *   - Container view → GET /container-posture (getContainerPosture)
 *   - Cloud / CSPM view → GET /cloud-posture (getCloudPosture)
 *
 * Both endpoints return an org-wide coverage + grade rollup that the
 * findings lists never showed. This header renders that rollup in both
 * experience modes (manager = KPI tiles + grade gauge; engineer = a
 * dense coverage strip + a per-asset / per-account scored table).
 *
 * The endpoints never 404: until the surface scoring write-path has run
 * they return `score_available=false` with an unscored inventory. In
 * that case we still show the coverage counts and a neutral "scoring
 * not available yet" note instead of a fake grade.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Box, CircularProgress, Paper, Typography } from '@mui/material'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  KpiCard,
  GaugeChart,
  DataTable,
  EvidenceDrawer,
  ModeView,
  type MRT_ColumnDef,
  type EvidenceSection,
} from '@compounds/_shared'
import {
  getContainerPosture,
  getCloudPosture,
  type ContainerPosture,
  type ContainerPostureAsset,
  type CloudPosture,
  type CloudPostureAccount,
  type CloudPostureResource,
} from '@lib/engine/code/posture'

const GAUGE_HEIGHT = 240

// ── Shared presentational frame ─────────────────────────────────────

function PostureFrame({ children }: { children: React.ReactNode }) {
  return (
    <Paper
      elevation={1}
      className="rounded-xl"
      sx={{ bgcolor: 'background.paper', p: 2.5, flexShrink: 0 }}
    >
      {children}
    </Paper>
  )
}

function PostureLoading() {
  return (
    <PostureFrame>
      <Box className="flex items-center gap-2" sx={{ py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          {t('warroom.postureLoading')}
        </Typography>
      </Box>
    </PostureFrame>
  )
}

function PostureError() {
  return (
    <PostureFrame>
      <Alert severity="warning" variant="outlined" sx={{ justifyContent: 'center' }}>
        {t('warroom.postureLoadFailed')}
      </Alert>
    </PostureFrame>
  )
}

/** Coverage = scored ÷ total, the headline KPI both surfaces share. */
function coveragePct(scored: number, total: number): number {
  return total > 0 ? Math.round((scored / total) * 100) : 0
}

// ════════════════════════════════════════════════════════════════════
// Container posture
// ════════════════════════════════════════════════════════════════════

export function ContainerPostureHeader() {
  const { org } = useOrg()
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.container.posture(org?.id),
    queryFn: () => getContainerPosture(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  if (isLoading) return <PostureLoading />
  if (isError || !data) return <PostureError />

  return (
    <ModeView
      manager={<ContainerPostureManager p={data} />}
      engineer={<ContainerPostureEngineer p={data} />}
    />
  )
}

function ContainerPostureManager({ p }: { p: ContainerPosture }) {
  const coverage = coveragePct(p.scored_count, p.image_count)
  return (
    <PostureFrame>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr) 220px' },
          gap: 2,
          alignItems: 'center',
        }}
      >
        <KpiCard label={t('warroom.kpiImages')} value={p.image_count} />
        <KpiCard label={t('warroom.kpiScored')} value={p.scored_count} />
        <KpiCard
          label={t('warroom.kpiCoverage')}
          value={coverage}
          unit="%"
        />
        {p.score_available ? (
          <GaugeChart
            value={p.avg_display ?? p.avg_score ?? 0}
            grade={p.avg_grade}
            label={t('warroom.gaugePosture')}
            height={GAUGE_HEIGHT}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: GAUGE_HEIGHT }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t('warroom.postureNoScore')}
            </Typography>
          </Box>
        )}
      </Box>
    </PostureFrame>
  )
}

function ContainerPostureEngineer({ p }: { p: ContainerPosture }) {
  const [selected, setSelected] = useState<ContainerPostureAsset | null>(null)

  const columns = useMemo<MRT_ColumnDef<ContainerPostureAsset>[]>(
    () => [
      {
        accessorKey: 'digest',
        header: t('warroom.colImage'),
        Cell: ({ cell }) => (
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>
            {String(cell.getValue() ?? '—')}
          </Typography>
        ),
      },
      {
        id: 'os',
        header: t('warroom.colOs'),
        accessorFn: (r) => [r.os_family, r.os_version].filter(Boolean).join(' ') || '—',
      },
      {
        accessorKey: 'scored',
        header: t('warroom.colScored'),
        accessorFn: (r) => (r.scored ? t('common.yes') : t('common.no')),
      },
      {
        accessorKey: 'display_score',
        header: t('warroom.colScore'),
        accessorFn: (r) => (r.scored ? (r.display_score ?? r.score ?? 0) : null),
        Cell: ({ row }) =>
          row.original.scored ? (
            <Typography variant="body2">{row.original.display_score ?? row.original.score ?? 0}</Typography>
          ) : (
            <Typography variant="body2" color="text.disabled">{'—'}</Typography>
          ),
      },
      {
        accessorKey: 'grade',
        header: t('warroom.colGrade'),
        accessorFn: (r) => r.grade || '—',
      },
    ],
    [],
  )

  const sections: EvidenceSection[] = useMemo(() => {
    if (!selected) return []
    return [
      {
        title: t('warroom.evidenceImage'),
        content: (
          <EvidenceRows
            rows={[
              { label: t('warroom.colImage'), value: selected.digest || '—' },
              { label: t('warroom.evidenceResourceId'), value: selected.resource_id || '—' },
              { label: t('warroom.colOs'), value: [selected.os_family, selected.os_version].filter(Boolean).join(' ') || '—' },
              { label: t('warroom.colScore'), value: selected.scored ? String(selected.display_score ?? selected.score ?? 0) : t('warroom.postureNoScore') },
              { label: t('warroom.colGrade'), value: selected.grade || '—' },
            ]}
          />
        ),
      },
    ]
  }, [selected])

  return (
    <>
      <PostureFrame>
        <PostureStat
          total={p.image_count}
          scored={p.scored_count}
          available={p.score_available}
          avgGrade={p.avg_grade}
          avgScore={p.avg_display ?? p.avg_score}
          message={p.message}
        />
        <Box sx={{ mt: 2 }}>
          <DataTable
            columns={columns}
            data={p.images}
            onRowClick={setSelected}
            maxBodyHeight={260}
            emptyText={t('warroom.postureEmptyImages')}
          />
        </Box>
      </PostureFrame>
      <EvidenceDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.digest ?? ''}
        sections={sections}
      />
    </>
  )
}

// ════════════════════════════════════════════════════════════════════
// Cloud posture
// ════════════════════════════════════════════════════════════════════

export function CloudPostureHeader() {
  const { org } = useOrg()
  const resourcePage = { limit: 500 } as const
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.cloud.posture(org?.id, resourcePage),
    queryFn: () => getCloudPosture(org!.id, resourcePage),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  if (isLoading) return <PostureLoading />
  if (isError || !data) return <PostureError />

  return (
    <ModeView
      manager={<CloudPostureManager p={data} />}
      engineer={<CloudPostureEngineer p={data} />}
    />
  )
}

function CloudPostureManager({ p }: { p: CloudPosture }) {
  const coverage = coveragePct(p.scored_count, p.resource_count)
  return (
    <PostureFrame>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr) 220px' },
          gap: 2,
          alignItems: 'center',
        }}
      >
        <KpiCard label={t('warroom.kpiResources')} value={p.resource_count} />
        <KpiCard label={t('warroom.kpiAccounts')} value={p.accounts.length} />
        <KpiCard label={t('warroom.kpiScored')} value={p.scored_count} />
        <KpiCard
          label={t('warroom.kpiCoverage')}
          value={coverage}
          unit="%"
        />
        {p.score_available ? (
          <GaugeChart
            value={p.avg_display ?? p.avg_score ?? 0}
            grade={p.avg_grade}
            label={t('warroom.gaugePosture')}
            height={GAUGE_HEIGHT}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: GAUGE_HEIGHT }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t('warroom.postureNoScore')}
            </Typography>
          </Box>
        )}
      </Box>
    </PostureFrame>
  )
}

function CloudPostureEngineer({ p }: { p: CloudPosture }) {
  const [selected, setSelected] = useState<CloudPostureResource | null>(null)

  const accountColumns = useMemo<MRT_ColumnDef<CloudPostureAccount>[]>(
    () => [
      {
        id: 'account',
        header: t('warroom.colAccount'),
        accessorFn: (r) => r.display_name || r.account_locator || r.account_id,
      },
      { accessorKey: 'provider', header: t('warroom.colProvider'), accessorFn: (r) => r.provider || '—' },
      { accessorKey: 'resource_count', header: t('warroom.colResources') },
      { accessorKey: 'scored_count', header: t('warroom.colScored') },
      {
        accessorKey: 'avg_score',
        header: t('warroom.colAvgScore'),
        accessorFn: (r) => (r.scored_count > 0 ? (r.avg_score ?? 0) : null),
        Cell: ({ row }) =>
          row.original.scored_count > 0 ? (
            <Typography variant="body2">{row.original.avg_score ?? 0}</Typography>
          ) : (
            <Typography variant="body2" color="text.disabled">{'—'}</Typography>
          ),
      },
    ],
    [],
  )

  const resourceColumns = useMemo<MRT_ColumnDef<CloudPostureResource>[]>(
    () => [
      {
        accessorKey: 'canonical_id',
        header: t('warroom.colResource'),
        Cell: ({ cell }) => (
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>
            {String(cell.getValue() ?? '—')}
          </Typography>
        ),
      },
      { accessorKey: 'resource_type', header: t('warroom.colType'), accessorFn: (r) => r.resource_type || '—' },
      { accessorKey: 'provider', header: t('warroom.colProvider'), accessorFn: (r) => r.provider || '—' },
      {
        accessorKey: 'score',
        header: t('warroom.colScore'),
        accessorFn: (r) => (r.scored ? (r.score ?? 0) : null),
        Cell: ({ row }) =>
          row.original.scored ? (
            <Typography variant="body2">{row.original.score ?? 0}</Typography>
          ) : (
            <Typography variant="body2" color="text.disabled">{'—'}</Typography>
          ),
      },
      { accessorKey: 'grade', header: t('warroom.colGrade'), accessorFn: (r) => r.grade || '—' },
    ],
    [],
  )

  const sections: EvidenceSection[] = useMemo(() => {
    if (!selected) return []
    return [
      {
        title: t('warroom.evidenceResource'),
        content: (
          <EvidenceRows
            rows={[
              { label: t('warroom.colResource'), value: selected.canonical_id || '—' },
              { label: t('warroom.evidenceResourceId'), value: selected.resource_id || '—' },
              { label: t('warroom.colType'), value: selected.resource_type || '—' },
              { label: t('warroom.colProvider'), value: selected.provider || '—' },
              { label: t('warroom.colAccount'), value: selected.account_id || '—' },
              { label: t('warroom.colScore'), value: selected.scored ? String(selected.score ?? 0) : t('warroom.postureNoScore') },
              { label: t('warroom.colGrade'), value: selected.grade || '—' },
            ]}
          />
        ),
      },
    ]
  }, [selected])

  return (
    <>
      <PostureFrame>
        <PostureStat
          total={p.resource_count}
          scored={p.scored_count}
          available={p.score_available}
          avgGrade={p.avg_grade}
          avgScore={p.avg_display ?? p.avg_score}
          message={p.message}
        />
        {p.accounts.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={600}>
              {t('warroom.byAccount')}
            </Typography>
            <DataTable
              columns={accountColumns}
              data={p.accounts}
              maxBodyHeight={200}
              emptyText={t('warroom.postureEmptyAccounts')}
            />
          </Box>
        )}
        <Box sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary" fontWeight={600}>
            {t('warroom.byResource')}
          </Typography>
          <DataTable
            columns={resourceColumns}
            data={p.resources}
            onRowClick={setSelected}
            maxBodyHeight={260}
            emptyText={t('warroom.postureEmptyResources')}
          />
        </Box>
      </PostureFrame>
      <EvidenceDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.canonical_id ?? ''}
        sections={sections}
      />
    </>
  )
}

// ── Shared engineer stat strip ──────────────────────────────────────

function PostureStat({
  total,
  scored,
  available,
  avgGrade,
  avgScore,
  message,
}: {
  total: number
  scored: number
  available: boolean
  avgGrade?: string
  avgScore?: number
  message?: string
}) {
  const coverage = coveragePct(scored, total)
  return (
    <Box className="flex items-center flex-wrap" sx={{ gap: 3, rowGap: 1 }}>
      <Stat label={t('warroom.kpiAssets')} value={String(total)} />
      <Stat label={t('warroom.kpiScored')} value={`${scored} (${coverage}%)`} />
      {available ? (
        <Stat
          label={t('warroom.gaugePosture')}
          value={`${avgScore ?? 0}${avgGrade ? ` · ${avgGrade}` : ''}`}
        />
      ) : (
        <Typography variant="body2" color="text.secondary">
          {message || t('warroom.postureNoScore')}
        </Typography>
      )}
    </Box>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="subtitle2" fontWeight={700}>
        {value}
      </Typography>
    </Box>
  )
}

// ── Evidence drawer key/value body ──────────────────────────────────

/** Renders a list of label→value rows as an EvidenceSection `content`. */
function EvidenceRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', columnGap: 2, rowGap: 1 }}>
      {rows.map((r) => (
        <Box key={r.label} sx={{ display: 'contents' }}>
          <Typography variant="body2" color="text.secondary">
            {r.label}
          </Typography>
          <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
            {r.value}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}
