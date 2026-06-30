import { useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { ModeView } from '@compounds/_shared';
import { MitigationsView } from '@compounds/exposure/MitigationsView';
import { MitigationsManagerView } from '@compounds/exposure/MitigationsManagerView';

// Engineer view = today's operator catalog (add / edit / verify /
// evidence ledger), preserved verbatim. Manager view layers the
// trust-decay dashboard on top via ModeView (top-bar toggle).

export default function MitigationsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <WorkspaceRouteFallback />;
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<MitigationsManagerView orgId={orgId} />}
        engineer={<MitigationsView orgId={orgId} />}
      />
    </PageShell>
  );
}
