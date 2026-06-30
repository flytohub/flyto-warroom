import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { sectionToPath } from './sectionNav';
import { WarRoomView } from '@compounds/warroom';

export default function WarRoomPage() {
  const { sectionId, orgId } = useParams<{ sectionId: string; orgId: string }>();
  const navigate = useNavigate();
  const onNavigate = useCallback((s: string) => { if (orgId) navigate(sectionToPath(s, orgId)); }, [navigate, orgId]);

  if (!orgId) return <WorkspaceRouteFallback />;
  if (!sectionId) return <WorkspaceRouteFallback kind="section" orgId={orgId} />;

  return (
    <PageShell padded={false} scroll="host">
      <WarRoomView activeSection={sectionId} onNavigate={onNavigate} />
    </PageShell>
  );
}
