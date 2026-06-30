import type { FuseRouteItemType } from '@components/adapters/RouteTypes';
import { layoutConfigOnlyMain } from '@/configs/layoutConfigTemplates';
import SecurityPageView from './components/views/SecurityPageView';
import TrustPageView from './components/views/TrustPageView';
import PrivacyPageView from './components/views/PrivacyPageView';
import TermsPageView from './components/views/TermsPageView';
import BetaPageView from './components/views/BetaPageView';

const route: FuseRouteItemType = {
	path: '',
	children: [
		{
			path: 'security',
			element: <SecurityPageView />,
			settings: { layout: layoutConfigOnlyMain },
			auth: null,
		},
		{
			path: 'trust',
			element: <TrustPageView />,
			settings: { layout: layoutConfigOnlyMain },
			auth: null,
		},
		{
			path: 'privacy',
			element: <PrivacyPageView />,
			settings: { layout: layoutConfigOnlyMain },
			auth: null,
		},
		{
			path: 'terms',
			element: <TermsPageView />,
			settings: { layout: layoutConfigOnlyMain },
			auth: null,
		},
		{
			path: 'beta',
			element: <BetaPageView />,
			settings: { layout: layoutConfigOnlyMain },
			auth: null,
		},
	],
};

export default route;
