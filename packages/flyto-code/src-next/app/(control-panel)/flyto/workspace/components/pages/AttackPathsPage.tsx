import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { ModeView } from '@compounds/_shared';
import { sectionToPath } from './sectionNav';
import { AttackPathsView } from '@compounds/attack-paths/AttackPathsView';
import { AttackPathsManagerView } from '@compounds/attack-paths/AttackPathsManagerView';

export default function AttackPathsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const onNavigate = useCallback(
    (s: string) => { if (orgId) navigate(sectionToPath(s, orgId)); },
    [navigate, orgId],
  );

  if (!orgId) return <WorkspaceRouteFallback />;

  // AttackPathsView owns its own header + scrollable body (engineer lens).
  // Manager lens layers an executive risk dashboard on top via ModeView.
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<AttackPathsManagerView />}
        engineer={<AttackPathsView onNavigate={onNavigate} />}
      />
    </PageShell>
  );
}
