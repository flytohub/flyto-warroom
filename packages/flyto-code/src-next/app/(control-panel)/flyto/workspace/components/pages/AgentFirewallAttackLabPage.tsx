import { PageShell } from '@atoms/PageShell'
import { AgentFirewallAttackLab } from '@components/compounds/surface/mcp/AgentFirewallAttackLab';

export default function AgentFirewallAttackLabPage() {
  return (
    <PageShell padded={false} scroll="host">
      <AgentFirewallAttackLab />
    </PageShell>
  )
}
