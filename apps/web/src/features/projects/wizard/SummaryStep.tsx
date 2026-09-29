import { ApiClientError } from '@aievo/api-client';
import type { Schemas } from '@aievo/api-client';
import { ExternalLinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { errorMessage } from '@/api/errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import type { WizardValues } from './wizard-values';
import { projectName } from './wizard-values';

interface SummaryStepProps {
  values: WizardValues;
  template: Schemas['Template'] | undefined;
  isCreating: boolean;
  error: unknown;
  onBack: () => void;
  onCreate: () => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** Where the repository is when creating the project failed after GitHub created it. */
function createdRepoUrl(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError) || error.code !== 'project_setup_failed') return;
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('repoUrl' in details)) return;
  return typeof details.repoUrl === 'string' ? details.repoUrl : undefined;
}

function CreateError({ error }: { error: unknown }) {
  const repoUrl = createdRepoUrl(error);
  return (
    <Alert variant="destructive">
      <AlertTitle>The project was not created</AlertTitle>
      <AlertDescription>
        <p>{errorMessage(error)}</p>
        {repoUrl && (
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
          >
            Open the repository on GitHub
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        )}
      </AlertDescription>
    </Alert>
  );
}

function Commands({ commands }: { commands: Record<string, string | undefined> }) {
  const entries = Object.entries(commands).filter(([, command]) => command);
  if (entries.length === 0) return <>None</>;
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map(([name, command]) => (
        <li key={name}>
          {name}: <code className="font-mono text-xs">{command}</code>
        </li>
      ))}
    </ul>
  );
}

export function SummaryStep({
  values,
  template,
  isCreating,
  error,
  onBack,
  onCreate,
}: SummaryStepProps) {
  return (
    <section aria-label="Summary" className="flex flex-col gap-5">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <Row label="Project">{projectName(values)}</Row>
        {values.mode === 'existing' ? (
          <>
            <Row label="Repository">
              {values.owner}/{values.repo} (existing)
            </Row>
            <Row label="Base branch">{values.defaultBranch}</Row>
            <Row label="Commands">
              <Commands commands={values.commands ?? {}} />
            </Row>
          </>
        ) : (
          <>
            <Row label="Repository">
              {values.owner}/{values.name} (new, {values.private ? 'private' : 'public'})
            </Row>
            {values.description && <Row label="Description">{values.description}</Row>}
            <Row label="Template">{template?.manifest.name ?? values.template}</Row>
            <Row label="Commands">
              <Commands commands={template?.manifest.commands ?? {}} />
            </Row>
          </>
        )}
      </dl>

      {values.mode === 'new' && (
        <p className="text-sm text-muted-foreground">
          AIEvo creates the repository on GitHub and pushes the template files as its first commit
          on <code className="font-mono">main</code>.
        </p>
      )}

      {error !== null && <CreateError error={error} />}

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={isCreating}>
          Back
        </Button>
        <Button type="button" onClick={onCreate} disabled={isCreating}>
          {isCreating ? 'Creating…' : 'Create project'}
        </Button>
      </div>
    </section>
  );
}
