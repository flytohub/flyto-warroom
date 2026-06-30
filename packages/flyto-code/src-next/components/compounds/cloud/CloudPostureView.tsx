import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cloud, Plus } from 'lucide-react'
import {
  Box, Paper, Button, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow,
} from '@mui/material'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { getCloudPosture } from '@lib/engine'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { StatTile } from '@atoms/StatTile'
import { LoadingState } from '@atoms/LoadingState'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { QueryError } from '@atoms/QueryError'
import { ConnectCloudModal } from './ConnectCloudModal'

// CloudPostureView — Cloud pillar overview. Reads the existing
// GET /cloud-posture endpoint (resource counts + per-account rollup +
// unified cloud score). Empty orgs are guided to connect an AWS account
// (no source code required — the Cloud pillar is standalone).

export function CloudPostureView() {
  const { org } = useOrg()
  const orgId = org?.id
  const [connectOpen, setConnectOpen] = useState(false)
  const resourcePage = { limit: 500 } as const

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.cloud.posture(orgId, resourcePage),
    queryFn: () => getCloudPosture(orgId!, resourcePage),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const accounts = data?.accounts ?? []
  const resources = data?.resources ?? []
  const hasData = (data?.resource_count ?? 0) > 0

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 3 } }}>
        <FlytoPageHeader
          title={t('cloud.posture.title')}
          subtitle={t('cloud.posture.subtitle')}
          bottomGap={4}
          action={
            <Button
              variant="contained" size="small" startIcon={<Plus size={16} />}
              onClick={() => setConnectOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {t('cloud.posture.connectAws')}
            </Button>
          }
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, md: 4 }, pb: 3 }}>
        {isLoading && <LoadingState rows={5} />}
        {isError && <QueryError error={error} onRetry={refetch} label={t('cloud.posture.title')} />}

        {!isLoading && !isError && !hasData && (
          <EmptyStateGuide
            icon={<Cloud size={28} />}
            title={t('cloud.posture.emptyTitle')}
            description={t('cloud.posture.empty')}
            primaryAction={{
              label: t('cloud.posture.connectAws'),
              icon: <Plus size={16} />,
              onClick: () => setConnectOpen(true),
            }}
          />
        )}

        {!isLoading && !isError && hasData && (
          <>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
              <StatTile
                minWidth={160}
                label={t('cloud.posture.resources')}
                value={String(data!.resource_count)}
                sub={`${data!.scored_count} ${t('cloud.posture.scored')}`}
              />
              <StatTile
                minWidth={160}
                label={t('cloud.posture.accounts')}
                value={String(accounts.length)}
              />
              <StatTile
                minWidth={160}
                label={t('cloud.posture.score')}
                value={data!.score_available && data!.avg_display ? String(data!.avg_display) : '—'}
                sub={data!.score_available ? (data!.avg_grade ?? '') : t('cloud.posture.noScore')}
              />
            </Box>

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {t('cloud.posture.byAccount')}
            </Typography>
            <Paper variant="outlined" sx={{ borderColor: 'divider', overflow: 'hidden' }}>
              <TableContainer>
                <Table sx={{ '& td, & th': { py: 1.25, fontSize: 13 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.account')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.provider')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">{t('cloud.col.resources')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">{t('cloud.col.avgScore')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.map(a => (
                      <TableRow key={a.account_id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{a.display_name || a.account_locator || a.account_id}</Typography>
                          {a.account_locator && a.display_name && (
                            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{a.account_locator}</Typography>
                          )}
                        </TableCell>
                        <TableCell><Typography variant="body2" color="text.secondary" sx={{ textTransform: 'uppercase' }}>{a.provider || '—'}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2">{a.resource_count}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2">{a.scored_count > 0 && a.avg_score ? a.avg_score : '—'}</Typography></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, mb: 1, gap: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t('cloud.posture.resourcesTable')}
              </Typography>
              {data?.next_cursor && (
                <Typography variant="caption" color="text.secondary">
                  {t('cloud.posture.moreResources')}
                </Typography>
              )}
            </Box>
            <Paper variant="outlined" sx={{ borderColor: 'divider', overflow: 'hidden' }}>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table stickyHeader sx={{ '& td, & th': { py: 1.1, fontSize: 13 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.resource')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.type')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t('cloud.col.account')}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">{t('cloud.col.score')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resources.map(r => (
                      <TableRow key={r.resource_id || r.canonical_id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace' }} noWrap>
                            {r.canonical_id || r.resource_id}
                          </Typography>
                        </TableCell>
                        <TableCell><Typography variant="body2" color="text.secondary">{r.resource_type || '—'}</Typography></TableCell>
                        <TableCell><Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{r.account_id || '—'}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2">{r.scored ? (r.score ?? '—') : '—'}</Typography></TableCell>
                      </TableRow>
                    ))}
                    {resources.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 2 }}>
                            {t('cloud.posture.noResourcesPage')}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}
      </Box>

      {orgId && <ConnectCloudModal orgId={orgId} open={connectOpen} onClose={() => setConnectOpen(false)} />}
    </Box>
  )
}
