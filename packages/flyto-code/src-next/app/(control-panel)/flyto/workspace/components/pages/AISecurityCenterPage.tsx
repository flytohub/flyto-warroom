import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared/ModeView'
import { AISecurityCenterManagerView, AISecurityCenterView } from '@components/compounds/surface/mcp/AISecurityGovernanceViews';

export default function AISecurityCenterPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView manager={<AISecurityCenterManagerView />} engineer={<AISecurityCenterView />} />
    </PageShell>
  )
}
