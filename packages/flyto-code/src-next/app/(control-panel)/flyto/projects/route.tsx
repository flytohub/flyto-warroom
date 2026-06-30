import { lazy } from 'react';
import { FuseRouteConfigType } from '@fuse/utils/FuseUtils';

const ProjectsPage = lazy(() => import('./components/ProjectsPage'));

const route: FuseRouteConfigType = {
	path: 'projects',
	element: <ProjectsPage />,
	// The projects landing is the top-level "pick a project" screen — the
	// global left navbar has nothing to navigate here and just looks
	// monotonous, so hide it for a focused full-width landing. The rich
	// WorkspaceSidebar lives INSIDE a project. Toolbar (logo/avatar) stays.
	settings: {
		layout: {
			config: {
				navbar: { display: false },
			},
		},
	},
};

export default route;
