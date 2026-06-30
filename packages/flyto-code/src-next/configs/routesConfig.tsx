import { FuseRoutesType } from '@fuse/utils/FuseUtils';
import { Navigate } from 'react-router';
import FuseLoading from '@fuse/core/FuseLoading';
import ErrorBoundary from '@fuse/utils/ErrorBoundary';
import { layoutConfigOnlyMain } from './layoutConfigTemplates';
import App from '@/app/App';

// Auto-import flyto route files
const routeModules: Record<string, unknown> = import.meta.glob(
	'/src-next/app/**/route.tsx',
	{ eager: true }
);

const childRoutes = Object.keys(routeModules)
	.map((path) => {
		const mod = routeModules[path] as { default: any };
		const configs = mod.default;
		return Array.isArray(configs) ? configs : [configs];
	})
	.flat();

const routes: FuseRoutesType = [
	{
		path: '/',
		element: <App />,
		auth: null,
		errorElement: <ErrorBoundary />,
		children: [
			{ path: '/', element: <Navigate to="/projects" /> },
			...childRoutes,
			{ path: 'loading', element: <FuseLoading />, settings: { layout: layoutConfigOnlyMain } },
		],
	},
	{ path: '*', element: <Navigate to="/projects" /> },
];

export default routes;
