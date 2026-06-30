import { useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { ModeView } from '@compounds/_shared';
import { FootprintEngineerView } from '@compounds/footprint/FootprintEngineerView';
import { FootprintManagerView } from '@compounds/footprint/FootprintManagerView';

export default function FootprintPage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <WorkspaceRouteFallback />;
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<FootprintManagerView orgId={orgId} />}
        engineer={<FootprintEngineerView orgId={orgId} />}
      />
    </PageShell>
  );
}
