import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cloud } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { listCSPMFindings, type CSPMFinding } from '@lib/engine'
import { QueryError } from '@atoms/QueryError'
import { Empty, Loading, SevBadge, ScanViewRoot, ScanViewHeader } from './_shared'
import { CloudPostureHeader } from './PostureHeader'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

const PROVIDER_COLOR: Record<string, string> = {
  aws: '#ff9900',
  gcp: '#4285f4',
  azure: '#0078d4',
}

export function CSPMScanView() {
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
      if (!m[p]) m[p] = []
      m[p].push(f)
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [findings])

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={Cloud}
        gradient="linear-gradient(135deg, #ef4444, #f97316)"
        title={t('scoring.cspmScan')}
        subtitle={t('warroom.cspmSub')}
        count={findings.length}
      />

      <CloudPostureHeader />

      <Paper elevation={1} className="rounded-xl" sx={{
        bgcolor: 'background.paper', flex: 1, minHeight: 0,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {isLoading && <Loading />}

        {isError && !isLoading && (
          <Box sx={{ m: 3 }}>
            <QueryError error={error} onRetry={refetch} label={t('scoring.cspmScan')} compact />
          </Box>
        )}

        {!isLoading && !isError && findings.length === 0 && (
          <Empty
            icon={Cloud}
            text={t('warroom.cspmEmptyTitle')}
            description={t('warroom.cspmEmpty')}
          />
        )}

        {!isLoading && !isError && findings.length > 0 && (
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {byProvider.map(([provider, rows], pi) => (
              <Box key={provider} sx={{ mt: pi === 0 ? 0 : 3 }}>
                <Box className="flex items-center gap-2 mb-2">
                  <Box
                    component="span"
                    sx={{
                      width: 8, height: 8, borderRadius: '50%',
                      bgcolor: PROVIDER_COLOR[provider] ?? 'grey.500',
                    }}
                  />
                  <Typography variant="overline" fontWeight={600} letterSpacing="0.04em">
                    {provider}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ({rows.length})
                  </Typography>
                </Box>

                <TableContainer>
                  <Table stickyHeader sx={{ '& td, & th': { py: 1.5, fontSize: 13 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colCheck')}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colResource')}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colRegion')}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colSeverity')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((f) => (
                        <TableRow key={f.id} hover title={f.guideline ?? ''}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500} color="text.primary">
                              {f.rule_title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {f.rule_id}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500} color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                              {f.resource_id}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {f.resource_type}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {f.region ?? '\u2014'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <SevBadge severity={f.severity} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </ScanViewRoot>
  )
}
