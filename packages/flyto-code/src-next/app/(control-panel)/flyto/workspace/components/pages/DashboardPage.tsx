import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { DataBoundary } from '@atoms/DataBoundary';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { DashboardView } from '@compounds/dashboard/DashboardView';
import { useOrg } from '@hooks/useOrg';
import { sectionToPath } from './sectionNav';

export default function DashboardPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { org, loading: orgLoading, ready: orgReady, error: orgError } = useOrg();

  const onNavigate = useCallback((section: string) => {
    if (orgId) navigate(sectionToPath(section, orgId));
  }, [navigate, orgId]);

  if (!orgId) return <WorkspaceRouteFallback />;
  if (orgReady && !org) return <WorkspaceRouteFallback />;

  if ((orgLoading && !org) || orgError) {
    return (
      <PageShell scroll="self" maxWidth={1200}>
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

  return (
    <PageShell scroll="self" maxWidth="none" padded={false}>
      <DashboardView onNavigate={onNavigate} />
    </PageShell>
  );
}
