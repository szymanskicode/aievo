import {
  membershipRoles,
  providerTypes,
  taskPriorities,
  taskStatuses,
  taskTypes,
} from '@aievo/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

export const membershipRoleEnum = pgEnum('membership_role', membershipRoles);
export const providerTypeEnum = pgEnum('provider_type', providerTypes);
export const taskTypeEnum = pgEnum('task_type', taskTypes);
export const taskPriorityEnum = pgEnum('task_priority', taskPriorities);
export const taskStatusEnum = pgEnum('task_status', taskStatuses);
