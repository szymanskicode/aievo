import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { z } from 'zod';

import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorState } from '@/components/states/ErrorState';
import { NotFound } from '@/components/states/NotFound';
import { BoardPage } from '@/features/board/BoardPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ProvidersPage } from '@/features/providers/ProvidersPage';

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
  component: ProjectsPage,
});

/** `?task=new` opens the form for a new task, `?task=<id>` edits that task. */
const boardSearchSchema = z.object({
  task: z
    .union([z.literal('new'), z.uuid()])
    .optional()
    .catch(undefined),
});

export type BoardSearch = z.infer<typeof boardSearchSchema>;

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  validateSearch: boardSearchSchema,
  component: function BoardRoute() {
    const { projectId } = boardRoute.useParams();
    const { task } = boardRoute.useSearch();
    return <BoardPage projectId={projectId} task={task} />;
  },
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
  component: ProvidersPage,
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
    defaultPreload: 'intent',
    // Data comes from TanStack Query, which has its own cache.
    defaultPreloadStaleTime: 0,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
