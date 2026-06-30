/**
 * AiPanelBriefing — Section A of AiPanel.
 *
 * Org pages: stats-based briefing (no LLM call).
 * Repo pages: compact fix-plan summary from getFixPlan (cached 30m).
 */

import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import { Sparkles, Calendar, AlertTriangle, ShieldAlert, GitPullRequest, Flame } from 'lucide-react'
import { t } from '@lib/i18n';
import { getFixPlan, getOrgPulse } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { useAiPanelContext } from '@hooks/useAiPanelContext'
import { AiPanelSection } from './AiPanelSection'

/** Org briefing — client-side stats from Pulse data, no LLM call. */
function OrgBriefing({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    // qk.pulse.org → qk.pulse.feed(…); prefix-matched by the qk.pulse.feed(orgId)
    // invalidation so the briefing refreshes on scan/autofix (was 'org-pulse',
    // never invalidated — cache bug M2).
    queryKey: qk.pulse.org(orgId, '', 20),
    queryFn: () => getOrgPulse(orgId, '', 20),
    staleTime: 60_000,
    retry: false,
  })

  if (isLoading) return <Skeleton variant="rounded" height={60} />

  const items = data?.items ?? []
  if (items.length === 0) return (
    <Typography variant="caption" color="text.secondary">
      {t('studio.noPulseItems')}
    </Typography>
  )

  const critical = items.filter(i => (i.severity ?? '').toLowerCase() === 'critical').length
  const withPR = items.filter(i => (i.open_prs_touching ?? []).length > 0).length
  const withTaint = items.filter(i => i.taint_adjacency).length
  const highBlast = items.filter(i => (i.blast_radius ?? 0) >= 60).length

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.6 }}>
        {t('studio.briefingSummary')
          .replace('{total}', String(items.length))
          .replace('{critical}', String(critical))
          .replace('{highBlast}', String(highBlast))
        }
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {critical > 0 && (
          <Chip icon={<ShieldAlert size={12} />} label={`${critical} critical`} size="small"
            sx={{ height: 22, fontSize: 13, bgcolor: '#ef444418', color: '#ef4444', '& .MuiChip-icon': { color: '#ef4444' } }} />
        )}
        {withPR > 0 && (
          <Chip icon={<GitPullRequest size={12} />} label={`${withPR} with PRs`} size="small"
            sx={{ height: 22, fontSize: 13, bgcolor: '#a78bfa18', color: '#a78bfa', '& .MuiChip-icon': { color: '#a78bfa' } }} />
        )}
        {withTaint > 0 && (
          <Chip icon={<Flame size={12} />} label={`${withTaint} taint`} size="small"
            sx={{ height: 22, fontSize: 13, bgcolor: '#f9731618', color: '#f97316', '& .MuiChip-icon': { color: '#f97316' } }} />
        )}
      </Box>
    </Box>
  )
}

function RepoBriefing({ repoId }: { repoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.repos.fixPlan(repoId),
    queryFn: () => getFixPlan(repoId),
    staleTime: 60_000,
  })

  if (isLoading) return <Skeleton variant="rounded" height={80} />

  const plan = data?.plan
  if (!plan) return (
    <Typography variant="caption" color="text.secondary">
      {t('studio.noFixPlan')}
    </Typography>
  )

  const week1 = plan.buckets?.[0]
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {plan.summary && (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.5 }}>
          {plan.summary}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          icon={<Calendar size={12} />}
          label={t('studio.totalEffort').replace('{n}', String(plan.total_effort_hours ?? 0))}
          size="small"
          variant="outlined"
          sx={{ height: 22, fontSize: 13 }}
        />
        {plan.critical_path?.length > 0 && (
          <Chip
            icon={<AlertTriangle size={12} />}
            label={`${plan.critical_path.length} critical`}
            size="small"
            color="warning"
            sx={{ height: 22, fontSize: 13 }}
          />
        )}
      </Box>
      {week1 && (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            {week1.label || t('studio.week1')}
          </Typography>
          {week1.items?.slice(0, 3).map((item, i) => (
            <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block', pl: 1, lineHeight: 1.6 }}>
              {'\u2022'} {item.title}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  )
}

export function AiPanelBriefing() {
  const { page, orgId, repoId } = useAiPanelContext()

  const isRepoPage = page === 'repo-detail' && repoId
  const hasOrg = !!orgId

  return (
    <AiPanelSection title={t('studio.briefing')} icon={Sparkles} iconColor="#8b5cf6">
      {isRepoPage ? (
        <RepoBriefing repoId={repoId!} />
      ) : hasOrg ? (
        <OrgBriefing orgId={orgId!} />
      ) : (
        <Typography variant="caption" color="text.secondary">
          {t('studio.selectOrg')}
        </Typography>
      )}
    </AiPanelSection>
  )
}
