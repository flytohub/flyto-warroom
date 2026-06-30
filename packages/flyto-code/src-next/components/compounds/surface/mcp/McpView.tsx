/**
 * McpView — the Agent Firewall product surface. Tabs over the three planes
 * the guardian backend exposes (flyto-engine PR #209):
 *   • Overview   — registered servers, tool inventory, recent decisions
 *   • Policy     — rollout-mode control plane + simulate-before-enable
 *   • Egress     — sensitive-data egress risk + decision explanations
 * Each tab owns its own fetch + empty state; the shell just routes.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { ShieldCheck } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { TabBar } from '@atoms/TabBar'
import { t } from '@lib/i18n';
import { McpOverviewView } from '../McpOverviewView'
import { McpPolicyView } from './McpPolicyView'
import { McpEgressView } from './McpEgressView'

const BRAND = '#7c3aed'

export type AgentFirewallTab = 'overview' | 'policy' | 'egress'

export function McpView({ initialTab = 'overview' }: { initialTab?: AgentFirewallTab }) {
  const { org } = useOrg()
  const [tab, setTab] = useState<AgentFirewallTab>(initialTab)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ShieldCheck size={22} style={{ color: BRAND }} />
        <Typography variant="h5" fontWeight={800}>{t('agentFirewall.title')}</Typography>
      </Box>
      <Box sx={{ px: 3 }}>
        <TabBar
          accentColor={BRAND}
          value={tab}
          onChange={(v) => setTab(v as AgentFirewallTab)}
          items={[
            { value: 'overview', label: t('agentFirewall.tabOverview') },
            { value: 'policy', label: t('agentFirewall.tabPolicy') },
            { value: 'egress', label: t('agentFirewall.tabEgress') },
          ]}
        />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'overview' && <McpOverviewView />}
        {tab === 'policy' && org?.id && <McpPolicyView orgId={org.id} />}
        {tab === 'egress' && org?.id && <McpEgressView orgId={org.id} />}
      </Box>
    </Box>
  )
}
