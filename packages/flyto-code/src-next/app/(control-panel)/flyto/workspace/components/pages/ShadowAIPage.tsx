import { PageShell } from '@atoms/PageShell'
import { ShadowAIView } from '@compounds/surface/mcp/AISecurityGovernanceViews';

export default function ShadowAIPage() {
  return <PageShell padded={false} scroll="host"><ShadowAIView /></PageShell>
}
