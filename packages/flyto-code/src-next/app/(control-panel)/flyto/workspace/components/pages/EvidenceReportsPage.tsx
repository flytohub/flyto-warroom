import { PageShell } from '@atoms/PageShell'
import { EvidenceReportsView } from '@compounds/surface/mcp/AISecurityGovernanceViews';

export default function EvidenceReportsPage() {
  return <PageShell padded={false} scroll="host"><EvidenceReportsView /></PageShell>
}
