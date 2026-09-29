import { getRouteApi } from '@tanstack/react-router';

import { BoardPage } from './BoardPage';

const route = getRouteApi('/projects/$projectId');

/** The board page with its URL state: the project from the path, the open task from `?task=`. */
export function BoardRoute() {
  const { projectId } = route.useParams();
  const { task } = route.useSearch();
  return <BoardPage projectId={projectId} task={task} />;
}
