import { FuseRouteItemType } from '@fuse/utils/FuseUtils';
import ExploreHomeView from './components/ExploreHomeView';
import ExploreIndustryView from './components/ExploreIndustryView';
import ExploreScorecardView from './components/ExploreScorecardView';
import CommunityDemoView from './components/CommunityDemoView';

// HONEST PATH NOTE — 2026-05-19
//
// This folder is under `(public)/` and every route below declares
// `auth: null`, but in reality the `/explore/*` surface is SIGN-IN
// ONLY since the 2026-05-18 lockdown. The `RequireAuth` wrapper in
// src-next/app/App.tsx blocks anonymous traffic before the Fuse
// `auth: null` declaration ever takes effect — `auth: null` is a
// per-route Fuse convention we're overriding at a higher layer.
//
// Why we keep the (public) folder grouping:
//
//   1. Fuse's `(public)` parent group suppresses the workspace chrome
//      (no left nav, no top toolbar) which is what we want for the
//      market-intel scorecard view — it's an internal sales / bench-
//      marking tool, not a panel inside the war room. The "(public)"
//      label is about LAYOUT, not actual public-internet access.
//
//   2. Renaming to (control-panel)/(market-intel)/ would re-introduce
//      the warroom chrome unless we re-add the layout-suppression
//      block to every route — net zero readability gain for non-zero
//      churn risk.
//
// See feedback_explore_lockdown.md + project_public_explore_portal.md
// for the legal posture + user-confirmed intent.

// Public-explore layout — chrome suppressed so the directory view
// reads as a standalone market-intel page, not a war-room panel.
// Same suppression set as the auth views.
const explorePageLayout = {
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
			path: 'community',
			element: <CommunityDemoView />,
			settings: explorePageLayout,
			auth: null,
		},
		{
			path: 'explore',
			element: <ExploreHomeView />,
			settings: explorePageLayout,
			auth: null,
		},
		{
			path: 'explore/industry/:industry',
			element: <ExploreIndustryView />,
			settings: explorePageLayout,
			auth: null,
		},
		{
			// Domain is URL-encoded by the caller; React Router decodes
			// automatically. We accept any string and let the backend
			// 404 unknowns rather than gating on a regex here.
			path: 'explore/:domain',
			element: <ExploreScorecardView />,
			settings: explorePageLayout,
			auth: null,
		},
	],
};

export default route;
