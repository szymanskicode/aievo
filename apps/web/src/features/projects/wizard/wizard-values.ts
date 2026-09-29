import type { Schemas } from '@aievo/api-client';
import type { CreateExistingProjectInput, CreateNewProjectInput } from '@aievo/shared';
import { withoutUndefined } from '@aievo/shared';

/** What the wizard collects: one of the two variants of `POST /projects`. */
export type WizardValues = CreateExistingProjectInput | CreateNewProjectInput;

export type WizardMode = WizardValues['mode'];

/** An empty optional field is left out instead of being sent as "". */
export const emptyToUndefined = (value: string) => (value === '' ? undefined : value);

/** The project name the API will use: for an existing repository it defaults to the repo. */
export function projectName(values: WizardValues): string {
  return values.mode === 'new' ? values.name : (values.name ?? values.repo);
}

/** The request body, with the fields the user left empty left out (also inside `commands`). */
export function toRequestBody(values: WizardValues): Schemas['CreateProject'] {
  if (values.mode === 'new') return withoutUndefined(values);
  const { commands, ...rest } = values;
  return {
    ...withoutUndefined(rest),
    ...(commands === undefined ? {} : { commands: withoutUndefined(commands) }),
  };
}
