import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Typography from '@mui/material/Typography'
import { ShieldCheck, ShieldQuestion, ExternalLink, ChevronRight } from 'lucide-react'
import { t } from '@lib/i18n';
import type { PentestProject } from '@lib/engine'
import { useDiscoveryStatus } from '@hooks/useDiscoveryStatus'
import { PROJECT_TYPES, ENV_COLORS, ROLE_COLORS, type DomainIssue, timeAgo } from './types'

interface DomainTableProps {
  paged: Array<{
    domain: string
    url: string
    type: string
    project?: PentestProject
    issues: DomainIssue[]
    lastScan: string
    /** Bridge-mirrored asset_states.status — 'active' shows clean,
     *  'inconclusive' shows a "?" chip, 'refuted' is hidden upstream. */
    verifierStatus?: 'active' | 'inconclusive' | 'refuted'
  }>
  onSelect: (domain: string) => void
}

export function DomainTable({ paged, onSelect }: DomainTableProps) {
  const { isScanning } = useDiscoveryStatus()
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>{t('dast.domainName')}</TableCell>
          <TableCell sx={{ fontWeight: 700, fontSize: 12, width: 100 }}>{t('issues.type')}</TableCell>
          <TableCell sx={{ fontWeight: 700, fontSize: 12, width: 120 }}>{t('nav.issues')}</TableCell>
          <TableCell sx={{ fontWeight: 700, fontSize: 12, width: 100 }}>{t('pentest.lastScan')}</TableCell>
          <TableCell sx={{ width: 40 }} />
        </TableRow>
      </TableHead>
      <TableBody>
        {paged.map((row) => {
          const typeInfo = PROJECT_TYPES.find(t => t.id === row.project?.project_type) ?? PROJECT_TYPES[0]
          const critical = row.issues.filter(i => i.severity === 'CRITICAL').length
          const high = row.issues.filter(i => i.severity === 'HIGH').length
          const medium = row.issues.filter(i => i.severity === 'MEDIUM').length
          const low = row.issues.filter(i => i.severity === 'LOW').length

          return (
            <TableRow
              key={row.domain}
              hover
              onClick={() => onSelect(row.domain)}
              sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }}
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(row.domain) } }}
              aria-label={`${row.url} ${t(row.type)}`}
            >
              <TableCell>
                <Box className="flex items-center gap-2">
                  <ExternalLink size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                  <Typography variant="body2" noWrap>{row.url}</Typography>
                  {row.project?.environment && (
                    <Chip
                      label={ENV_COLORS[row.project.environment]?.label ?? row.project.environment}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: 12,
                        color: ENV_COLORS[row.project.environment]?.color ?? 'text.secondary',
                        borderColor: ENV_COLORS[row.project.environment]?.color ?? 'divider',
                      }}
                      variant="outlined"
                    />
                  )}
                  {row.project && isScanning(row.project.id) && (
                    <Chip
                      icon={<CircularProgress size={10} />}
                      label={t('domains.scanning')}
                      size="small"
                      sx={{ height: 18, fontSize: 12, bgcolor: '#38bdf818', color: '#38bdf8' }}
                    />
                  )}
                  {row.project?.role === 'subscribe' && (
                    <Chip
                      label={t('domains.subscribe')}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: 12,
                        color: ROLE_COLORS.subscribe.color,
                        borderColor: ROLE_COLORS.subscribe.color,
                      }}
                      variant="outlined"
                    />
                  )}
                  {row.verifierStatus === 'inconclusive' && (
                    <Chip
                      icon={<ShieldQuestion size={10} />}
                      label={t('domains.unverified')}
                      size="small"
                      title={t('domains.unverifiedTip')}
                      sx={{
                        // Unverified == medium severity (uncertain
                        // state) — align to canonical severity.medium
                        // token (#eab308) instead of legacy ambers.
                        height: 18,
                        fontSize: 12,
                        bgcolor: '#eab30818',
                        color: '#eab308',
                        borderColor: '#eab308',
                      }}
                      variant="outlined"
                    />
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="caption" sx={{ color: typeInfo.color, fontWeight: 600 }}>
                  {t(row.type)}
                </Typography>
              </TableCell>
              <TableCell>
                {row.issues.length > 0 ? (
                  <Box className="flex items-center gap-1">
                    {critical > 0 && <Chip label={critical} size="small" color="error" sx={{ height: 20, fontSize: 13, fontWeight: 700 }} />}
                    {high > 0 && <Chip label={high} size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: 13, fontWeight: 700 }} />}
                    {medium > 0 && <Chip label={medium} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: 13, fontWeight: 700 }} />}
                    {low > 0 && <Chip label={low} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: 13, fontWeight: 700 }} />}
                  </Box>
                ) : (
                  <Box className="flex items-center gap-1" sx={{ color: 'text.secondary' }}>
                    <ShieldCheck size={13} />
                    <Typography variant="caption">0</Typography>
                  </Box>
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {row.lastScan ? timeAgo(row.lastScan) : '--'}
                </Typography>
              </TableCell>
              <TableCell>
                <ChevronRight size={14} style={{ opacity: 0.3 }} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
