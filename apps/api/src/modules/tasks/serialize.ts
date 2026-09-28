import type { Task } from '@aievo/db';
import type { TaskDto } from '@aievo/shared';

export function serializeTask(row: Task): TaskDto {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
