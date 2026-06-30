import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { Activity, ExternalLink, GitPullRequest, Radar, ShieldAlert, Target, Zap } from 'lucide-react'
import { t } from '@lib/i18n';
import type { EnrichedSecurityIssue } from '@lib/engine'

interface Props {
  issue: EnrichedSecurityIssue
}

export function ContextTab({ issue }: Props) {
  const hasPRs = issue.open_prs_touching && issue.open_prs_touching.length > 0
  const hasTaint = issue.taint_adjacency && (issue.taint_adjacency.unsanitized_count ?? 0) > 0
  const hasPentest = !!issue.pentest_verdict
  const hasBlast = issue.blast_radius !== undefined && issue.blast_radius > 0
  const hasAutofix = issue.autofix_eligible
  const hasAny = hasPRs || hasTaint || hasPentest || hasBlast || hasAutofix

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2.5 }}>
      {!hasAny && (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Activity size={28} style={{ opacity: 0.15, margin: '0 auto 8px' }} />
          <Typography variant="body2" color="text.secondary">
            {t('issues.noContext')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {t('issues.noContextHint')}
          </Typography>
        </Box>
      )}

      {/* Blast Radius */}
      {hasBlast && (
        <ContextCard
          icon={Zap}
          title={t('issues.blastRadius')}
          color="#f97316"
        >
          <Box className="flex items-center gap-3">
            <Typography variant="h5" fontWeight={900} sx={{ color: '#f97316' }}>
              {issue.blast_radius}
            </Typography>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(issue.blast_radius!, 100)}
                sx={{
                  height: 6, borderRadius: 3, bgcolor: 'action.hover',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: issue.blast_radius! >= 75 ? '#ef4444' : issue.blast_radius! >= 50 ? '#f97316' : '#eab308',
                    borderRadius: 3,
                  },
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {issue.blast_radius! >= 75 ? t('issues.blastHigh') :
                 issue.blast_radius! >= 50 ? t('issues.blastMedium') :
                 t('issues.blastLow')}
              </Typography>
            </Box>
          </Box>
        </ContextCard>
      )}

      {/* Taint / Reachability */}
      {hasTaint && (
        <ContextCard
          icon={Target}
          title={t('issues.reachability')}
          color="#ef4444"
        >
          <Box className="flex items-center gap-2">
            <Chip
              label={`${issue.taint_adjacency!.unsanitized_count} unsanitized flows`}
              size="small"
              sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: '#ef444418', color: '#ef4444' }}
            />
            {issue.taint_adjacency!.categories && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                {issue.taint_adjacency!.categories.join(', ')}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', lineHeight: 1.5 }}>
            {t('issues.taintHint')}
          </Typography>
        </ContextCard>
      )}

      {/* Pentest Verdict */}
      {hasPentest && (
        <ContextCard
          icon={Radar}
          title={t('issues.pentestVerdict')}
          color="#a78bfa"
        >
          <Box className="flex items-center gap-2">
            {issue.pentest_verdict!.target_url && (
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                {issue.pentest_verdict!.target_url}
              </Typography>
            )}
            {issue.pentest_verdict!.critical_count !== undefined && issue.pentest_verdict!.critical_count > 0 && (
              <Chip
                label={`${issue.pentest_verdict!.critical_count} critical`}
                size="small"
                sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: '#ef444418', color: '#ef4444' }}
              />
            )}
          </Box>
          {issue.pentest_verdict!.last_scan_at && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Last scan: {new Date(issue.pentest_verdict!.last_scan_at).toLocaleDateString()}
            </Typography>
          )}
        </ContextCard>
      )}

      {/* Open PRs */}
      {hasPRs && (
        <ContextCard
          icon={GitPullRequest}
          title={t('issues.openPRs')}
          color="#38bdf8"
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {issue.open_prs_touching!.map((pr, i) => (
              <Box key={i} className="flex items-center gap-2">
                <Typography variant="caption" color="text.primary" fontWeight={600} sx={{ flex: 1, fontSize: 12 }}>
                  #{pr.number} {pr.title}
                </Typography>
                {pr.is_draft && (
                  <Chip label={t('findings.draft')} size="small" variant="outlined" sx={{ height: 16, fontSize: 12 }} />
                )}
                {pr.url && (
                  <a href={pr.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={11} style={{ color: '#a78bfa' }} />
                  </a>
                )}
              </Box>
            ))}
          </Box>
        </ContextCard>
      )}

      {/* AutoFix eligible */}
      {hasAutofix && (
        <ContextCard
          icon={ShieldAlert}
          title={t('issues.autofixEligible')}
          color="#22c55e"
        >
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {t('issues.autofixHint')}
          </Typography>
        </ContextCard>
      )}
    </Box>
  )
}

function ContextCard({ icon: Icon, title, color, children }: {
  icon: typeof Activity; title: string; color: string; children: React.ReactNode
}) {
  return (
    <Box sx={{
      p: 2, borderRadius: 2,
      border: 1, borderColor: 'divider',
      borderLeft: `3px solid ${color}`,
    }}>
      <Box className="flex items-center gap-1.5 mb-1.5">
        <Icon size={13} style={{ color }} />
        <Typography variant="caption" fontWeight={700} color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13 }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  )
}
