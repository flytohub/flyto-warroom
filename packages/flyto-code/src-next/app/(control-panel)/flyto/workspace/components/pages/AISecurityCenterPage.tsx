import { PageShell } from '@atoms/PageShell'
import { AISecurityCenterView } from '@components/compounds/surface/mcp/AISecurityGovernanceViews';

export default function AISecurityCenterPage() {
  return (
    <PageShell padded={false} scroll="host">
      <AISecurityCenterView />
    </PageShell>
  )
}
