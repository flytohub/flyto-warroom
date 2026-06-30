import { PageShell } from '@atoms/PageShell'
import { AIDLPView } from '@compounds/surface/mcp/AISecurityGovernanceViews';

export default function AIDLPPage() {
  return <PageShell padded={false} scroll="host"><AIDLPView /></PageShell>
}
