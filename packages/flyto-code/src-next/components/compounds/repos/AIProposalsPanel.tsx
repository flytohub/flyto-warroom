/**
 * AIProposalsPanel — engineer-mode AI CVE-bump remediation proposals.
 *
 * Coverage for:
 *   GET  /repos/{id}/ai-proposals                     → listAIProposals
 *   POST /repos/{id}/ai-proposals/{proposalId}/accept → acceptAIProposal
 *
 * Each actionable proposal gets an "Open PR" button (optimistic — the
 * row flips to "PR opened" with the returned pr_url on success, toasts
 * on failure). Info-only proposals render their skip_reason/skip_hint
 * instead of an action. Self-contained, additive.
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { GitPullRequest, ExternalLink, Loader2, Info, CheckCircle2 } from 'lucide-react'

import {
  listAIProposals,
  acceptAIProposal,
  type AIProposal,
} from '@lib/engine/code/repos'
import { qk } from '@lib/queryKeys'
import { SeverityChip } from '@compounds/_shared'
import { type Severity } from '@lib/tokens/severity'
import { t } from '@lib/i18n';

function toSeverity(raw: string): Severity {
  const s = (raw || '').toLowerCase()
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low') return s
  if (s === 'moderate') return 'medium'
  return ''
}

function ProposalRow({ repoId, p }: { repoId: string; p: AIProposal }) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  const accept = useMutation({
    mutationFn: () => acceptAIProposal(repoId, p.id),
    onSuccess: (res) => {
      enqueueSnackbar(res.pr_url ? t('repos.aiProposals.toast.prOpened') : t('repos.aiProposals.toast.proposalAccepted'), { variant: 'success' })
      qc.invalidateQueries({ queryKey: qk.autofix.aiProposals(repoId) })
    },
    onError: () => enqueueSnackbar(t('repos.aiProposals.toast.openPrFailed'), { variant: 'error' }),
  })

  const prUrl = p.pr_url
  const done = p.accepted || !!prUrl

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: 1.25,
        p: 1.25, borderRadius: 1, bgcolor: 'action.hover',
      }}
    >
      <SeverityChip severity={toSeverity(p.severity)} size="sm" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={p.pr_title}>
          {p.pr_title || p.finding}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {p.package
            ? `${p.package}${p.fixed_version ? ` → ${p.fixed_version}` : ''}`
            : p.file_path}
          {p.cve_id ? ` · ${p.cve_id}` : ''}
        </Typography>
        {!p.actionable && (p.skip_hint || p.skip_reason) && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mt: 0.5 }}>
            <Info size={13} style={{ opacity: 0.6, marginTop: 2, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">
              {p.skip_hint || p.skip_reason}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Action */}
      {prUrl ? (
        <Button
          size="small"
          variant="text"
          component="a"
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<ExternalLink size={14} />}
        >
          {p.pr_number ? `#${p.pr_number}` : 'PR'}
        </Button>
      ) : done ? (
        <Button size="small" variant="text" disabled startIcon={<CheckCircle2 size={14} />}>
          {t('repos.aiProposals.accepted')}
        </Button>
      ) : p.actionable ? (
        <Button
          size="small"
          variant="outlined"
          disabled={accept.isPending}
          startIcon={accept.isPending ? <Loader2 size={14} className="animate-spin" /> : <GitPullRequest size={14} />}
          onClick={() => accept.mutate()}
        >
          {t('repos.aiProposals.openPr')}
        </Button>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5 }}>
          {t('repos.aiProposals.infoOnly')}
        </Typography>
      )}
    </Box>
  )
}

export function AIProposalsPanel({ repoId }: { repoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.autofix.aiProposals(repoId),
    queryFn: () => listAIProposals(repoId),
    staleTime: 60_000,
    retry: false,
  })

  const proposals = useMemo(() => data?.entries ?? [], [data])
  const actionable = proposals.filter((p) => p.actionable && !p.accepted && !p.pr_url)

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('repos.aiProposals.title')}
        </Typography>
        {actionable.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {t('repos.aiProposals.readyToOpen', { count: actionable.length })}
          </Typography>
        )}
      </Box>

      {isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
          <Loader2 size={18} className="animate-spin" />
        </Box>
      )}

      {!isLoading && proposals.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('repos.aiProposals.empty')}
        </Typography>
      )}

      {proposals.map((p) => (
        <ProposalRow key={p.id} repoId={repoId} p={p} />
      ))}
    </Paper>
  )
}
