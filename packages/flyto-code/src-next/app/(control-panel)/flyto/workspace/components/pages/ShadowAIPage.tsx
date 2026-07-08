import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared/ModeView'
import { ShadowAIManagerView, ShadowAIView } from '@compounds/surface/mcp/AISecurityGovernanceViews';

export default function ShadowAIPage() {
  return <PageShell padded={false} scroll="host"><ModeView manager={<ShadowAIManagerView />} engineer={<ShadowAIView />} /></PageShell>
}
