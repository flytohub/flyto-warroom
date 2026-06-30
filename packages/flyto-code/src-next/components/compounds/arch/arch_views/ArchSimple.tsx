import { useMemo } from 'react'
import { Code2, Zap } from 'lucide-react'
import { gradients } from '@/styles/designTokens'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import CircularProgress from '@mui/material/CircularProgress'
import { t } from '@lib/i18n';
import { useRepoScores, getRepoScore } from '@hooks/useRepoScores'
import { QueryError } from '@atoms/QueryError'
import { formatCount, gradeColor, useOrgArch } from './shared'
import { ScanViewRoot, ScanViewHeader } from '@compounds/scanning/_shared'

// ── Complexity hotspots — table view ──

export function ArchComplexity() {
  const { data, isLoading, isError, error, refetch } = useOrgArch()
  const scoreMap = useRepoScores()
  const repos = useMemo(
    () => (data?.repos ?? []).filter(r => r.complex_functions > 0)
      .sort((a, b) => b.complex_functions - a.complex_functions),
    [data],
  )
  const total = data?.aggregate?.total_complex_functions ?? 0

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={Zap}
        gradient={gradients.architecture}
        title={t('warroom.complexityTitle')}
        subtitle={`${formatCount(total)} complex functions across ${repos.length} repos`}
        count={total}
        countColor="#eab308"
      />

      <Paper elevation={1} className="rounded-xl" sx={{
        bgcolor: 'background.paper', flex: 1, minHeight: 0,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {isLoading && (
          <Box className="flex items-center justify-center py-12">
            <CircularProgress size={20} />
          </Box>
        )}

        {!isLoading && isError && (
          <QueryError error={error} onRetry={refetch} label={t('arch.complexityLabel')} />
        )}

        {!isLoading && !isError && repos.length === 0 && (
          <Box className="flex flex-col items-center gap-3 py-12">
            <Zap size={40} style={{ opacity: 0.15 }} />
            <Typography variant="body2" color="text.secondary">
              {t('warroom.complexityNone')}
            </Typography>
          </Box>
        )}

        {!isLoading && !isError && repos.length > 0 && (
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table stickyHeader sx={{ '& td, & th': { py: 1.5, fontSize: 13 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 50, bgcolor: 'background.paper' }}>{t('common.grade')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>{t('common.repository')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>{t('common.type')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }} align="right">{t('common.complexFns')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }} align="right">{t('common.max')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }} align="right">{t('common.avg')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }} align="right">{t('common.score')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {repos.map(r => {
                  const grade = getRepoScore(scoreMap, r.repo_id).grade
                  return (
                    <TableRow key={r.repo_id} hover>
                      <TableCell>
                        <Chip
                          label={grade}
                          size="small"
                          sx={{
                            bgcolor: gradeColor(grade) + '22',
                            color: gradeColor(grade),
                            fontWeight: 700, fontSize: 13, minWidth: 26, height: 22,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{r.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{r.project_type}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} sx={{ color: r.complex_functions > 50 ? 'error.main' : 'text.primary' }}>
                          {formatCount(r.complex_functions)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ color: r.max_complexity > 20 ? 'warning.main' : 'text.secondary' }}>
                          {r.max_complexity}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {r.avg_complexity.toFixed(1)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} sx={{ color: gradeColor(grade) }}>
                          {getRepoScore(scoreMap, r.repo_id).raw}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </ScanViewRoot>
  )
}

// ── Top imports per repo — table view ──

export function ArchImports() {
  const { data, isLoading, isError, error, refetch } = useOrgArch()
  const scoreMap = useRepoScores()
  const repos = useMemo(
    () => (data?.repos ?? []).filter(r => r.import_count > 0)
      .sort((a, b) => b.import_count - a.import_count),
    [data],
  )

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={Code2}
        gradient={gradients.architecture}
        title={t('warroom.importsTitle')}
        subtitle={t('warroom.archImportsHint')}
        count={repos.length}
        countColor="primary.main"
      />

      <Paper elevation={1} className="rounded-xl" sx={{
        bgcolor: 'background.paper', flex: 1, minHeight: 0,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {isLoading && (
          <Box className="flex items-center justify-center py-12">
            <CircularProgress size={20} />
          </Box>
        )}

        {!isLoading && isError && (
          <QueryError error={error} onRetry={refetch} label={t('arch.importsLabel')} />
        )}

        {!isLoading && !isError && repos.length === 0 && (
          <Box className="flex flex-col items-center gap-3 py-12">
            <Code2 size={40} style={{ opacity: 0.15 }} />
            <Typography variant="body2" color="text.secondary">
              {t('warroom.importsNone')}
            </Typography>
          </Box>
        )}

        {!isLoading && !isError && repos.length > 0 && (
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table stickyHeader sx={{ '& td, & th': { py: 1.5, fontSize: 13 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: 50, bgcolor: 'background.paper' }}>{t('common.grade')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>{t('common.repository')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>{t('common.type')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }} align="right">{t('common.imports')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>{t('common.topPackages')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }} align="right">{t('common.score')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {repos.map(r => {
                  const grade = getRepoScore(scoreMap, r.repo_id).grade
                  // Show top 3 framework/pattern names as a quick glance
                  const topPkgs = [...(r.frameworks ?? []), ...(r.patterns ?? [])].slice(0, 3)
                  return (
                    <TableRow key={r.repo_id} hover>
                      <TableCell>
                        <Chip
                          label={grade}
                          size="small"
                          sx={{
                            bgcolor: gradeColor(grade) + '22',
                            color: gradeColor(grade),
                            fontWeight: 700, fontSize: 13, minWidth: 26, height: 22,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{r.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{r.project_type}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700}>{formatCount(r.import_count)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box className="flex flex-wrap gap-1">
                          {topPkgs.map(p => (
                            <Chip key={p} label={p} size="small" variant="outlined" sx={{ height: 20, fontSize: 13 }} />
                          ))}
                          {topPkgs.length === 0 && (
                            <Typography variant="body2" color="text.secondary">—</Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} sx={{ color: gradeColor(grade) }}>
                          {getRepoScore(scoreMap, r.repo_id).raw}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </ScanViewRoot>
  )
}
