import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { ModeView } from '@compounds/_shared';
import { sectionToPath } from './sectionNav';
import { IssuesView } from '@compounds/security/IssuesView';
import { IssuesManagerView } from '@compounds/exposure/IssuesManagerView';

// Engineer view = the existing code-security issues queue, unchanged.

// Manager view = the new code-security summary dashboard.

export default function IssuesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const onNavigate = useCallback((s: string) => { if (orgId) navigate(sectionToPath(s, orgId)); }, [navigate, orgId]);

  if (!orgId) return <WorkspaceRouteFallback />;

  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<IssuesManagerView />}
        engineer={<IssuesView onNavigate={onNavigate} />}
      />
    </PageShell>
  );
}
