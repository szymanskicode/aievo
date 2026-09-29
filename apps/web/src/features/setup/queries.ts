import { unwrap } from '@aievo/api-client';
import { queryOptions } from '@tanstack/react-query';

import { api } from '@/api/client';
import { SETUP_STATUS_KEY } from '@/api/query-client';

/** First-run checklist, derived by the API from the workspace's data. */
export const setupStatusQuery = () =>
  queryOptions({
    queryKey: SETUP_STATUS_KEY,
    queryFn: ({ signal }) => unwrap(api.GET('/api/setup-status', { signal })),
  });
