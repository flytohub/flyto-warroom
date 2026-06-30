/**
 * AuditTrailTab — tenant audit trail + SHA-256 hash-chain verification.
 *
 * Wires GET /api/v1/audit?workspace_id=…&verify=true (handleListAudit).
 * Each entry chains to its predecessor (entryHash/prevHash); verify=true
 * makes the engine walk the full chain and report tamper-evidence. This
 * tamper-evident log previously had a client fn for nobody — no viewer.
 * In this product the org id IS the workspace id.
 *
 * Client fn imported by DIRECT FILE PATH per the decoupling rule.
 */
import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { ScrollText, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { DataTable, type MRT_ColumnDef } from '@compounds/_shared'
import { listAudit, type AuditLog } from '@lib/engine/platform/audit'
import { sectionTitleSx, accentCardSx } from './shared'

export function AuditTrailTab() {
  const { org } = useOrg()
  const wsId = org?.id
  const enabled = !!wsId

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.platform.auditTrail(wsId),
    queryFn: () => listAudit(wsId!, { limit: 200, verify: true }),
    enabled,
    staleTime: 30_000,
  })

  const logs = data?.logs ?? []
  const verification = data?.verification

  const columns = useMemo<MRT_ColumnDef<AuditLog>[]>(
    () => [
      {
        accessorKey: 'timestamp',
        header: t('settings.audit.col.time'),
        Cell: ({ cell }) => new Date(cell.getValue<string>()).toLocaleString(),
        size: 180,
      },
      { accessorKey: 'action', header: t('settings.audit.col.action'), size: 200 },
      { accessorKey: 'resourceType', header: t('settings.audit.col.resource'), size: 140 },
      {
        accessorKey: 'result',
        header: t('settings.audit.col.result'),
        size: 110,
        Cell: ({ cell }) => {
          const v = cell.getValue<string>()
          const ok = v === 'success' || v === 'allow' || v === ''
          return (
            <Chip
              label={v || '—'}
              size="small"
              sx={{ height: 20, fontSize: 12, fontWeight: 600, bgcolor: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: ok ? '#22c55e' : '#ef4444' }}
            />
          )
        },
      },
      { accessorKey: 'actorId', header: t('settings.audit.col.actor'), size: 160 },
    ],
    [],
  )

  if (!enabled) {
    return (
      <Box sx={{ ...accentCardSx('#a78bfa'), p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('settings.audit.noOrg')}
        </Typography>
      </Box>
    )
  }

  return (
    <>
      <Box sx={sectionTitleSx}>
        <ScrollText size={15} style={{ color: '#a78bfa', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.audit.title')}
        </Typography>
        {logs.length > 0 && (
          <Chip label={logs.length} size="small" sx={{ height: 20, fontSize: 13, fontWeight: 600, ml: 1, bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa' }} />
        )}
        {/* Hash-chain tamper-evidence badge. */}
        {verification && (
          <Chip
            icon={verification.chain_intact ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
            label={
              verification.chain_intact
                ? t('settings.audit.intact')
                : t('settings.audit.broken')
            }
            size="small"
            sx={{
              height: 22,
              fontSize: 12,
              fontWeight: 700,
              ml: 1,
              bgcolor: verification.chain_intact ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color: verification.chain_intact ? '#22c55e' : '#ef4444',
            }}
          />
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.5 }}>
        {t('settings.audit.desc')}
        {verification && !verification.chain_intact && verification.error
          ? ` — ${verification.error}`
          : ''}
      </Typography>

      {isLoading && (
        <LoadingState variant="spinner" py={5} />
      )}

      {!isLoading && isError && (
        <QueryError error={error} onRetry={refetch} label={t('settings.audit.title')} compact />
      )}

      {!isLoading && !isError && (
        <DataTable
          columns={columns}
          data={logs}
          isLoading={isLoading}
          maxBodyHeight={520}
          emptyText={t('settings.audit.empty')}
        />
      )}
    </>
  )
}
