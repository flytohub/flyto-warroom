import { useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { ModeView } from '@compounds/_shared';
import { AuditTimelineView } from '@compounds/history/HistoryFeedView';
import { AuditTimelineManagerView } from '@compounds/history/AuditTimelineManagerView';

export default function AuditTimelinePage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <WorkspaceRouteFallback />;
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<AuditTimelineManagerView orgId={orgId} />}
        engineer={<AuditTimelineView orgId={orgId} />}
      />
    </PageShell>
  );
}
