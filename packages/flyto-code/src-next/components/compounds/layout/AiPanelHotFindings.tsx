/**
 * AiPanelHotFindings — Section B of AiPanel.
 *
 * Org pages: top 5 findings by blast radius from getOrgPulse.
 * Repo pages: top 5 findings across dimensions from getRepoFindings.
 */

import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import { Flame } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getOrgPulse, getRepoFindings, type PulseItem, type CodeFinding } from '@lib/engine'
import { useAiPanelContext } from '@hooks/useAiPanelContext'
import { severityColor } from '@atoms/SeverityChip'
import { AiPanelSection } from './AiPanelSection'

function PulseFindingRow({ item }: { item: PulseItem }) {
  const sevColor = severityColor(item.severity)
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1, py: 0.75, px: 1,
      borderRadius: 1, '&:hover': { bgcolor: 'action.hover' },
    }}>
      <Chip
        label={item.severity?.slice(0, 4).toUpperCase() || '?'}
        size="small"
        sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: sevColor, color: '#fff', minWidth: 40 }}
      />
      <Typography variant="caption" color="text.primary" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
        {item.title}
      </Typography>
      {item.blast_radius > 0 && (
        <Chip
          label={item.blast_radius}
          size="small"
          variant="outlined"
          sx={{ height: 18, fontSize: 12, fontWeight: 700, flexShrink: 0, borderColor: 'rgba(239,68,68,0.3)' }}
        />
      )}
    </Box>
  )
}

function OrgHotFindings({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.pulse.aiPanel(orgId),
    queryFn: () => getOrgPulse(orgId, '', 5),
    staleTime: 2 * 60_000,
  })

  if (isLoading) return <Skeleton variant="rounded" height={100} />
  const items = data?.items ?? []
  if (items.length === 0) return (
    <Typography variant="caption" color="text.secondary">
      {t('studio.noFindings')}
    </Typography>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {items.map(item => <PulseFindingRow key={item.id} item={item} />)}
    </Box>
  )
}

function RepoHotFindings({ repoId }: { repoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.repos.findings(repoId),
    queryFn: () => getRepoFindings(repoId),
    staleTime: 60_000,
  })

  if (isLoading) return <Skeleton variant="rounded" height={100} />
  if (!data) return null

  // Merge findings across dimensions, prioritize by severity
  const all: Array<CodeFinding & { dim: string }> = [
    ...(data.secrets ?? []).map(f => ({ ...f, dim: 'secret' })),
    ...(data.taint_flows ?? []).map(f => ({ ...f, dim: 'taint' })),
    ...(data.sast_findings ?? []).map(f => ({ ...f, dim: 'sast' })),
    ...(data.complex_functions ?? []).map(f => ({ ...f, dim: 'complexity' })),
    ...(data.dead_code ?? []).slice(0, 2).map(f => ({ ...f, dim: 'dead_code' })),
  ]

  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  all.sort((a, b) => (sevOrder[a.severity ?? 'low'] ?? 4) - (sevOrder[b.severity ?? 'low'] ?? 4))
  const top5 = all.slice(0, 5)

  if (top5.length === 0) return (
    <Typography variant="caption" color="text.secondary">
      {t('studio.noFindings')}
    </Typography>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {top5.map((f, i) => {
        const sevColor = severityColor(f.severity)
        return (
          <Box key={i} sx={{
            display: 'flex', alignItems: 'center', gap: 1, py: 0.75, px: 1,
            borderRadius: 1, '&:hover': { bgcolor: 'action.hover' },
          }}>
            <Chip
              label={(f.severity ?? f.dim).slice(0, 4).toUpperCase()}
              size="small"
              sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: sevColor, color: '#fff', minWidth: 40 }}
            />
            <Typography variant="caption" color="text.primary" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {f.name}
            </Typography>
            <Chip label={f.dim} size="small" variant="outlined" sx={{ height: 16, fontSize: 8, textTransform: 'uppercase', flexShrink: 0 }} />
          </Box>
        )
      })}
    </Box>
  )
}

export function AiPanelHotFindings() {
  const { page, orgId, repoId } = useAiPanelContext()
  const isRepoPage = page === 'repo-detail' && repoId

  return (
    <AiPanelSection title={t('studio.hotFindings')} icon={Flame} iconColor="#ef4444">
      {isRepoPage ? (
        <RepoHotFindings repoId={repoId!} />
      ) : orgId ? (
        <OrgHotFindings orgId={orgId!} />
      ) : null}
    </AiPanelSection>
  )
}
