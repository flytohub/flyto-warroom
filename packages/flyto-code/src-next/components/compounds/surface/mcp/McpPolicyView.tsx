/**
 * McpPolicyView — the Agent Firewall control plane. Shows the org's current
 * rollout mode and lets an admin move it along the safety ramp
 * (observe → shadow → soft_enforce → enforce). The key feature is
 * simulate-before-enable: replay recent stored events under a candidate
 * mode (POST /mcp/policy/simulate) and show how many calls would be NEWLY
 * blocked before committing — so turning on enforcement is never a blind
 * switch. Saving (PUT /mcp/policy) is gated on the `mcp:configure` action.
 */
import { useState, useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import { ShieldHalf, FlaskConical, Check, FileSearch, GitBranch, LockKeyhole, Workflow } from 'lucide-react'
import {
  getMcpPolicy, putMcpPolicy, simulateMcpPolicy,
  MCP_ROLLOUT_MODES, type MCPRolloutMode, type MCPSimulateResponse,
} from '@lib/engine'
import { GatedButton } from '@atoms/GatedButton'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'

const BRAND = '#7c3aed'

const MODE_META: Record<MCPRolloutMode, { label: string; desc: string; tone: string }> = {
  observe: { label: t('hardcoded.observe.desc.a5f0f4d8'), desc: t('hardcoded.log.only.never.compute.a.blocking.verdict.87f0e0a5'), tone: '#64748b' },
  shadow: { label: t('hardcoded.shadow.desc.compute.verdicts.record.them.but.never.557c6d6e'), desc: t('hardcoded.compute.verdicts.record.them.but.never.block.092774d7'), tone: '#3b82f6' },
  soft_enforce: { label: t('hardcoded.soft.enforce.desc.82532419'), desc: t('hardcoded.block.writes.egress.only.reads.always.proceed.8de3da98'), tone: '#f59e0b' },
  enforce: { label: t('hardcoded.enforce.desc.block.everything.the.floor.rules.deny.0ca520cb'), desc: t('hardcoded.block.everything.the.floor.rules.deny.a94ce9c0'), tone: '#ef4444' },
}

function modeMeta(m: MCPRolloutMode) {
  const k = `mcp.mode.${m}`
  return {
    label: tOr(`${k}.label`, MODE_META[m].label),
    desc: tOr(`${k}.desc`, MODE_META[m].desc),
    tone: MODE_META[m].tone,
  }
}

export function McpPolicyView({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const { data: policy, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.mcp.policy(orgId),
    queryFn: () => getMcpPolicy(orgId),
    enabled: !!orgId,
  })

  const current = (policy?.defaultMode ?? 'observe') as MCPRolloutMode
  const [selected, setSelected] = useState<MCPRolloutMode>(current)
  useEffect(() => { setSelected(current) }, [current])

  const [sim, setSim] = useState<MCPSimulateResponse | null>(null)
  const simulate = useMutation({
    // @closure local-result: simulation replays stored events without
    // persisting policy; the returned diff is the UI state.
    mutationFn: () => simulateMcpPolicy(orgId, { defaultMode: selected, limit: 500 }),
    onSuccess: setSim,
  })

  const save = useMutation({
    mutationFn: () => putMcpPolicy(orgId, { defaultMode: selected }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.mcp.policy(orgId) })
      qc.invalidateQueries({ queryKey: qk.mcp.overview(orgId) })
    },
  })

  if (isLoading) {
    return <LoadingState variant="spinner" py={10} />
  }

  if (isError) {
    return <Box sx={{ p: 3 }}><QueryError error={error} onRetry={refetch} label={t('agentFirewall.policyTitle')} compact /></Box>
  }

  const dirty = selected !== current
  const cur = modeMeta(current)

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ShieldHalf size={20} style={{ color: BRAND }} />
        <Typography variant="h6" fontWeight={800}>{t('agentFirewall.policyTitle')}</Typography>
        <Chip size="small" label={`${t('mcp.current')}: ${cur.label}`}
          sx={{ ml: 1, height: 24, fontWeight: 700, color: cur.tone, borderColor: cur.tone }} variant="outlined" />
      </Box>

      <Typography variant="body2" color="text.secondary">
        {t('agentFirewall.policyLede')}
      </Typography>

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Workflow size={16} style={{ color: BRAND }} />
          <Typography variant="subtitle2" fontWeight={850}>{t('agentFirewall.policyClosureTitle')}</Typography>
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <ClosureCard icon={<FlaskConical size={16} />} title={t('agentFirewall.policyClosureSimulate')} detail={t('agentFirewall.policyClosureSimulateDesc')} />
          <ClosureCard icon={<LockKeyhole size={16} />} title={t('agentFirewall.policyClosureEnforce')} detail={t('agentFirewall.policyClosureEnforceDesc')} />
          <ClosureCard icon={<GitBranch size={16} />} title={t('agentFirewall.policyClosureSequence')} detail={t('agentFirewall.policyClosureSequenceDesc')} />
          <ClosureCard icon={<FileSearch size={16} />} title={t('agentFirewall.policyClosureEvidence')} detail={t('agentFirewall.policyClosureEvidenceDesc')} />
        </Box>
      </Paper>

      {/* Mode ramp */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        {MCP_ROLLOUT_MODES.map((m) => {
          const meta = modeMeta(m)
          const on = selected === m
          return (
            <Paper key={m} variant="outlined" onClick={() => setSelected(m)}
              sx={{
                p: 2, borderRadius: 2.5, flex: 1, minWidth: 180, cursor: 'pointer',
                borderColor: on ? meta.tone : 'divider', borderWidth: on ? 2 : 1,
                bgcolor: on ? `${meta.tone}14` : 'transparent', transition: 'all .12s',
              }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography fontWeight={800} sx={{ color: meta.tone }}>{meta.label}</Typography>
                {m === current && <Chip size="small" label={t('mcp.active')} sx={{ height: 18, fontSize: 12 }} />}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{meta.desc}</Typography>
            </Paper>
          )
        })}
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Simulate is a read-only replay (backend = member read) — NOT gated
            on mcp:configure. Only the Save below requires admin. */}
        <Button
          variant="outlined"
          startIcon={simulate.isPending ? <CircularProgress size={14} /> : <FlaskConical size={16} />}
          disabled={simulate.isPending}
          onClick={() => simulate.mutate()}
        >
          {t('mcp.simulate')}
        </Button>
        <GatedButton
          action="mcp:configure"
          variant="contained"
          startIcon={save.isPending ? <CircularProgress size={14} /> : <Check size={16} />}
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          sx={{ bgcolor: BRAND, '&:hover': { bgcolor: '#6d28d9' } }}
        >
          {dirty ? t('mcp.saveMode') : t('mcp.saved')}
        </GatedButton>
        {save.isSuccess && !dirty && (
          <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 700 }}>{t('mcp.savedOk')}</Typography>
        )}
        {save.isError && (
          <InlineErrorNotice error={save.error} title={t('mcp.saveErr')} />
        )}
        {simulate.isError && (
          <InlineErrorNotice error={simulate.error} title={t('mcp.simulate')} />
        )}
      </Box>

      {/* Simulation result */}
      {sim && (
        <Paper variant="outlined" sx={{ borderRadius: 2.5, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle2" fontWeight={800}>
            {t('mcp.simResult')} — {modeMeta(selected).label} ({t('mcp.over')} {sim.evaluated} {t('mcp.recentCalls')})
          </Typography>
          {sim.newlyBlocked > 0 ? (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              {t('mcp.simWarnA')} {modeMeta(selected).label} {t('mcp.simWarnB')} <b>{sim.newlyBlocked}</b> {t('mcp.simWarnC')}
            </Alert>
          ) : (
            <Alert severity="success" sx={{ py: 0.5 }}>
              {t('mcp.simSafe')}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Stat label={t('mcp.evaluated')} value={sim.evaluated} />
            <Stat label={t('mcp.wouldBlock')} value={sim.wouldBlock} tone="#ef4444" />
            <Stat label={t('mcp.newlyBlocked')} value={sim.newlyBlocked} tone={sim.newlyBlocked > 0 ? '#f59e0b' : undefined} />
            <Stat label={t('mcp.newlyAllowed')} value={sim.newlyAllowed} tone={sim.newlyAllowed > 0 ? '#3b82f6' : undefined} />
          </Box>

          {sim.sampleFlips.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('mcp.sampleFlips')}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('mcp.colTool')}</TableCell>
                    <TableCell>{t('mcp.colChange')}</TableCell>
                    <TableCell>{t('mcp.floorRule')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sim.sampleFlips.map((f) => (
                    <TableRow key={f.eventId}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{f.toolName}{f.verb ? ` · ${f.verb}` : ''}</TableCell>
                      <TableCell sx={{ fontSize: 12, fontWeight: 700, color: f.nowBlocked ? '#ef4444' : '#16a34a' }}>
                        {f.wasBlocked ? t('mcp.wasBlocked') : t('mcp.wasAllowed')}
                        {' → '}
                        {f.nowBlocked ? t('mcp.nowBlocked') : t('mcp.nowAllowed')}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>{f.floorRule || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>
      )}
    </Box>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Box sx={{ minWidth: 110 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="h5" fontWeight={800} sx={{ color: tone ?? 'text.primary' }}>{value}</Typography>
    </Box>
  )
}

function ClosureCard({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: BRAND }}>
        {icon}
        <Typography variant="body2" fontWeight={850} sx={{ color: 'text.primary' }}>{title}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, lineHeight: 1.5 }}>{detail}</Typography>
    </Paper>
  )
}
