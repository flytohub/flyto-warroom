import { PageShell } from '@atoms/PageShell'
import { AgentFirewallActivityView } from '@compounds/surface/mcp/AgentFirewallActivityView';

export default function AgentFirewallActivityPage() {
  return (
    <PageShell padded={false} scroll="host">
      <AgentFirewallActivityView />
    </PageShell>
  )
}
