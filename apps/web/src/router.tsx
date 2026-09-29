import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { z } from 'zod';

import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorState } from '@/components/states/ErrorState';
import { NotFound } from '@/components/states/NotFound';

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppLayout,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <ErrorState error={error} title="This page failed" onRetry={reset} />
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/projects' });
  },
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  // Each page is its own chunk, loaded when its route is first opened.
  component: lazyRouteComponent(() => import('@/features/projects/ProjectsPage'), 'ProjectsPage'),
});

/** `?task=new` opens the form for a new task, `?task=<id>` edits that task. */
const boardSearchSchema = z.object({
  task: z
    .union([z.literal('new'), z.uuid()])
    .optional()
    .catch(undefined),
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  validateSearch: boardSearchSchema,
  component: lazyRouteComponent(() => import('@/features/board/BoardRoute'), 'BoardRoute'),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/, '') === '/settings') {
      throw redirect({ to: '/settings/providers' });
    }
  },
});

const providersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/providers',
  component: lazyRouteComponent(
    () => import('@/features/providers/ProvidersPage'),
    'ProvidersPage',
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectsRoute,
  boardRoute,
  settingsRoute.addChildren([providersRoute]),
]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    ...(history ? { history } : {}),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
