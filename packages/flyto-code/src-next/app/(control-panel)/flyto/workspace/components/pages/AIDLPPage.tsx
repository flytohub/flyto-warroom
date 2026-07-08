import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared/ModeView'
import { AIDLPManagerView, AIDLPView } from '@compounds/surface/mcp/AISecurityGovernanceViews';

export default function AIDLPPage() {
  return <PageShell padded={false} scroll="host"><ModeView manager={<AIDLPManagerView />} engineer={<AIDLPView />} /></PageShell>
}
