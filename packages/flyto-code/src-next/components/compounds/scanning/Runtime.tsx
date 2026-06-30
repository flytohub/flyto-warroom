import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Radio, ShieldAlert, ShieldCheck } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { listRuntimeEvents, type RASPCoverageSummary, type RuntimeEvent } from '@lib/engine'
import { QueryError } from '@atoms/QueryError'
import { Empty, Loading, ScanViewRoot, ScanViewHeader } from './_shared'
import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'

const TYPE_COLOR: Record<string, string> = {
  sql_injection:       '#ef4444',
  command_injection:   '#ef4444',
  rce_attempt:         '#ef4444',
  path_traversal:      '#f97316',
  ssrf:                '#f97316',
  unauthenticated_hit: '#eab308',
  rate_limit_breach:   '#eab308',
  suspicious_payload:  '#eab308',
  rasp_heartbeat:      '#22c55e',
  rasp_coverage_gap:   '#ef4444',
  info:                '#94a3b8',
}

const TYPE_MUI_COLOR: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  sql_injection:       'error',
  command_injection:   'error',
  rce_attempt:         'error',
  path_traversal:      'warning',
  ssrf:                'warning',
  unauthenticated_hit: 'warning',
  rate_limit_breach:   'warning',
  suspicious_payload:  'warning',
  rasp_heartbeat:      'info',
  rasp_coverage_gap:   'error',
  info:                'default',
}

const RASP_STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  covered: 'success',
  degraded: 'warning',
  stale: 'warning',
  no_agent: 'error',
  no_heartbeat: 'warning',
  unsupported: 'error',
  not_configured: 'warning',
  not_collected: 'warning',
  scan_failed: 'error',
  permission_denied: 'error',
  rate_limited: 'warning',
  unknown: 'default',
}

const RASP_STATUS_LABEL: Record<string, string> = {
  covered: 'Telemetry covered',
  degraded: 'Coverage degraded',
  stale: 'Heartbeat stale',
  no_agent: 'No agent observed',
  no_heartbeat: 'No heartbeat',
  unsupported: 'Unsupported runtime',
  not_configured: 'Not configured',
  not_collected: 'Not collected',
  scan_failed: 'Scan failed',
  permission_denied: 'Permission denied',
  rate_limited: 'Rate limited',
  unknown: 'Unknown',
}

