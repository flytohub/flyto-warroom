import { PageShell } from '@atoms/PageShell'
import { AIGovernanceView } from '@compounds/surface/mcp/AISecurityGovernanceViews';

export default function AIGovernancePage() {
  return <PageShell padded={false} scroll="host"><AIGovernanceView /></PageShell>
}
