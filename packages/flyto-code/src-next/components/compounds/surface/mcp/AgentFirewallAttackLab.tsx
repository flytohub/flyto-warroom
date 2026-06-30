import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Alert from '@mui/material/Alert'
import { Check, Copy, GitBranch, ShieldAlert } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { mcpIngestEndpoint } from '@lib/engine'
import { t } from '@lib/i18n';
import { writeClipboardText } from '@lib/clipboard'

const BRAND = '#7c3aed'

const CHAINS = [
  {
    id: 'read-sensitive-external',
    title: 'Sensitive read -> external transmit',
    severity: 'deny',
    detects: 'A session reads secrets, credentials, customer data, or source code, then later exports or transmits to an external target.',
    probes: [
      { toolName: 'vault_read', verb: 'READ', dataClass: 'secret', target: 'https://internal.vault.local', executed: true },
      { toolName: 'send_to_webhook', verb: 'TRANSMIT', dataDirection: 'outbound', target: 'https://webhook.example' },
    ],
  },
  {
    id: 'recon-external-mutation',
    title: 'Recon -> external mutation',
    severity: 'hold / deny',
    detects: 'A session scans an external target, then follows with a write, delete, export, or transmit action against an external target.',
    probes: [
      { toolName: 'probe_target', verb: 'SCAN', target: 'https://target.example', executed: true },
      { toolName: 'mutate_target', verb: 'WRITE', target: 'https://target.example', stateChange: true },
    ],
  },
  {
    id: 'production-side-effect',
    title: t('hardcoded.production.side.effect.c4a6afe4'),
    severity: 'approval',
    detects: 'A state-changing or externally visible action lands on declared production scope without an approved exception.',
    probes: [
      { toolName: 'deploy_prod', verb: 'DELETE', target: 'https://prod.example', stateChange: true },
    ],
  },
]

function probeBody(chainId: string, probe: Record<string, unknown>) {
  return JSON.stringify({
    projectHash: '<project-hash>',
    sessionKey: `attack-lab-${chainId}`,
    agentId: 'attack-lab-agent',
    serverId: 'agent-firewall-lab',
    ...probe,
    occurredAt: undefined,
  }, null, 2)
}

function curlFor(endpoint: string, chainId: string, probes: Array<Record<string, unknown>>) {
  return probes.map((probe) => `curl -sS -X POST "${endpoint}" \\
  -H "X-Flyto-API-Key: $FLYTO_AGENT_FIREWALL_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${probeBody(chainId, probe)}'`).join('\n\n')
}

export function AgentFirewallAttackLab() {
  const { org } = useOrg()
  const endpoint = org?.id ? mcpIngestEndpoint(org.id) : ''
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(id: string, text: string) {
    try {
      const copiedOk = await writeClipboardText(text)
      if (!copiedOk) return
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1400)
    } catch {
      setCopied(null)
    }
  }

  return (
    <Box sx={{ height: '100%', minHeight: 0, p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5, overflow: 'hidden' }}>
      <Alert severity="info" sx={{ flexShrink: 0, '& .MuiAlert-message': { lineHeight: 1.6 } }}>
        {t('agentFirewall.attackLabKeyNote')}
      </Alert>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: { xs: 0.5, sm: 1 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {CHAINS.map((chain) => {
          const curl = curlFor(endpoint, chain.id, chain.probes)
          return (
            <Paper
              key={chain.id}
              variant="outlined"
              sx={{
                borderRadius: 2.5,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                flex: '0 0 auto',
                maxHeight: { xs: 'min(520px, calc(100dvh - 180px))', md: 'min(620px, calc(100dvh - 210px))' },
              }}
            >
              <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flexShrink: 0 }}>
                <GitBranch size={16} style={{ color: BRAND }} />
                <Typography variant="subtitle2" fontWeight={800}>{chain.title}</Typography>
                <Chip size="small" label={chain.severity} sx={{ height: 22, fontSize: 12, fontWeight: 800, color: '#ef4444', bgcolor: 'rgba(239,68,68,0.10)' }} />
              </Box>
              <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflowY: 'auto' }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <ShieldAlert size={16} style={{ color: '#f59e0b', marginTop: 2, flexShrink: 0 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{chain.detects}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {chain.probes.map((probe, index) => (
                    <Chip
                      key={`${chain.id}-${index}`}
                      size="small"
                      label={`${index + 1}. ${String(probe.verb)} ${String(probe.toolName)}`}
                      sx={{ height: 26, fontSize: 12, fontWeight: 800 }}
                    />
                  ))}
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                      {t('agentFirewall.probeSequence')}
                    </Typography>
                    <Tooltip title={t('common.copy')}>
                      <IconButton size="small" onClick={() => copy(chain.id, curl)} aria-label={t('agentFirewall.copyProbe')}>
                        {copied === chain.id ? <Check size={14} /> : <Copy size={14} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box component="pre" sx={{
                    m: 0,
                    px: { xs: 1.5, sm: 2 },
                    py: 1.75,
                    minHeight: { xs: 180, md: 220 },
                    maxHeight: { xs: 240, md: 300 },
                    borderRadius: 1.5,
                    backgroundColor: '#020617',
                    color: '#e5e7eb',
                    border: '1px solid rgba(148, 163, 184, 0.24)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                    fontSize: 12,
                    lineHeight: 1.6,
                    overflow: 'auto',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {curl}
                  </Box>
                </Box>
              </Box>
            </Paper>
          )
        })}
      </Box>
    </Box>
  )
}
