import { z } from 'zod';

/**
 * Enum values shared by the database (pgEnum), API validation and the frontend.
 * The tuples are the single source of truth; never repeat the literals elsewhere.
 */

export const membershipRoles = ['owner', 'member', 'viewer'] as const;
export const membershipRoleSchema = z.enum(membershipRoles);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const providerTypes = ['anthropic', 'openai', 'openai-compatible'] as const;
export const providerTypeSchema = z.enum(providerTypes).meta({ id: 'ProviderType' });
export type ProviderType = z.infer<typeof providerTypeSchema>;

export const taskTypes = ['feature', 'bug', 'refactor', 'test', 'chore'] as const;
export const taskTypeSchema = z.enum(taskTypes).meta({ id: 'TaskType' });
export type TaskType = z.infer<typeof taskTypeSchema>;

export const taskPriorities = ['low', 'medium', 'high'] as const;
export const taskPrioritySchema = z.enum(taskPriorities).meta({ id: 'TaskPriority' });
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/** Task lifecycle from docs/architecture.md, section 8. */
export const taskStatuses = [
  'draft',
  'clarifying',
  'ready',
  'running',
  'needs_human',
  'in_review',
  'done',
  'failed',
  'cancelled',
] as const;
export const taskStatusSchema = z.enum(taskStatuses).meta({ id: 'TaskStatus' });
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Git hosting providers; only GitHub for now (docs/architecture.md, section 10). */
export const gitProviders = ['github'] as const;
export const gitProviderSchema = z.enum(gitProviders).meta({ id: 'GitProvider' });
export type GitProvider = z.infer<typeof gitProviderSchema>;

/** Lifecycle of one run of a task, in the order a successful run goes through it. */
export const runStatuses = [
  'queued',
  'preparing',
  'running',
  'committing',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export const runStatusSchema = z.enum(runStatuses).meta({ id: 'RunStatus' });
export type RunStatus = z.infer<typeof runStatusSchema>;

export const stepStatuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export const stepStatusSchema = z.enum(stepStatuses).meta({ id: 'StepStatus' });
export type StepStatus = z.infer<typeof stepStatusSchema>;
