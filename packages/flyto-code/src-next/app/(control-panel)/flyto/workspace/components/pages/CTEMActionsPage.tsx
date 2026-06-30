import { useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { ModeView } from '@compounds/_shared';
import { CTEMActionsView } from '@compounds/exposure/CTEMActionsView';
import { CTEMManagerView } from '@compounds/exposure/CTEMManagerView';

// Engineer view = the existing prioritization war-room, unchanged.

// Manager view = the new $ impact / SLA / noise-reduction dashboard.

export default function CTEMActionsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <WorkspaceRouteFallback />;
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<CTEMManagerView orgId={orgId} />}
        engineer={<CTEMActionsView orgId={orgId} />}
      />
    </PageShell>
  );
}
