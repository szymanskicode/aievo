import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createQueryClient } from '@/api/query-client';
import { createAppRouter } from '@/router';

/** Renders the whole app at `path` with a fresh cache, as a user would open that URL. */
export function renderApp(path: string) {
  const queryClient = createQueryClient();
  // Tests assert on the first answer; retries would only slow them down.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  const user = userEvent.setup();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...view, user, router, queryClient };
}
