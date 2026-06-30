/**
 * McpEgressView — sensitive-data egress risk over agent tool calls, backed
 * by GET /mcp/risk/egress. Rolls up what data classes are leaving, to how
 * trusted a target, how much the guardian actually blocked, and lists the
 * individual egress calls. Each row opens the decision explanation drawer.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import { Radiation, ShieldCheck } from 'lucide-react'
import { getMcpEgress } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { McpExplanationDrawer } from './McpExplanationDrawer'

const BRAND = '#7c3aed'

const TRUST_TONE: Record<string, string> = {
  untrusted: '#ef4444', external: '#f59e0b', partner: '#f59e0b',
  internal: '#16a34a', trusted: '#16a34a',
}
const EFFECT_TONE: Record<string, string> = {
  block: '#ef4444', hold: '#ef4444', deny: '#ef4444',
  allow: '#16a34a', proceed: '#16a34a', flag: '#f59e0b',
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, flex: 1, minWidth: 140 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="h5" fontWeight={800} sx={{ color: tone ?? 'text.primary' }}>{value}</Typography>
    </Paper>
  )
}

function CountStrip({ title, counts, toneMap }: { title: string; counts: Record<string, number>; toneMap?: Record<string, string> }) {
  const entries = Object.entries(counts)
  if (entries.length === 0) return null
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </Typography>
      {entries.map(([k, n]) => (
        <Chip key={k} size="small" label={`${k}: ${n}`}
          sx={{ height: 22, fontSize: 12, fontWeight: 700, color: toneMap?.[k.toLowerCase()] ?? 'text.primary' }} />
      ))}
    </Box>
  )
}

export function McpEgressView({ orgId }: { orgId: string }) {
  const [eventId, setEventId] = useState<string | null>(null)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.mcp.egress(orgId),
    queryFn: () => getMcpEgress(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  if (isLoading) {
    return <LoadingState variant="spinner" py={10} />
  }

  if (isError) {
    return <Box sx={{ p: 3 }}><QueryError error={error} onRetry={refetch} label={t('agentFirewall.egressRows')} compact /></Box>
  }

  if (!data || data.total === 0) {
    return (
      <EmptyStateGuide
        icon={<ShieldCheck size={28} />}
        title={t('mcp.egressCleanTitle')}
        description={t('agentFirewall.egressCleanDesc')}
        py={6}
      />
    )
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Tile label={t('mcp.egressTotal')} value={String(data.total)} />
        <Tile label={t('mcp.egressBlocked')} value={String(data.blocked)}
          tone={data.blocked > 0 ? '#16a34a' : 'text.secondary'} />
        <Tile label={t('mcp.egressClasses')} value={String(Object.keys(data.byDataClass).length)} />
        <Tile label={t('mcp.egressTargets')} value={String(Object.keys(data.byTargetTrust).length)} />
      </Box>

      <CountStrip title={t('mcp.byDataClass')} counts={data.byDataClass} />
      <CountStrip title={t('mcp.byTargetTrust')} counts={data.byTargetTrust} toneMap={TRUST_TONE} />

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Radiation size={16} style={{ color: BRAND }} />
          <Typography variant="subtitle2" fontWeight={700}>{t('agentFirewall.egressRows')}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {t('mcp.clickRowExplain')}
          </Typography>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('mcp.colTool')}</TableCell>
              <TableCell>{t('mcp.dataClass')}</TableCell>
              <TableCell>{t('mcp.targetTrust')}</TableCell>
              <TableCell>{t('mcp.colEffect')}</TableCell>
              <TableCell align="right">{t('mcp.colWhen')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.eventId} hover sx={{ cursor: 'pointer' }} onClick={() => setEventId(r.eventId)}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {r.toolName}{r.verb ? ` · ${r.verb}` : ''}
                  {r.externalSideEffect && <Chip size="small" label={t('mcp.sideEffect')} sx={{ ml: 0.75, height: 18, fontSize: 12, color: '#f59e0b' }} />}
                </TableCell>
                <TableCell sx={{ fontSize: 13 }}>{r.dataClass || '—'}</TableCell>
                <TableCell sx={{ fontSize: 13, color: TRUST_TONE[(r.targetTrust || '').toLowerCase()] ?? 'text.primary', fontWeight: 600 }}>
                  {r.targetTrust || '—'}
                </TableCell>
                <TableCell sx={{ fontSize: 13, fontWeight: 700, color: EFFECT_TONE[(r.effective || '').toLowerCase()] ?? 'text.secondary' }}>
                  {r.effective || '—'}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {r.occurredAt.replace('T', ' ').replace('Z', '')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <McpExplanationDrawer orgId={orgId} eventId={eventId} onClose={() => setEventId(null)} />
    </Box>
  )
}
