import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Typography } from '@mui/material'
import { ShieldAlert } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { EmptyStateGuide } from '@components/atoms/EmptyStateGuide'
import { LoadingState } from '@components/atoms/LoadingState'
import { QueryError } from '@components/atoms/QueryError'
import {
  KpiCard, DonutChart, DataTable, SeverityChip,
  type MRT_ColumnDef, type DonutDatum,
} from '@compounds/_shared'
import { getMCPEgressRisk, type MCPEgressRow } from '@lib/engine/code/mcp'
import { dataClassSeverity, targetTrustSeverity, decisionSeverity } from './mcpTokens'
import { MCPEventExplanationDrawer } from './MCPEventExplanationDrawer'

// MCPEgressPanel — the sensitive-data egress risk surface (#41). KPIs +
// data-class donut + a table of the recent outbound sensitive calls. Clicking a
// row opens the EvidenceDrawer ("why was this flagged") via the event
// explanation endpoint.

export function MCPEgressPanel({ orgId }: { orgId: string }) {
  const egressQ = useQuery({
    queryKey: qk.mcp.egress(orgId),
    queryFn: () => getMCPEgressRisk(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const [explainEventId, setExplainEventId] = useState<string | null>(null)

  const data = egressQ.data

  const donutData: DonutDatum[] = useMemo(
    () =>
      Object.entries(data?.byDataClass ?? {}).map(([label, value]) => ({
        label,
        value,
        severity: dataClassSeverity(label),
      })),
    [data],
  )

  const columns = useMemo<MRT_ColumnDef<MCPEgressRow>[]>(
    () => [
      {
        accessorKey: 'toolName',
        header: t('mcp.egress.tool'),
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2">{row.original.toolName}</Typography>
            {row.original.verb && (
              <Typography variant="caption" color="text.secondary">{row.original.verb}</Typography>
            )}
          </Box>
        ),
      },
      {
        accessorKey: 'dataClass',
        header: t('mcp.egress.dataClass'),
        Cell: ({ cell }) => (
          <SeverityChip severity={dataClassSeverity(cell.getValue<string>())} label={cell.getValue<string>()} size="sm" />
        ),
      },
      {
        accessorKey: 'targetTrust',
        header: t('mcp.egress.target'),
        Cell: ({ cell }) => (
          <SeverityChip severity={targetTrustSeverity(cell.getValue<string>())} label={cell.getValue<string>()} size="sm" />
        ),
      },
      {
        accessorKey: 'effective',
        header: t('mcp.egress.decision'),
        Cell: ({ cell }) => {
          const v = cell.getValue<string | undefined>()
          return v ? <SeverityChip severity={decisionSeverity(v)} label={v} size="sm" /> : <span>—</span>
        },
      },
      {
        accessorKey: 'occurredAt',
        header: t('mcp.egress.when'),
        Cell: ({ cell }) => (
          <Typography variant="caption" color="text.secondary">
            {new Date(cell.getValue<string>()).toLocaleString()}
          </Typography>
        ),
      },
    ],
    [],
  )

  if (egressQ.isLoading) {
    return <LoadingState variant="spinner" py={4} />
  }
  if (egressQ.isError) {
    return <QueryError error={egressQ.error} onRetry={egressQ.refetch} label={t('mcp.egress.total')} compact />
  }
  if (!data || data.total === 0) {
    return (
      <EmptyStateGuide
        icon={<ShieldAlert size={28} />}
        title={t('mcp.egress.empty')}
        description={t('mcp.egress.emptyHint')}
        py={4}
      />
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5, mb: 2 }}>
        <KpiCard label={t('mcp.egress.total')} value={data.total} />
        <KpiCard label={t('mcp.egress.blocked')} value={data.blocked} />
        <KpiCard label={t('mcp.egress.classes')} value={Object.keys(data.byDataClass).length} />
        <KpiCard label={t('mcp.egress.targets')} value={Object.keys(data.byTargetTrust).length} />
      </Box>

      {donutData.length > 0 && (
        <Box sx={{ mb: 2, maxWidth: 420 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {t('mcp.egress.byClass')}
          </Typography>
          <DonutChart data={donutData} height={260} totalLabel={t('mcp.egress.events')} />
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {t('mcp.egress.rowsHint')}
      </Typography>
      <DataTable
        columns={columns}
        data={data.rows}
        onRowClick={(r) => setExplainEventId(r.eventId)}
        maxBodyHeight={360}
        emptyText={t('mcp.egress.empty')}
      />

      <MCPEventExplanationDrawer
        orgId={orgId}
        eventId={explainEventId}
        onClose={() => setExplainEventId(null)}
      />
    </Box>
  )
}
