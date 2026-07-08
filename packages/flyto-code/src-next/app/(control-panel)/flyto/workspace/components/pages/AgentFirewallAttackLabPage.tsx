import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared/ModeView'
import { AgentFirewallAttackLab, AgentFirewallAttackLabManagerView } from '@components/compounds/surface/mcp/AgentFirewallAttackLab';

export default function AgentFirewallAttackLabPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView manager={<AgentFirewallAttackLabManagerView />} engineer={<AgentFirewallAttackLab />} />
    </PageShell>
  )
}
