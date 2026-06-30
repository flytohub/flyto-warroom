import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { sectionToPath } from './sectionNav';
import { VerdictDashboardView } from '@compounds/verdict/VerdictDashboardView';

export default function VerdictDashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const onNavigate = useCallback(
    (s: string) => { if (orgId) navigate(sectionToPath(s, orgId)); },
    [navigate, orgId],
  );

  if (!orgId) return <WorkspaceRouteFallback />;

  return (
    <PageShell padded={false} scroll="host">
      <VerdictDashboardView orgId={orgId} onNavigate={onNavigate} />
    </PageShell>
  );
}
