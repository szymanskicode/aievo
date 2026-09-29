import { z } from 'zod';

/**
 * First-run checklist (docs/architecture.md, sections 14 and 18). Each step is derived from
 * the workspace's data on every request, never stored.
 */
export const setupStatusSchema = z
  .object({
    /** A model provider with at least one enabled model. */
    modelProvider: z.boolean(),
    /** A stored GitHub token. */
    githubToken: z.boolean(),
    /** A project linked to a GitHub repository. */
    project: z.boolean(),
  })
  .meta({ id: 'SetupStatus' });

export type SetupStatus = z.infer<typeof setupStatusSchema>;
