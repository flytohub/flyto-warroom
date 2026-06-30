import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cloud } from 'lucide-react'
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from '@mui/material'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { listCSPMFindings, type CSPMFinding } from '@lib/engine'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { SeverityChip } from '@atoms/SeverityChip'
import { StatusDot } from '@atoms/StatusDot'
import { LoadingState } from '@atoms/LoadingState'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { QueryError } from '@atoms/QueryError'

// CloudFindingsView — top-level CSPM findings page. Promoted out of the
// war-room `sec-cspm` item (scanning/CSPM.tsx) into the Cloud pillar.
// Reads the existing `listCSPMFindings` endpoint; severity via the shared
// SeverityChip; states via the shared atoms (page conventions).

const PROVIDER_COLOR: Record<string, string> = {
  aws: '#ff9900', gcp: '#4285f4', azure: '#0078d4',
}

export function CloudFindingsView() {
  const { org } = useOrg()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.cloud.cspmFindings(org?.id),
    queryFn: () => listCSPMFindings(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const findings: CSPMFinding[] = data?.findings ?? []
  const byProvider = useMemo(() => {
    const m: Record<string, CSPMFinding[]> = {}
    for (const f of findings) {
      const p = f.provider.toLowerCase()
      ;(m[p] ??= []).push(f)
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [findings])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 3 } }}>
        <FlytoPageHeader
          title={t('cloud.findings.title')}
          subtitle={t('cloud.findings.subtitle')}
          count={findings.length > 0 ? findings.length : undefined}
          bottomGap={4}
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, md: 4 }, pb: 3 }}>
        {isLoading && <LoadingState rows={8} />}
        {isError && <QueryError error={error} onRetry={refetch} label={t('cloud.findings.title')} />}
        {!isLoading && !isError && findings.length === 0 && (
          <EmptyStateGuide
            icon={<Cloud size={28} />}
            title={t('cloud.findings.emptyTitle')}
            description={t('cloud.findings.empty')}
          />
        )}
        {!isLoading && !isError && findings.length > 0 && byProvider.map(([provider, rows], pi) => (
          <Box key={provider} sx={{ mt: pi === 0 ? 0 : 3 }}>
            <Box className="flex items-center gap-2" sx={{ mb: 1 }}>
              <StatusDot color={PROVIDER_COLOR[provider] ?? 'grey.500'} size={8} />
              <Typography variant="overline" fontWeight={600} letterSpacing="0.04em">{provider}</Typography>
              <Typography variant="body2" color="text.secondary">({rows.length})</Typography>
            </Box>
            <Paper variant="outlined" sx={{ borderColor: 'divider', overflow: 'hidden' }}>
              <TableContainer>
                <Table sx={{ '& td, & th': { py: 1.25, fontSize: 13 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.check')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.resource')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.region')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.severity')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map(f => (
                      <TableRow key={f.id} hover title={f.guideline ?? ''}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500} color="text.primary">{f.rule_title}</Typography>
                          <Typography variant="body2" color="text.secondary">{f.rule_id}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500} color="text.secondary" sx={{ fontFamily: 'monospace' }}>{f.resource_id}</Typography>
                          <Typography variant="body2" color="text.secondary">{f.resource_type}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">{f.region ?? '—'}</Typography>
                        </TableCell>
                        <TableCell><SeverityChip severity={f.severity} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
