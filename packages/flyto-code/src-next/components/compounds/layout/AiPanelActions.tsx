/**
 * AiPanelActions — Section C of AiPanel.
 *
 * Quick actions: AutoFix counts, copy AI prompt, AI proposals link.
 */

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import { Zap, Clipboard, GitPullRequest, Wrench } from 'lucide-react'
import { t } from '@lib/i18n';
import { listAutofixFindings, getAIFixContext, listAIProposals } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { useAiPanelContext } from '@hooks/useAiPanelContext'
import { AiPanelSection } from './AiPanelSection'

function OrgActions({ orgId }: { orgId: string }) {
  const { data: autofixData, isLoading } = useQuery({
    queryKey: qk.autofix.findingsCount(orgId),
    queryFn: () => listAutofixFindings(orgId),
    staleTime: 2 * 60_000,
    select: (d) => d.findings?.length ?? 0,
  })

  if (isLoading) return <Skeleton variant="rounded" height={40} />

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {(autofixData ?? 0) > 0 && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1,
          bgcolor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
        }}>
          <Wrench size={14} style={{ color: '#22c55e' }} />
          <Typography variant="caption" fontWeight={600} color="text.primary" sx={{ flex: 1 }}>
            {t('studio.autofixReady')}
          </Typography>
          <Chip label={autofixData} size="small" sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: '#22c55e', color: '#fff' }} />
        </Box>
      )}
      {(autofixData ?? 0) === 0 && (
        <Typography variant="caption" color="text.secondary">
          {t('studio.noActions')}
        </Typography>
      )}
    </Box>
  )
}

function RepoActions({ repoId }: { repoId: string }) {
  const { data: proposalsData } = useQuery({
    queryKey: qk.autofix.aiProposals(repoId),
    queryFn: () => listAIProposals(repoId),
    staleTime: 60_000,
  })

  const { data: fixCtx, refetch: fetchFixCtx } = useQuery({
    queryKey: qk.autofix.aiFixContext(repoId),
    queryFn: () => getAIFixContext(repoId),
    enabled: false, // only fetch on demand
  })

  const copyPrompt = useCallback(async () => {
    const data = fixCtx ?? (await fetchFixCtx()).data
    const text = data?.prompt || data?.instructions || ''
    if (text) {
      await navigator.clipboard.writeText(text)
    }
  }, [fixCtx, fetchFixCtx])

  const proposalCount = proposalsData?.entries?.filter(e => e.actionable && !e.accepted)?.length ?? 0

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Clipboard size={14} />}
        onClick={copyPrompt}
        sx={{ textTransform: 'none', fontSize: 12, justifyContent: 'flex-start' }}
      >
        {t('studio.copyAiPrompt')}
      </Button>

      {proposalCount > 0 && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1,
          bgcolor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
        }}>
          <GitPullRequest size={14} style={{ color: '#8b5cf6' }} />
          <Typography variant="caption" fontWeight={600} color="text.primary" sx={{ flex: 1 }}>
            {t('studio.aiProposals')}
          </Typography>
          <Chip label={proposalCount} size="small" sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: '#8b5cf6', color: '#fff' }} />
        </Box>
      )}
    </Box>
  )
}

export function AiPanelActions() {
  const { page, orgId, repoId } = useAiPanelContext()
  const isRepoPage = page === 'repo-detail' && repoId

  return (
    <AiPanelSection title={t('studio.quickActions')} icon={Zap} iconColor="#22c55e">
      {isRepoPage ? (
        <RepoActions repoId={repoId!} />
      ) : orgId ? (
        <OrgActions orgId={orgId!} />
      ) : null}
    </AiPanelSection>
  )
}
