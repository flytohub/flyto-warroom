import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Scale, Search } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { listLicenseIssues } from '@lib/engine'
import { Pagination } from '@atoms/Pagination'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { Empty, Loading, SevBadge, ScanViewRoot, ScanViewHeader } from './_shared'
import { QueryError } from '@atoms/QueryError'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Typography,
} from '@mui/material'

const LICENSE_PAGE_SIZE = 50

export function LicenseScanView() {
  const { org } = useOrg()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.scanning.licenseIssues(org?.id),
    queryFn: () => listLicenseIssues(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const reposQ = useConnectedRepos(org?.id)
  const repoCount = reposQ.data?.length ?? 0

  const issues = data?.issues ?? []

  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<string>('')
  const [licenseFilter, setLicenseFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const riskOptions = useMemo(
    () => Array.from(new Set(issues.map(i => i.risk_level).filter(Boolean))).sort(),
    [issues],
  )
  const licenseOptions = useMemo(
    () => Array.from(new Set(issues.map(i => i.license_id).filter(Boolean))).sort(),
    [issues],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return issues.filter(i => {
      if (riskFilter && i.risk_level !== riskFilter) return false
      if (licenseFilter && i.license_id !== licenseFilter) return false
      if (q
        && !i.package_name.toLowerCase().includes(q)
        && !i.license_id.toLowerCase().includes(q)
      ) return false
      return true
    })
  }, [issues, search, riskFilter, licenseFilter])

  useEffect(() => { setPage(1) }, [search, riskFilter, licenseFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / LICENSE_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedRows = filtered.slice((safePage - 1) * LICENSE_PAGE_SIZE, safePage * LICENSE_PAGE_SIZE)

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={Scale}
        gradient="linear-gradient(135deg, #ef4444, #f97316)"
        title={t('scoring.licenseScan')}
        subtitle={`${filtered.length.toLocaleString('en-US')} / ${issues.length.toLocaleString('en-US')} ${t('warroom.licenseSub')}`}
        count={issues.length}
      />

      {/* Filters — pinned */}
      {issues.length > 0 && (
        <Box className="flex items-center gap-2 flex-wrap" sx={{ flexShrink: 0 }}>
          <TextField
            size="small"
            placeholder={t('warroom.licenseSearch')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={14} />
                  </InputAdornment>
                ),
                sx: { fontSize: 13 },
              },
            }}
            sx={{ flex: 1, minWidth: 180 }}
          />
          <FlytoSelect
            value={riskFilter}
            onChange={setRiskFilter}
            placeholder={t('warroom.licenseAllRisks')}
            options={[
              { value: '', label: t('warroom.licenseAllRisks') },
              ...riskOptions.map(r => ({ value: r, label: r })),
            ]}
            minWidth={140}
            maxWidth={180}
            aria-label={t('warroom.licenseAllRisks')}
          />
          <FlytoSelect
            value={licenseFilter}
            onChange={setLicenseFilter}
            placeholder={`${t('warroom.licenseAllLicenses')} (${licenseOptions.length})`}
            options={[
              { value: '', label: `${t('warroom.licenseAllLicenses')} (${licenseOptions.length})` },
              ...licenseOptions.map(l => ({ value: l, label: l })),
            ]}
            minWidth={160}
            maxWidth={220}
            aria-label={t('warroom.licenseAllLicenses')}
          />
        </Box>
      )}

      {/* Body */}
      {isLoading && <Loading />}
      {isError && !isLoading && (
        <Box sx={{ p: 3 }}>
          <QueryError error={error} onRetry={refetch} label={t('warroom.licenseAllLicenses')} compact />
        </Box>
      )}
      {!isLoading && !isError && issues.length === 0 && repoCount === 0 && (
        <Empty
          icon={Scale}
          text={t('warroom.licenseNoReposTitle')}
          description={t('warroom.licenseNoRepos')}
        />
      )}
      {!isLoading && !isError && issues.length === 0 && repoCount > 0 && (
        <Empty
          icon={Scale}
          text={t('warroom.licenseNotScannedTitle')}
          description={t('warroom.licenseNotScannedYet')}
        />
      )}
      {!isLoading && !isError && filtered.length === 0 && issues.length > 0 && (
        <Empty
          icon={Scale}
          text={t('warroom.findingNoMatchTitle')}
          description={t('warroom.findingNoMatch')}
        />
      )}

      {pagedRows.length > 0 && (
        <Paper elevation={1} className="rounded-xl" sx={{
          bgcolor: 'background.paper', flex: 1, minHeight: 0,
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <TableContainer sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <Table stickyHeader sx={{ '& td, & th': { py: 1.5, fontSize: 13 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colPackage')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colLicense')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colRisk')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{t('warroom.colReason')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRows.map((l) => (
                  <TableRow key={l.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} color="text.primary">
                        {l.package_name}
                      </Typography>
                      {l.package_version && (
                        <Typography variant="body2" color="text.secondary"> {l.package_version}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }} color="text.secondary">
                        {l.license_id}
                      </Typography>
                    </TableCell>
                    <TableCell><SevBadge severity={l.risk_level} /></TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {l.reason || '--'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {filtered.length > LICENSE_PAGE_SIZE && (
        <Box sx={{ flexShrink: 0 }}>
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={LICENSE_PAGE_SIZE}
            onPageChange={setPage}
          />
        </Box>
      )}
    </ScanViewRoot>
  )
}
