import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { ArrowRight, GitBranch } from 'lucide-react'
import { t } from '@lib/i18n';
import type { SecurityIssue } from '@lib/engine'
import { sevCfg } from './shared'

interface Props {
  primary: SecurityIssue
  related: SecurityIssue[]
  onNavigateRepo?: (repoId: string) => void
}

export function OverviewTab({ primary, related, onNavigateRepo }: Props) {
  const allIssues = [primary, ...related.filter(r => r.fingerprint !== primary.fingerprint)]

  // Group by repo
  const byRepo = new Map<string, SecurityIssue[]>()
  for (const issue of allIssues) {
    const key = issue.repo_name || issue.repo_id
    const arr = byRepo.get(key) ?? []
    arr.push(issue)
    byRepo.set(key, arr)
  }
  const repoGroups = Array.from(byRepo.entries())

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2.5 }}>
      {/* TL;DR */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13, mb: 1, display: 'block' }}>
          {t('issues.tldr')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, fontSize: 13 }}>
          {primary.description || primary.title}
        </Typography>
      </Paper>

      {/* Subissues table — grouped by repo */}
      {allIssues.length > 1 && (
        <Box>
          <Box className="flex items-center gap-2 mb-1.5">
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13 }}>
              {t('findings.subissues')}
            </Typography>
            <Chip label={allIssues.length} size="small" sx={{ height: 18, fontSize: 12, fontWeight: 700 }} />
          </Box>

          {repoGroups.map(([repoName, issues]) => (
            <Box key={repoName} sx={{ mb: 2 }}>
              <Box className="flex items-center gap-1.5 mb-1" sx={{ px: 0.5 }}>
                <GitBranch size={12} style={{ opacity: 0.5 }} />
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{
                    color: onNavigateRepo ? 'primary.main' : 'text.primary',
                    cursor: onNavigateRepo ? 'pointer' : 'default',
                    fontSize: 12,
                  }}
                  onClick={() => {
                    const issue = issues[0]
                    if (onNavigateRepo && issue.repo_id) onNavigateRepo(issue.repo_id)
                  }}
                >
                  {repoName}
                </Typography>
              </Box>
              <TableContainer sx={{ borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Table size="small" sx={{ '& td, & th': { py: 1, fontSize: 12 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13, color: 'text.secondary' }}>CVE</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13, color: 'text.secondary', width: 80 }}>{t('common.severity')}</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: 13, color: 'text.secondary' }}>{t('common.fix')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {issues.map(issue => {
                      const s = sevCfg(issue.severity)
                      return (
                        <TableRow key={issue.fingerprint} hover>
                          <TableCell>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }} color="text.primary">
                              {issue.cve_id || issue.title}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={issue.severity}
                              size="small"
                              sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: s.bg, color: s.color }}
                            />
                          </TableCell>
                          <TableCell>
                            {issue.fixed_in ? (
                              <Box className="flex items-center gap-1">
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                                  {issue.version}
                                </Typography>
                                <ArrowRight size={10} style={{ opacity: 0.4 }} />
                                <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>
                                  {issue.fixed_in}
                                </Typography>
                              </Box>
                            ) : (
                              <Typography variant="caption" color="text.secondary">—</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ))}
        </Box>
      )}

      {/* Single issue — just show locations */}
      {allIssues.length === 1 && primary.repo_name && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13, mb: 1, display: 'block' }}>
            {t('findings.locations')}
          </Typography>
          <Box className="flex items-center gap-2">
            <GitBranch size={12} style={{ opacity: 0.5 }} />
            <Typography
              variant="caption"
              sx={{
                color: onNavigateRepo ? 'primary.main' : 'text.primary',
                cursor: onNavigateRepo ? 'pointer' : 'default',
                fontWeight: 600, fontSize: 12,
              }}
              onClick={() => onNavigateRepo?.(primary.repo_id)}
            >
              {primary.repo_name}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* References */}
      {primary.references && primary.references.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13, mb: 1, display: 'block' }}>
            {t('issues.references')}
          </Typography>
          {primary.references.slice(0, 5).map((url, i) => (
            <Box key={i} sx={{ py: 0.25 }}>
              <a href={url} target="_blank" rel="noopener noreferrer"
                style={{
                  fontSize: 12, color: '#a78bfa', textDecoration: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                }}>
                {url}
              </a>
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  )
}
