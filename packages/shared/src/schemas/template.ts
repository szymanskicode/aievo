import { z } from 'zod';

import { outputSchema } from './output.js';
import { previewSchema, projectCommandsSchema, testPolicySchema } from './project.js';

/**
 * `template.yaml` of a project template (docs/architecture.md, section 10). The manifest
 * sets the project's commands, preview and test policy, so a new repository needs no
 * stack detection. Test commands come from `commands`, so the policy cannot set them.
 */
export const templateManifestSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  commands: projectCommandsSchema.default({}),
  preview: previewSchema.nullable().default(null),
  /** Helper services such as a database; none of the built-in templates needs one yet. */
  services: z.array(z.string().min(1)).default([]),
  testPolicy: z.strictObject(testPolicySchema.omit({ commands: true }).shape).prefault({}),
  /** Files that describe the project to agents, relative to the repository root. */
  context: z.array(z.string().min(1)).default([]),
});

export type TemplateManifest = z.infer<typeof templateManifestSchema>;
export type TemplateManifestInput = z.input<typeof templateManifestSchema>;

/** A template as returned by `GET /templates`; `id` is the directory name. */
export const templateSchema = z
  .object({
    id: z.string(),
    manifest: outputSchema(templateManifestSchema).meta({ id: 'TemplateManifest' }),
  })
  .meta({ id: 'Template' });

export type TemplateDto = z.infer<typeof templateSchema>;
