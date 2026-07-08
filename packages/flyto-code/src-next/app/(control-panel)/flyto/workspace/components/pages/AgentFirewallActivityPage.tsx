import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared/ModeView'
import { AgentFirewallActivityManagerView, AgentFirewallActivityView } from '@compounds/surface/mcp/AgentFirewallActivityView';

export default function AgentFirewallActivityPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView manager={<AgentFirewallActivityManagerView />} engineer={<AgentFirewallActivityView />} />
    </PageShell>
  )
}
