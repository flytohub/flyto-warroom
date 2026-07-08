import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared/ModeView'
import { EvidenceReportsManagerView, EvidenceReportsView } from '@compounds/surface/mcp/AISecurityGovernanceViews';

export default function EvidenceReportsPage() {
  return <PageShell padded={false} scroll="host"><ModeView manager={<EvidenceReportsManagerView />} engineer={<EvidenceReportsView />} /></PageShell>
}
