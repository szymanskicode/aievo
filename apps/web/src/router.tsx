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
import { SettingsLayout } from '@/components/layout/SettingsLayout';
import { ErrorState } from '@/components/states/ErrorState';
import { NotFound } from '@/components/states/NotFound';

export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Each page is its own chunk, loaded when its route is first opened. Kept in one place so
 * tests can load them all up front (`preloadPages`) instead of inside a single test.
 */
const pages = {
  projects: () => import('@/features/projects/ProjectsPage'),
  projectWizard: () => import('@/features/projects/wizard/ProjectWizardPage'),
  board: () => import('@/features/board/BoardRoute'),
  providers: () => import('@/features/providers/ProvidersPage'),
  githubSettings: () => import('@/features/github/GitHubSettingsPage'),
};

export async function preloadPages(): Promise<void> {
  await Promise.all(Object.values(pages).map((load) => load()));
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
  component: lazyRouteComponent(pages.projects, 'ProjectsPage'),
});

/** `?task=new` opens the form for a new task, `?task=<id>` edits that task. */
const boardSearchSchema = z.object({
  task: z
    .union([z.literal('new'), z.uuid()])
    .optional()
    .catch(undefined),
});

const newProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/new',
  component: lazyRouteComponent(pages.projectWizard, 'ProjectWizardPage'),
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  validateSearch: boardSearchSchema,
  component: lazyRouteComponent(pages.board, 'BoardRoute'),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/, '') === '/settings') {
      throw redirect({ to: '/settings/providers' });
    }
  },
});

const providersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/providers',
  component: lazyRouteComponent(pages.providers, 'ProvidersPage'),
});

const githubSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/github',
  component: lazyRouteComponent(pages.githubSettings, 'GitHubSettingsPage'),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectsRoute,
  newProjectRoute,
  boardRoute,
  settingsRoute.addChildren([providersRoute, githubSettingsRoute]),
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
