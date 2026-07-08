import Box from '@mui/material/Box';
import { RepoListView } from '@compounds/repos/RepoListView';
import { RepoListManagerView } from '@compounds/repos/RepoListManagerView';
import { ModeView } from '@compounds/_shared';
import { useNavigate, useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';

export default function ReposPage() {
  const navigate = useNavigate();
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <WorkspaceRouteFallback />;

  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={
          <Box sx={{ height: '100%', overflow: 'hidden' }}>
            <RepoListManagerView orgId={orgId} />
          </Box>
        }
        engineer={
          <RepoListView onSelectRepo={(id) => navigate(`/projects/${orgId}/repos/${id}`)} />
        }
      />
    </PageShell>
  );
}
