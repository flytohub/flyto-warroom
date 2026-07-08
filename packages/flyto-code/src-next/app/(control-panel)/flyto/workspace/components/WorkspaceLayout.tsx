import { Outlet, useLocation, useParams, Navigate } from 'react-router';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import { useOrg } from '@hooks/useOrg';
import { useOrgEvents } from '@hooks/useOrgEvents';
import { RepoFilterProvider } from '@hooks/useRepoFilter';
import { FixQueueProvider } from '@/contexts/FixQueueContext';
import { ExperienceProvider } from '@/contexts/ExperienceContext';
import { IntegrationHealthBanner } from '@compounds/layout/IntegrationHealthBanner';
import { FixQueueDrawer } from '@compounds/fix-queue/FixQueueDrawer';
import WorkspaceSidebar from './WorkspaceSidebar';
import ContentToolbar from './ContentToolbar';

// Pages that need full-bleed canvas (no padding, no scroll, fill entire area).
//
// Derived from the MODULES manifest (types/modules.ts). Every module
// with `fullBleed: true` ends up here. The previously-handmaintained
// list of 28 paths drifted twice when new routes were added without
// also updating it ([[feedback_full_bleed_path_list]]); deriving
// removes the failure mode. War-room dispatch route is added
// explicitly since it's not a MODULES entry.
import { getFullBleedPaths } from '@code/modules';
const FULL_BLEED_PAGES = [...getFullBleedPaths(), '/warroom', '/threat-intel'];

function WorkspaceInner() {
  const { org, ready } = useOrg();
  const { orgId } = useParams();
  const location = useLocation();
  useOrgEvents(org?.id);

  // Wait for orgs to load before deciding
  if (!ready) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Org doesn't exist (deleted, wrong URL) → redirect to projects
  if (!org && orgId) {
    return <Navigate to="/projects" replace />;
  }

  const base = `/projects/${orgId}`;
  const subPath = location.pathname.replace(base, '');
  const isFullBleed = FULL_BLEED_PAGES.some(p => subPath === p || subPath.startsWith(p + '/'));

  return (
    <Box sx={{
      display: 'flex',
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
    }}>
      <WorkspaceSidebar />

      {/* Content area — toolbar + page */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative', zIndex: 1 }}>
        {/* Toolbar — only in content area, not over sidebar */}
        <ContentToolbar />
        <Divider />
        {/* Integration health banner — only renders when GitHub
            credentials are expired. Hidden otherwise. Live-pinged
            on workspace mount + window focus. */}
        {org?.id && <IntegrationHealthBanner orgId={org.id} />}

	        {isFullBleed ? (
	          <Box data-testid="workspace-main-content" sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
	            <Outlet />
	          </Box>
	        ) : (
	          <Box data-testid="workspace-main-scroll" sx={{ flex: 1, overflow: 'auto' }}>
	            <Box data-testid="workspace-main-content" sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 1.5, sm: 3, md: 4 }, py: { xs: 2, md: 3 }, minWidth: 0 }}>
	              <Outlet />
	            </Box>
	          </Box>
        )}
      </Box>

      {/* Fix queue right-side drawer — opens from any "Walk me
          through fixing" CTA on dashboard / pulse / cross-dim tile. */}
      <FixQueueDrawer />
    </Box>
  );
}

export default function WorkspaceLayout() {
  return (
    <RepoFilterProvider>
      <FixQueueProvider>
        <ExperienceProvider>
          <WorkspaceInner />
        </ExperienceProvider>
      </FixQueueProvider>
    </RepoFilterProvider>
  );
}
