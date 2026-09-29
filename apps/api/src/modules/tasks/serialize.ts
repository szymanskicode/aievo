import { listLatestTaskRuns } from '@aievo/db';
import type { Db, RunSummary, Task } from '@aievo/db';
import type { TaskDto } from '@aievo/shared';

export function serializeTask(row: Task, latestRun: RunSummary | null): TaskDto {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    status: row.status,
    acceptanceCriteria: row.acceptanceCriteria,
    labels: row.labels,
    position: row.position,
    parentId: row.parentId,
    latestRun: latestRun && {
      id: latestRun.id,
      status: latestRun.status,
      prUrl: latestRun.prUrl,
      prNumber: latestRun.prNumber,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Serializes tasks together with their newest runs, read in one query. */
export async function serializeTasks(
  db: Db,
  workspaceId: string,
  rows: Task[],
): Promise<TaskDto[]> {
  const latest = await listLatestTaskRuns(
    db,
    workspaceId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => serializeTask(row, latest.get(row.id) ?? null));
}

export async function serializeOneTask(db: Db, workspaceId: string, row: Task): Promise<TaskDto> {
  const [dto] = await serializeTasks(db, workspaceId, [row]);
  if (!dto) throw new Error('Serializing a task returned nothing');
  return dto;
}