export function RuntimeEventsView() {
  const { org } = useOrg()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.platform.runtimeEvents(org?.id),
    queryFn: () => listRuntimeEvents(org!.id, 500),
    enabled: !!org?.id,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const events: RuntimeEvent[] = data?.events ?? []
  const raspCoverage = data?.rasp_coverage ?? defaultRASPCoverage()
  const runtimeErrorCoverage = isError ? unavailableRASPCoverage(error) : null

  const rollup = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of events) m[e.event_type] = (m[e.event_type] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [events])

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={Activity}
        gradient="linear-gradient(135deg, #ef4444, #f97316)"
        title={t('scoring.runtimeEvents')}
        subtitle={t('warroom.runtimeSub')}
        count={events.length}
        countColor="warning.main"
      />

      <Paper elevation={1} className="rounded-xl" sx={{
        bgcolor: 'background.paper', flex: 1, minHeight: 0,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {isLoading && <Loading />}

        {isError && !isLoading && (
          <>
            <RASPCoveragePanel coverage={runtimeErrorCoverage!} />
            <Box sx={{ m: 3 }}>
              <QueryError error={error} onRetry={refetch} label={t('warroom.runtimeUnavailableTitle')} compact />
            </Box>
          </>
        )}

        {!isLoading && !isError && events.length === 0 && (
          <>
            <RASPCoveragePanel coverage={raspCoverage} />
            <Empty
              icon={ShieldAlert}
              text={t('warroom.runtimeEmptyTitle')}
              description={t('warroom.runtimeEmpty')}
            />
          </>
        )}

        {!isLoading && !isError && events.length > 0 && (
          <>
            <RASPCoveragePanel coverage={raspCoverage} />

            {/* Type rollup chips — pinned */}
            <Box className="flex flex-wrap gap-2" sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
              {rollup.map(([type, n]) => (
                <Chip
                  key={type}
                  label={`${type}: ${n}`}
                  size="small"
                  color={TYPE_MUI_COLOR[type] ?? 'default'}
                  variant="outlined"
                  sx={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
                />
              ))}
            </Box>

            {/* Scrollable table */}
            <TableContainer sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
              <Table stickyHeader sx={{ '& td, & th': { py: 1.5, fontSize: 13 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colWhen')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colSource')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colType')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colThreat')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colPath')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colDecision')}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colIP')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id} hover title={e.details ?? ''}>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {e.received_at?.slice(11, 19) ?? '\u2014'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={e.source === 'rasp' ? 'info' : 'default'}
                          label={e.source === 'rasp' ? (e.service || e.agent_id || 'RASP') : 'Runtime SDK'}
                          sx={{ maxWidth: 180, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          fontWeight={600}
                          sx={{ color: TYPE_COLOR[e.event_type] ?? 'text.secondary' }}
                        >
                          {e.event_type}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }} noWrap title={e.threat ?? ''}>
                          {e.threat || '\u2014'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }} noWrap>
                          {e.path || '\u2014'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={e.decision === 'blocked' ? 'error' : e.decision === 'gap' ? 'warning' : 'default'}
                            label={e.decision || 'observed'}
                          />
                          {e.coverage_status && (
                            <Chip
                              size="small"
                              variant="outlined"
                              color={RASP_STATUS_COLOR[e.coverage_status] ?? 'default'}
                              label={RASP_STATUS_LABEL[e.coverage_status] ?? e.coverage_status}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {e.ip || '\u2014'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>
    </ScanViewRoot>
  )
}

function defaultRASPCoverage(): RASPCoverageSummary {
  return {
    status: 'no_agent',
    gap_reason: 'No RASP agent telemetry has been observed in the returned window.',
    stale_after_sec: 900,
    services: [],
  }
}

function unavailableRASPCoverage(error: unknown): RASPCoverageSummary {
  const requestId = typeof error === 'object' && error !== null && 'requestId' in error
    ? String((error as { requestId?: unknown }).requestId || '')
    : ''
  const message = error instanceof Error && error.message
    ? `Engine read failed: ${error.message}.`
    : 'Engine read failed.'
  return {
    status: 'not_collected',
    gap_reason: requestId
      ? `${message} Request ID: ${requestId}. Coverage cannot be confirmed.`
      : `${message} Coverage cannot be confirmed.`,
    stale_after_sec: 900,
    services: [],
  }
}

function RASPCoveragePanel({ coverage }: { coverage: RASPCoverageSummary }) {
  const theme = useTheme()
  const services = Array.isArray(coverage.services) ? coverage.services : []
  const status = coverage.status || 'unknown'
  const serviceCount = services.length
	  const gapReason = coverage.gap_reason || (status === 'covered' ? t('hardcoded.heartbeat.evidence.observed.coverage.state.is.not.confirmed.39670378') : t('hardcoded.coverage.state.is.not.confirmed.d8869fa9'))
  const emptyAgentValue = status === 'not_collected' || status === 'scan_failed' || status === 'permission_denied'
    ? status
    : status === 'unknown'
      ? 'unknown'
      : 'no_agent'
  const emptyAgentDetail = status === 'not_collected'
    ? t('hardcoded.runtime.telemetry.read.failed.this.is.a.data.6a584ead')
    : status === 'scan_failed' || status === 'permission_denied'
      ? t('hardcoded.runtime.telemetry.could.not.be.collected.coverage.is.0060027b')
      : 'No heartbeat has been received. This is a coverage gap, not proof of safety.'
  const Icon = status === 'covered' ? ShieldCheck : status === 'no_agent' ? ShieldAlert : AlertTriangle
  const color = status === 'covered'
    ? theme.palette.success.main
    : status === 'no_agent' || status === 'unsupported' || status === 'scan_failed' || status === 'permission_denied'
      ? theme.palette.error.main
      : theme.palette.warning.main

  return (
    <Box sx={{
      m: 2,
      mb: 1,
      flexShrink: 0,
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', lg: 'minmax(260px, 1.2fr) minmax(0, 2fr)' },
      gap: 1.5,
    }}>
      <Box sx={{
        border: '1px solid',
        borderColor: alpha(color, theme.palette.mode === 'dark' ? 0.42 : 0.3),
        borderRadius: 1,
        bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.12 : 0.07),
        p: 1.5,
        display: 'grid',
        gridTemplateColumns: '36px minmax(0, 1fr)',
        gap: 1.25,
        alignItems: 'center',
      }}>
        <Box sx={{
          width: 36,
          height: 36,
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          bgcolor: alpha(color, 0.12),
        }}>
          <Icon size={20} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, lineHeight: 1 }}>
            RASP coverage
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            <Chip
              size="small"
              color={RASP_STATUS_COLOR[status] ?? 'default'}
              label={RASP_STATUS_LABEL[status] ?? status}
              sx={{ fontWeight: 700 }}
            />
            <Chip size="small" variant="outlined" icon={<Radio size={14} />} label={`${serviceCount} agents`} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.45 }}>
            {gapReason}
          </Typography>
        </Box>
      </Box>

      <Box sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
        gap: 1,
        alignItems: 'stretch',
      }}>
        {services.length === 0 ? (
          <RuntimeFact
            label={t('hardcoded.agent.state.33c5e62b')}
            value={emptyAgentValue}
            detail={emptyAgentDetail}
          />
        ) : services.slice(0, 3).map((svc) => (
          <RuntimeFact
            key={svc.agent_id}
            label={svc.service || svc.agent_id}
            value={RASP_STATUS_LABEL[svc.status] ?? svc.status}
            detail={[
              svc.runtime,
              svc.environment,
              svc.last_heartbeat ? `heartbeat ${svc.last_heartbeat.slice(11, 19)}` : 'no heartbeat',
              svc.gap_reason,
            ].filter(Boolean).join(' / ')}
          />
        ))}
      </Box>
    </Box>
  )
}

function RuntimeFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Box sx={{
      minWidth: 0,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      p: 1.25,
      bgcolor: 'background.default',
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="subtitle2" color="text.primary" sx={{ fontWeight: 800, mt: 0.25 }} noWrap title={value}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.35 }}>
        {detail}
      </Typography>
    </Box>
  )
}
