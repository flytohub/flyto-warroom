import { lazy } from 'react';
import { Navigate, useParams } from 'react-router';
import type { FuseRouteConfigType } from '@fuse/utils/FuseUtils';
import FeatureGate from '@atoms/FeatureGate';
import { MODULES } from '@code/modules';
import WorkspacePageLoader from './components/WorkspacePageLoader';

// Workspace shell.
const WorkspaceLayout = lazy(() => import('./components/WorkspaceLayout'));

// War-room dispatch — the legacy /warroom/:sectionId surface. Still
// alive for Architecture + Code Scans sub-items + as the
// backward-compat receiver for old promoted-item URLs.
const WarRoomPage = lazy(() => import('./components/pages/WarRoomPage'));

/**
 * Backward-compat: old war-room sub-item ids → new top-level paths.
 * Bookmarks pointing at /warroom/exp-findings (etc.) land on the
 * promoted route. Generated from `MODULES` for paths we know about;
 * legacy ids that mapped to renamed routes are listed explicitly.
 *
 * See `internal/permission/capabilities.yaml` for matching backend
 * page-id aliases.
 */
export const WARROOM_ID_REDIRECTS: Record<string, string> = {
  'exp-findings':       'findings',
  'exp-posture':        'posture-overview',
  'exp-ctem':           'ctem-actions',
  'exp-brand':          'brand-protection',
  'exp-paths':          'attack-paths',          // /attack-paths already top-level
  'exp-mitigations':    'mitigations',
  'exp-vendors':        'vendors',
  'history-ctem':       'audit-timeline',
  'history-vareport':   'va-report',
  'scoring-overview':   'scoring',
  'scoring-trends':     'score-trends',
  'scoring-compliance': 'compliance',
  // The 2026-05-22 cleanup: /threat-intel → /ioc-lookup
  // (single-page dashboard absorbed into 5 darkweb sub-modules).
  'threat-intel':       'ioc-lookup',
};

function WarRoomDispatch() {
  const { sectionId } = useParams<{ sectionId: string }>();
  if (sectionId && WARROOM_ID_REDIRECTS[sectionId]) {
    return <Navigate to={`../${WARROOM_ID_REDIRECTS[sectionId]}`} replace />;
  }
  // The legacy below-the-divider accordion (Architecture + Code Scans)
  // was collapsed into first-class modules on 2026-06-05. Old
  // /warroom/arch-* and /warroom/sec-* bookmarks forward to the new
  // inner-nav location so the URL bar reflects the modern IA while the
  // exact technical view still loads (WarRoomView is the same engine).
  if (sectionId?.startsWith('arch-')) {
    return <Navigate to={`../architecture/${sectionId}`} replace />;
  }
  if (sectionId?.startsWith('sec-')) {
    return <Navigate to={`../code-scans/${sectionId}`} replace />;
  }
  // Everything still registered but without a promoted home (history-va,
  // dormant cicd-*) renders through the thin WarRoomPage shim as before.
  return <WarRoomPage />;
}

// Route-level page gating — typing the URL directly hits the same
// FeatureGate the sidebar uses to hide the nav item, so a Code-only
// user can't sneak into /domains or /asset-map by guessing the path.
//
// Routes are generated from `MODULES` (types/modules.ts). Adding a
// new module = add one entry there; route + sidebar + full-bleed
// shell all auto-update.
const route: FuseRouteConfigType = {
	path: 'projects/:orgId',
	element: <WorkspaceLayout />,
	settings: {
		layout: {
			config: {
				navbar: { display: false },
				toolbar: { display: false },
				footer: { display: false },
			},
		},
	},
	children: [
		{ index: true, element: <Navigate to="verdict" replace /> },

		// /exec was a split-mode manager landing page. Keep old
		// bookmarks alive, but route users back to the canonical
		// data dashboard instead of showing an empty overview shell.
		{ path: 'exec', element: <Navigate to="../dashboard" replace /> },

		// Generated routes from MODULES manifest. Each module owns
		// its own guarded import + capability gate. Order matches the
		// manifest source order. WorkspacePageLoader catches failed
		// module imports locally so stale chunks don't trip the global
		// route ErrorBoundary.
		...MODULES.map(mod => {
			const gate = mod.capability ?? mod.id;
			return {
				path: mod.path,
				element: (
					<FeatureGate page={gate}>
						<WorkspacePageLoader moduleId={mod.id} modulePath={mod.path} load={mod.lazyImport} />
					</FeatureGate>
				),
			};
		}),

		// /threat-intel — explicit redirect for the legacy single-page
		// dashboard URL. Not in MODULES (no page wrapper); routed here
		// + via WARROOM_ID_REDIRECTS in WarRoomDispatch for the
		// /warroom/threat-intel form.
		{ path: 'threat-intel', element: <Navigate to="../ioc-lookup" replace /> },

		// /vulnerabilities — removed 2026-06-11. It rendered the same
		// IssuesView as Code Issues (just type=cve), so it was a duplicate.
		// Redirect old bookmarks to the unified Code Issues page.
		{ path: 'vulnerabilities', element: <Navigate to="../issues" replace /> },

		// War-room sections still serve Architecture / Code Scans
		// drill-down accordion (deep technical views grouped). Other
		// section ids hit WarRoomDispatch → Navigate to the new
		// top-level route so saved bookmarks survive the IA refactor.
		{ path: 'warroom/:sectionId', element: <WarRoomDispatch /> },
	],
};

export default route;
