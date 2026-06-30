import { useQuery } from '@tanstack/react-query'
import { FileCode } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { listIaCFindings } from '@lib/engine'
import { Empty, Loading, SevBadge, ScanViewRoot, ScanViewHeader } from './_shared'
import { QueryError } from '@atoms/QueryError'
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

export function IaCScanView() {
  const { org } = useOrg()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.scanning.iacFindings(org?.id),
    queryFn: () => listIaCFindings(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const findings = data?.findings ?? []

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={FileCode}
        gradient="linear-gradient(135deg, #ef4444, #f97316)"
        title={t('scoring.iacScan')}
        subtitle={t('warroom.iacSub')}
        count={findings.length}
      />

      <Paper elevation={1} className="rounded-xl" sx={{
        bgcolor: 'background.paper', flex: 1, minHeight: 0,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {isLoading && <Loading />}

        {isError && !isLoading && (
          <Box sx={{ p: 3 }}>
            <QueryError error={error} onRetry={refetch} label={t('scoring.iacScan')} compact />
          </Box>
        )}

        {!isLoading && !isError && findings.length === 0 && (
          <Empty
            icon={FileCode}
            text={t('warroom.iacNone')}
            description={t('warroom.iacEmptyDesc')}
          />
        )}

        {!isLoading && !isError && findings.length > 0 && (
          <TableContainer sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <Table stickyHeader sx={{ '& td, & th': { py: 1.5, fontSize: 13 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colCheck')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colFile')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colResource')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colSeverity')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colFramework')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {findings.map((f) => (
                  <TableRow key={f.id} hover title={f.guideline ?? ''}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} color="text.primary">
                        {f.check_name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {f.check_id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>
                        {f.file_path}{f.line ? `:${f.line}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {f.resource_type}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <SevBadge severity={f.severity} />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={f.framework}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: 12 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </ScanViewRoot>
  )
}
