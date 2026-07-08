import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared/ModeView'
import { McpManagerView, McpView } from '@compounds/surface/mcp/McpView';

/**
 * Agent Firewall surface — tabbed product view over the guardian backend
 * (flyto-engine PR #209): Overview (servers/tools/decisions), Policy &
 * Enforcement (rollout-mode control + simulate-before-enable), and Egress
 * Risk (sensitive-data egress + decision explanations).
 */
export default function McpPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView manager={<McpManagerView />} engineer={<McpView />} />
    </PageShell>
  )
}
