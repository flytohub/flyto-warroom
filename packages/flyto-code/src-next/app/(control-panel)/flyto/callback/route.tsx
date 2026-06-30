import { lazy } from 'react';
import { FuseRouteConfigType } from '@fuse/utils/FuseUtils';
import { layoutConfigOnlyMain } from '@/configs/layoutConfigTemplates';

const GitLabCallbackPage = lazy(() =>
  import('./GitLabCallbackPage').then(m => ({ default: m.GitLabCallbackPage }))
);

const GitHubAppCallbackPage = lazy(() =>
  import('./GitHubAppCallbackPage').then(m => ({ default: m.GitHubAppCallbackPage }))
);

const routes: FuseRouteConfigType[] = [
  {
    path: 'callback/gitlab',
    element: <GitLabCallbackPage />,
    settings: { layout: layoutConfigOnlyMain },
  },
  {
    path: 'callback/github-app',
    element: <GitHubAppCallbackPage />,
    settings: { layout: layoutConfigOnlyMain },
  },
];

export default routes;
