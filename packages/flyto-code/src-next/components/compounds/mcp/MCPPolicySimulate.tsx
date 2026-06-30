import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Box, Typography, Alert, Button } from '@mui/material'
import { FlaskConical } from 'lucide-react'
import { t } from '@lib/i18n';
import { QueryError } from '@components/atoms/QueryError'
import {
  KpiCard, DataTable, SeverityChip, type MRT_ColumnDef,
} from '@compounds/_shared'
import {
  simulateMCPPolicy,
  type MCPRolloutMode, type MCPSimulateResult, type MCPPolicyFlip,
} from '@lib/engine/code/mcp'
import { decisionSeverity } from './mcpTokens'

// MCPPolicySimulate — dry-run a CANDIDATE policy over recent stored events
// before committing a real PUT. Shows the predicted decision mix and the flips
// (newly blocked / newly allowed vs what was recorded at ingest), so the user
// can judge "is it safe to move to enforce" without changing anything.

export function MCPPolicySimulate({
  orgId, mode, policyJson,
}: {
  orgId: string
  mode: MCPRolloutMode
  policyJson: string
}) {
  const [result, setResult] = useState<MCPSimulateResult | null>(null)

  const simMut = useMutation({
    // @closure local-result: policy simulation is read-only; the returned
    // decision diff is rendered below and no server cache changes.
    mutationFn: () => {
      let policy: unknown
      if (policyJson.trim()) {
        try {
          policy = JSON.parse(policyJson)
        } catch {
          throw new Error(t('mcp.sim.badJson'))
        }
      }
      return simulateMCPPolicy(orgId, { defaultMode: mode, policy })
    },
    onSuccess: (r) => setResult(r),
  })

  const flipColumns = useMemo<MRT_ColumnDef<MCPPolicyFlip>[]>(
    () => [
      {
        accessorKey: 'toolName',
        header: t('mcp.sim.tool'),
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
        id: 'change',
        header: t('mcp.sim.change'),
        Cell: ({ row }) => {
          const f = row.original
          const newlyBlocked = !f.wasBlocked && f.nowBlocked
          return (
            <SeverityChip
              severity={newlyBlocked ? 'critical' : 'low'}
              label={newlyBlocked ? t('mcp.sim.newlyBlocked') : t('mcp.sim.newlyAllowed')}
              size="sm"
            />
          )
        },
      },
      {
        accessorKey: 'verdict',
        header: t('mcp.sim.verdict'),
        Cell: ({ cell }) => (
          <SeverityChip severity={decisionSeverity(cell.getValue<string>())} label={cell.getValue<string>()} size="sm" />
        ),
      },
      {
        accessorKey: 'floorRule',
        header: t('mcp.sim.floorRule'),
        Cell: ({ cell }) => (
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }} color="text.secondary">
            {cell.getValue<string | undefined>() || '—'}
          </Typography>
        ),
      },
    ],
    [],
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <FlaskConical size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('mcp.sim.title')}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('mcp.sim.hint')}
      </Typography>

      <Button
        size="small"
        variant="outlined"
        disabled={!orgId || simMut.isPending}
        onClick={() => simMut.mutate()}
        sx={{ textTransform: 'none', mb: 2 }}
      >
        {simMut.isPending
          ? t('mcp.sim.running')
          : t('mcp.sim.run')}
      </Button>

      {simMut.isError && (
        <Box sx={{ mb: 2 }}>
          <QueryError error={simMut.error} label={t('mcp.sim.title')} compact />
        </Box>
      )}

      {result && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1.5, mb: 2 }}>
            <KpiCard label={t('mcp.sim.evaluated')} value={result.evaluated} />
            <KpiCard label={t('mcp.sim.wouldBlock')} value={result.wouldBlock} />
            <KpiCard label={t('mcp.sim.newlyBlocked')} value={result.newlyBlocked} />
            <KpiCard label={t('mcp.sim.newlyAllowed')} value={result.newlyAllowed} />
          </Box>

          {result.newlyBlocked > 0 && (
            <Alert severity="warning" sx={{ mb: 2, fontSize: 12 }}>
              {t('mcp.sim.warnBlocked')
                .replace('{n}', String(result.newlyBlocked))}
            </Alert>
          )}

          {result.sampleFlips.length > 0 ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {t('mcp.sim.flips')}
              </Typography>
              <DataTable
                columns={flipColumns}
                data={result.sampleFlips}
                maxBodyHeight={300}
                emptyText={t('mcp.sim.noFlips')}
              />
            </>
          ) : (
            <Alert severity="success" sx={{ fontSize: 12 }}>
              {t('mcp.sim.noFlips')}
            </Alert>
          )}
        </>
      )}
    </Box>
  )
}
