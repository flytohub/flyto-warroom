import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Link } from '@mui/material'
import { Plug } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { getIntegrationsHealth, testRepoCredentials } from '@lib/engine'
import { SectionCard } from '@atoms/SectionCard'
import { StatusDot } from '@atoms/StatusDot'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { healthTone, TONE_COLOR, type HealthTone } from './types'

// Connector / integration health — reads /integrations/health (GitHub /
// GitLab / Shodan token state) + /credentials/per-repo-test (how many repos
// the current token can actually reach). One of the operator plane's
// headline tiles: "is anything we depend on broken right now?"

function Dot({ tone }: { tone: HealthTone }) {
  return <StatusDot color={TONE_COLOR[tone]} />
}

export function ConnectorHealthPanel() {
  const { org } = useOrg()
  const orgId = org?.id

  const healthQ = useQuery({
    queryKey: qk.ops.integrationsHealth(orgId),
    queryFn: () => getIntegrationsHealth(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const credQ = useQuery({
    queryKey: qk.ops.credentialTest(orgId),
    queryFn: () => testRepoCredentials(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const integrations = healthQ.data?.integrations ?? []
  const tests = credQ.data?.tests ?? []
  const reachable = tests.filter(t => t.status === 'ok').length

  return (
    <SectionCard icon={<Plug size={16} />} title={t('ops.connectors.title')}>

      {healthQ.isLoading && <LoadingState rows={3} />}
      {healthQ.isError && <QueryError error={healthQ.error} onRetry={healthQ.refetch} label={t('ops.connectors.title')} compact />}

      {!healthQ.isLoading && !healthQ.isError && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {integrations.map(i => {
            const tone = healthTone(i.status)
            return (
              <Box key={i.provider} sx={{
                display: 'flex', alignItems: 'center', gap: 1.25,
                py: 1, px: 1.25, borderRadius: 1, border: '1px solid', borderColor: 'divider',
              }}>
                <Dot tone={tone} />
                <Typography variant="body2" fontWeight={600} sx={{ textTransform: 'capitalize', minWidth: 64 }}>
                  {i.provider}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  {i.message || `${i.status}${i.mode && i.mode !== 'none' ? ` · ${i.mode}` : ''}`}
                </Typography>
                {i.reconnect_url && tone !== 'ok' && (
                  <Link href={i.reconnect_url} underline="hover" sx={{ fontSize: 13, fontWeight: 600 }}>
                    {t('ops.connectors.reconnect')}
                  </Link>
                )}
              </Box>
            )
          })}
          {integrations.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('ops.connectors.none')}
            </Typography>
          )}

          {credQ.data?.token_available && tests.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('ops.connectors.reposReachable')
                .replace('{n}', String(reachable)).replace('{total}', String(tests.length))}
            </Typography>
          )}
        </Box>
      )}
    </SectionCard>
  )
}
