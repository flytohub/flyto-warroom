import Box from '@mui/material/Box';
import { useParams } from 'react-router';
import { useConnectedRepos } from '@hooks/useOrg';
import { useOrg } from '@hooks/useOrg';
import { PageShell } from '@atoms/PageShell';
import { DataBoundary } from '@atoms/DataBoundary';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { ModeView } from '@compounds/_shared';
import { RepoDetailManagerView } from '@compounds/repos/RepoDetailManagerView';
import { RepoDetailView } from '@compounds/repos/RepoDetailView';
import { queryResolved } from '@lib/queryState';

export default function RepoDetailPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const { org, loading: orgLoading, ready: orgReady, error: orgError } = useOrg();
  const reposQ = useConnectedRepos(org?.id);
  const reposReady = queryResolved(reposQ, !!org?.id);
  const repo = reposQ.data?.find((r) => r.id === repoId) ?? null;

  if (!repoId) return <WorkspaceRouteFallback kind="repo" orgId={org?.id} />;
  if (orgReady && !org) return <WorkspaceRouteFallback />;

  if ((orgLoading && !org) || orgError) {
    return (
      <PageShell padded={false} scroll="host">
        <DataBoundary
          isLoading={orgLoading && !org}
          isError={!!orgError}
          error={orgError}
          hasData={false}
          label="workspace"
          loadingVariant="spinner"
        >
          <span />
        </DataBoundary>
      </PageShell>
    );
  }

  if (!orgReady || !reposReady || reposQ.isError || reposQ.data == null) {
    return (
      <PageShell padded={false} scroll="host">
        <DataBoundary
          isLoading={!orgReady || !reposReady}
          isError={reposQ.isError}
          error={reposQ.error}
          onRetry={() => { void reposQ.refetch(); }}
          hasData={reposQ.data != null}
          label="repositories"
          loadingVariant="spinner"
        >
          <span />
        </DataBoundary>
      </PageShell>
    );
  }

  if (!repo) return <WorkspaceRouteFallback kind="repo" orgId={org?.id} />;

  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={
          <Box sx={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <RepoDetailManagerView repoId={repoId} repo={repo} orgId={org?.id} />
          </Box>
        }
        engineer={
          // Scan & Remediation Ops (scan controls, AI CVE-bump proposals,
          // verify timeline) are now folded into RepoDetailView's Overview and
          // Fix Plan tabs — no separate strip above the detail view.
          <Box sx={{ height: '100%', minHeight: 0 }}>
            <RepoDetailView repoId={repoId} repo={repo} />
          </Box>
        }
      />
    </PageShell>
  );
}
