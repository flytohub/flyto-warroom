import { lazy } from 'react';
import { FuseRouteConfigType } from '@fuse/utils/FuseUtils';

const CapabilityPage = lazy(() => import('./components/CapabilityPage'));

const route: FuseRouteConfigType = {
	children: [
		{ path: 'capability/:capId', element: <CapabilityPage /> },
	],
};

export default route;
