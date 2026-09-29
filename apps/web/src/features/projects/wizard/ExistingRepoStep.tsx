import { DEFAULT_NPM_COMMANDS, createExistingProjectSchema } from '@aievo/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useController, useForm, useWatch } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

import { FormField } from '@/components/form/FormField';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { githubReposQuery } from '@/features/github/queries';

import { OwnerSelect } from './OwnerSelect';
import { emptyToUndefined } from './wizard-values';

type FormInput = z.input<typeof createExistingProjectSchema>;
export type ExistingRepoValues = z.output<typeof createExistingProjectSchema>;

/** Only this many repositories are rendered; the search narrows the rest down. */
const MAX_SHOWN_REPOS = 50;

const COMMANDS = [
  ['install', 'Install'],
  ['build', 'Build'],
  ['lint', 'Lint'],
  ['test', 'Test'],
  ['coverage', 'Coverage'],
  ['dev', 'Dev server'],
] as const;

interface ExistingRepoStepProps {
  credentialId: string;
  initial: ExistingRepoValues | undefined;
  onBack: () => void;
  onNext: (values: ExistingRepoValues) => void;
}

function RepoList({
  owner,
  credentialId,
  form,
}: {
  owner: string;
  credentialId: string;
  form: UseFormReturn<FormInput, unknown, ExistingRepoValues>;
}) {
  const repos = useQuery({ ...githubReposQuery(owner, credentialId), enabled: owner !== '' });
  const [search, setSearch] = useState('');
  // One controller for all radios: options passed to `register` per radio would overwrite
  // each other, so only the last repository's branch would ever be applied.
  const { field } = useController({ control: form.control, name: 'repo' });
  const error = form.formState.errors.repo?.message;

  if (owner === '') return null;
  if (repos.isPending) return <LoadingState label="Loading repositories" />;
  if (repos.isError) {
    return (
      <ErrorState
        error={repos.error}
        title="Could not load repositories"
        onRetry={() => void repos.refetch()}
      />
    );
  }

  const query = search.trim().toLowerCase();
  const matching = repos.data.filter((repo) => repo.name.toLowerCase().includes(query));
  const shown = matching.slice(0, MAX_SHOWN_REPOS);

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? 'repo-error' : undefined}>
      <legend className="mb-1.5 text-sm font-medium">Repository</legend>
      <Input
        type="search"
        aria-label="Search repositories"
        placeholder="Search repositories"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="max-h-64 overflow-y-auto rounded-md border">
        {shown.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No repository matches.</p>
        ) : (
          shown.map((repo) => (
            <label
              key={repo.fullName}
              className="flex cursor-pointer items-start gap-2 border-b p-3 text-sm last:border-b-0 has-checked:bg-muted"
            >
              <input
                type="radio"
                name={field.name}
                value={repo.name}
                className="mt-0.5"
                checked={field.value === repo.name}
                onChange={() => {
                  field.onChange(repo.name);
                  form.setValue('defaultBranch', repo.defaultBranch);
                }}
                onBlur={field.onBlur}
              />
              <span className="min-w-0">
                <span className="font-medium">{repo.name}</span>
                {repo.private && <span className="text-muted-foreground"> · private</span>}
                {repo.description && (
                  <span className="block truncate text-muted-foreground">{repo.description}</span>
                )}
              </span>
            </label>
          ))
        )}
      </div>
      {matching.length > shown.length && (
        <p className="text-xs text-muted-foreground">
          Showing {shown.length} of {matching.length}. Type to narrow the list.
        </p>
      )}
      {error && (
        <p id="repo-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Path A: pick a repository the token can see, its base branch and the project commands. */
export function ExistingRepoStep({ credentialId, initial, onBack, onNext }: ExistingRepoStepProps) {
  const form = useForm<FormInput, unknown, ExistingRepoValues>({
    resolver: zodResolver(createExistingProjectSchema),
    defaultValues: initial ?? {
      mode: 'existing',
      credentialId,
      owner: '',
      repo: '',
      defaultBranch: '',
      commands: { ...DEFAULT_NPM_COMMANDS },
    },
  });
  const { errors } = form.formState;
  const owner = useWatch({ control: form.control, name: 'owner' });
  const repo = useWatch({ control: form.control, name: 'repo' });

  // A different credential can see different repositories.
  useEffect(() => {
    form.setValue('credentialId', credentialId);
  }, [credentialId, form]);

  return (
    <form
      onSubmit={form.handleSubmit(onNext)}
      noValidate
      className="flex flex-col gap-5"
      aria-label="Existing repository"
    >
      <Controller
        control={form.control}
        name="owner"
        render={({ field }) => (
          <OwnerSelect
            id="existing-owner"
            credentialId={credentialId}
            value={field.value}
            onChange={(owner) => {
              if (owner === field.value) return;
              field.onChange(owner);
              // The chosen repository belongs to the previous owner.
              form.setValue('repo', '');
            }}
            error={errors.owner?.message}
          />
        )}
      />

      <RepoList owner={owner} credentialId={credentialId} form={form} />

      <FormField id="existing-branch" label="Base branch" error={errors.defaultBranch?.message}>
        {(control) => <Input {...control} {...form.register('defaultBranch')} />}
      </FormField>

      <FormField
        id="existing-name"
        label="Project name (optional)"
        hint="Defaults to the repository name."
        error={errors.name?.message}
      >
        {(control) => (
          <Input
            {...control}
            placeholder={repo || undefined}
            {...form.register('name', { setValueAs: emptyToUndefined })}
          />
        )}
      </FormField>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Commands</legend>
        <p className="text-xs text-muted-foreground">
          Proposed for an npm project. Adjust them to how your repository installs, builds and
          tests; leave a field empty if the project has no such command.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {COMMANDS.map(([key, label]) => (
            <FormField
              key={key}
              id={`existing-command-${key}`}
              label={label}
              error={errors.commands?.[key]?.message}
            >
              {(control) => (
                <Input
                  {...control}
                  className="font-mono"
                  {...form.register(`commands.${key}`, { setValueAs: emptyToUndefined })}
                />
              )}
            </FormField>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Next</Button>
      </div>
    </form>
  );
}
