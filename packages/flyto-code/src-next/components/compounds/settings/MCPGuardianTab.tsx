import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Alert, Chip, Button, TextField, MenuItem, Divider,
} from '@mui/material'
import { Shield, Server, ShieldAlert } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { KpiCard, DonutChart } from '@compounds/_shared'
import {
  getMCPOverview, getMCPPolicy, putMCPPolicy,
  type MCPRolloutMode,
} from '@lib/engine/code/mcp'
import { MCPEgressPanel } from '@compounds/mcp/MCPEgressPanel'
import { MCPPolicySimulate } from '@compounds/mcp/MCPPolicySimulate'
import { MCPSessionTimeline } from '@compounds/mcp/MCPSessionTimeline'

// MCPGuardianTab — the legacy settings entry for Agent Firewall.
// Wires GET mcp/overview, GET mcp/policy, PUT mcp/policy. Overview = KPIs +
// server inventory + decision donut. Policy editor = defaultMode select + raw
// policy JSON, saved via the only authoritative write (cap mcp:configure).

const MODES: MCPRolloutMode[] = ['observe', 'shadow', 'soft_enforce', 'enforce']

const DECISION_COLORS: Record<string, string> = {
  allow: '#22c55e', block: '#ef4444', hold: '#f59e0b', warn: '#f59e0b', observe: '#3b82f6',
}

export function MCPGuardianTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id

  const overviewQ = useQuery({
    queryKey: qk.mcp.overview(orgId),
    queryFn: () => getMCPOverview(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const policyQ = useQuery({
    queryKey: qk.mcp.policy(orgId),
    queryFn: () => getMCPPolicy(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const [mode, setMode] = useState<MCPRolloutMode>('observe')
  const [policyJson, setPolicyJson] = useState('')

  // Hydrate the policy editor from the stored policy.
  useEffect(() => {
    const p = policyQ.data
    if (!p) return
    const dm = (p.defaultMode as MCPRolloutMode) || 'observe'
    if (MODES.includes(dm)) setMode(dm)
    if (typeof p.policyJSON === 'string' && p.policyJSON !== '' && p.policyJSON !== '{}') {
      setPolicyJson(p.policyJSON)
    }
  }, [policyQ.data])

  const saveMut = useMutation({
    mutationFn: () => {
      let policy: unknown
      if (policyJson.trim()) {
        try {
          policy = JSON.parse(policyJson)
        } catch {
          throw new Error('Policy JSON is invalid')
        }
      }
      return putMCPPolicy(orgId!, { defaultMode: mode, policy })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.mcp.policy(orgId) })
      enqueueSnackbar(t('agentFirewall.policySaved'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const ov = overviewQ.data
  const decisionData = Object.entries(ov?.decisionCounts ?? {}).map(([label, value]) => ({
    label, value, color: DECISION_COLORS[label.toLowerCase()] ?? '#94a3b8',
  }))

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        {t('agentFirewall.intro')}
      </Alert>

      {overviewQ.isLoading && <LoadingState variant="spinner" py={4} />}
      {overviewQ.isError && <QueryError error={overviewQ.error} onRetry={overviewQ.refetch} label={t('agentFirewall.intro')} compact />}

      {ov && !ov.configured && (
        <EmptyStateGuide
          icon={<Shield size={28} />}
          title={t('agentFirewall.notConfigured')}
          description={t('agentFirewall.notConfiguredHint')}
          py={3}
        />
      )}

      {ov && ov.configured && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5, mb: 2 }}>
            <KpiCard label={t('mcp.servers')} value={ov.servers.length} />
            <KpiCard label={t('mcp.tools')} value={ov.toolTotal} />
            <KpiCard label={t('mcp.unclassified')} value={ov.unclassifiedTools} />
            <KpiCard label={t('mcp.decisions')} value={ov.recentDecisions.length} />
          </Box>

          {decisionData.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {t('mcp.decisionMix')}
              </Typography>
              <DonutChart data={decisionData} height={260} totalLabel={t('mcp.decisions')} />
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Server size={16} style={{ color: '#a78bfa' }} />
            <Typography variant="subtitle2" fontWeight={700}>{t('mcp.serverInventory')}</Typography>
          </Box>
          {ov.servers.map(srv => (
            <Box key={srv.id} sx={{
              display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 1.5, alignItems: 'center',
              p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
            }}>
              <Box>
                <Typography variant="body2">{srv.name}</Typography>
                <Typography variant="caption" color="text.secondary">{srv.transport} · {srv.deploymentKind}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">{srv.toolCount} tools · {srv.writeTools} write</Typography>
              {srv.unclassifiedTools > 0 && (
                <Chip size="small" label={`${srv.unclassifiedTools} unclassified`}
                  sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(245,158,11,0.18)', color: '#f59e0b' }} />
              )}
              <Chip size="small" label={srv.status}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
            </Box>
          ))}
        </>
      )}

      {orgId && ov && ov.configured && (
        <>
          <Divider sx={{ my: 3 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <ShieldAlert size={16} style={{ color: '#a78bfa' }} />
            <Typography variant="subtitle2" fontWeight={700}>{t('mcp.egress.section')}</Typography>
          </Box>
          <MCPEgressPanel orgId={orgId} />
        </>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Policy editor */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Shield size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('agentFirewall.policy')}</Typography>
      </Box>
      {policyQ.isError && <QueryError error={policyQ.error} onRetry={policyQ.refetch} label={t('agentFirewall.policy')} compact />}
      <TextField select size="small" label={t('mcp.defaultMode')} value={mode}
        onChange={e => setMode(e.target.value as MCPRolloutMode)} sx={{ minWidth: 200, mb: 2 }}>
        {MODES.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
      </TextField>
      <TextField size="small" fullWidth multiline minRows={4} label={t('mcp.policyJson')}
        value={policyJson} onChange={e => setPolicyJson(e.target.value)} sx={{ mb: 2, fontFamily: 'monospace' }}
        placeholder='{"floors": [], "lenses": []}'
        helperText={t('agentFirewall.policyJsonHelp')} />
      <Button size="small" variant="contained"
        disabled={!orgId || saveMut.isPending}
        onClick={() => saveMut.mutate()}
        sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
        {saveMut.isPending ? t('common.saving') : t('agentFirewall.savePolicy')}
      </Button>

      {orgId && (
        <>
          <Divider sx={{ my: 3 }} />
          <MCPPolicySimulate orgId={orgId} mode={mode} policyJson={policyJson} />

          <Divider sx={{ my: 3 }} />
          <MCPSessionTimeline orgId={orgId} />
        </>
      )}
    </Box>
  )
}
