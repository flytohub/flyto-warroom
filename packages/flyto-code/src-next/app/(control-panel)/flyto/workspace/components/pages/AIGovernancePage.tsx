import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared/ModeView'
import { AIGovernanceManagerView, AIGovernanceView } from '@compounds/surface/mcp/AISecurityGovernanceViews';

export default function AIGovernancePage() {
  return <PageShell padded={false} scroll="host"><ModeView manager={<AIGovernanceManagerView />} engineer={<AIGovernanceView />} /></PageShell>
}
