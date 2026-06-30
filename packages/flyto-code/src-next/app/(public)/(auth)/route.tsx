import { FuseRouteItemType } from '@fuse/utils/FuseUtils';
import authRoles from '@auth/authRoles';
import SignInPageView from './components/views/SignInPageView';
import SignUpPageView from './components/views/SignUpPageView';
import SignOutPageView from './components/views/SignOutPageView';
import ForgotPasswordPageView from './components/views/ForgotPasswordPageView';

// Auth-page layout suppression — every public auth surface uses the
// chrome-less split-screen view (no nav/toolbar/footer/sidepanels). Kept
// inline here so the three+ routes don't drift in what they hide.
const authPageLayout = {
	layout: {
		config: {
			navbar: { display: false },
			toolbar: { display: false },
			footer: { display: false },
			leftSidePanel: { display: false },
			rightSidePanel: { display: false },
		},
	},
};

const route: FuseRouteItemType = {
	children: [
		{
			path: 'sign-in',
			element: <SignInPageView />,
			settings: {
				layout: {
					config: {
						navbar: {
							display: false
						},
						toolbar: {
							display: false
						},
						footer: {
							display: false
						},
						leftSidePanel: {
							display: false
						},
						rightSidePanel: {
							display: false
						}
					}
				}
			},
			auth: authRoles.onlyGuest // []
		},
		{
			path: 'sign-up',
			element: <SignUpPageView />,
			settings: {
				layout: {
					config: {
						navbar: {
							display: false
						},
						toolbar: {
							display: false
						},
						footer: {
							display: false
						},
						leftSidePanel: {
							display: false
						},
						rightSidePanel: {
							display: false
						}
					}
				}
			},
			auth: authRoles.onlyGuest
		},
		{
			path: 'sign-out',
			element: <SignOutPageView />,
			settings: authPageLayout,
			auth: null
		},
		{
			path: 'forgot-password',
			element: <ForgotPasswordPageView />,
			settings: authPageLayout,
			auth: authRoles.onlyGuest
		}
	]
};

export default route;
