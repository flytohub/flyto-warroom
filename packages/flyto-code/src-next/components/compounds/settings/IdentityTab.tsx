import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Alert, Chip, Divider } from '@mui/material'
import { UserCheck, Network } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { KpiCard, GaugeChart, ModeView } from '@compounds/_shared'
import { getIdentityPosture, getIdentityAccessGraph } from '@lib/engine/code/identity'

// IdentityTab — the registered-but-dead identity surface (PR#184) made readable.
// Wires GET identity/posture + identity/access-graph. Manager = MFA coverage
// gauge + KPIs; engineer = at-risk identities + the group→app access graph.
// Both are connector-gated → empty "connect your IdP" state until a source wires.

export function IdentityTab() {
  const { org } = useOrg()
  const orgId = org?.id

  const postureQ = useQuery({
    queryKey: qk.identity.posture(orgId),
    queryFn: () => getIdentityPosture(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const graphQ = useQuery({
    queryKey: qk.identity.accessGraph(orgId),
    queryFn: () => getIdentityAccessGraph(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const p = postureQ.data
  const graph = graphQ.data

  if (postureQ.isLoading) {
    return <LoadingState variant="spinner" py={6} />
  }
  if (postureQ.isError) {
    return <QueryError error={postureQ.error} onRetry={postureQ.refetch} label={t('identity.atRiskIdentities')} compact />
  }
  if (p && !p.configured) {
    return (
      <EmptyStateGuide
        icon={<UserCheck size={28} />}
        title={t('identity.notConfigured')}
        description={t('identity.notConfiguredHint')}
        py={4}
      />
    )
  }

  const coveragePct = p ? Math.round(p.mfaCoverage * 100) : 0

  const managerView = (
    <Box>
      <Box sx={{ mb: 2 }}>
        <GaugeChart value={coveragePct} label={t('identity.mfaCoverage')} height={240} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5 }}>
        <KpiCard label={t('identity.total')} value={p?.totalIdentities ?? 0} />
        <KpiCard label={t('identity.mfaEnrolled')} value={p?.mfaEnrolled ?? 0} />
        <KpiCard label={t('identity.mfaMissing')} value={p?.mfaMissing ?? 0}
          invertDelta />
        <KpiCard label={t('identity.atRisk')} value={p?.atRisk.length ?? 0} invertDelta />
      </Box>
      {p && p.sources.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          {t('identity.sources')}: {p.sources.join(', ')}
        </Typography>
      )}
    </Box>
  )

  const engineerView = (
    <Box>
      {/* At-risk identities */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <UserCheck size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('identity.atRiskIdentities')}</Typography>
      </Box>
      {(p?.atRisk.length ?? 0) === 0 && (
        <Typography variant="caption" color="text.secondary">{t('identity.noRisk')}</Typography>
      )}
      {(p?.atRisk ?? []).map(row => (
        <Box key={row.resourceId} sx={{
          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1.5, alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Box>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{row.resourceId}</Typography>
            <Typography variant="caption" color="text.secondary">{row.reason}</Typography>
          </Box>
	          <Chip size="small" label={row.mfaEnrolled ? t('hardcoded.mfa.no.mfa.4ed9c701') : t('hardcoded.no.mfa.a5c1c372')}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: row.mfaEnrolled ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
              color: row.mfaEnrolled ? '#22c55e' : '#ef4444' }} />
          {row.status && (
            <Chip size="small" label={row.status}
              sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
          )}
        </Box>
      ))}

      <Divider sx={{ my: 3 }} />

      {/* Access graph */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Network size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('identity.accessGraph')}</Typography>
      </Box>
      {graphQ.isError && <QueryError error={graphQ.error} onRetry={graphQ.refetch} label={t('identity.accessGraph')} compact />}
      {graph && graph.edges.length === 0 && !graphQ.isLoading && (
        <Typography variant="caption" color="text.secondary">
          {t('identity.noEdges')}
        </Typography>
      )}
      {(graph?.edges ?? []).map((e, i) => {
        const node = graph?.nodes.find(n => n.resourceId === e.subject)
        return (
          <Box key={`${e.subject}-${e.app}-${i}`} sx={{
            display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 1.5, alignItems: 'center',
            p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
          }}>
            <Typography variant="body2">{node?.name ?? e.subject}</Typography>
            <Chip size="small" label={e.grantVia || '→'}
              sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
            <Typography variant="body2" sx={{ textAlign: 'right' }}>{e.app}</Typography>
          </Box>
        )
      })}
    </Box>
  )

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        {t('identity.intro')}
      </Alert>
      <ModeView manager={managerView} engineer={engineerView} />
    </Box>
  )
}
