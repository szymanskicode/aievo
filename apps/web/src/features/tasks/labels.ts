import type { TaskPriority, TaskStatus, TaskType } from '@aievo/shared';

/** Display names of the shared enums; the values themselves come from `@aievo/shared`. */
export const statusLabels: Record<TaskStatus, string> = {
  draft: 'Draft',
  clarifying: 'Clarifying',
  ready: 'Ready',
  running: 'Running',
  needs_human: 'Needs human',
  in_review: 'In review',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const typeLabels: Record<TaskType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  refactor: 'Refactor',
  test: 'Test',
  chore: 'Chore',
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
