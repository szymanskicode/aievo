import type { Schemas } from '@aievo/api-client';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { AddGitTokenDialog } from './AddGitTokenDialog';
import { GitCredentialCard } from './GitCredentialCard';
import { gitCredentialsQuery } from './queries';
import { TokenInstructions } from './TokenInstructions';

/** What the API reported about the token just added, e.g. a missing expiration date. */
function SaveWarnings({ saved }: { saved: Schemas['CreatedGitCredential'] }) {
  if (saved.warnings.length === 0) return null;
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle>Token “{saved.label}” was saved. Please check:</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {saved.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function GitHubSettingsPage() {
  const credentials = useQuery(gitCredentialsQuery());
  const [saved, setSaved] = useState<Schemas['CreatedGitCredential'] | null>(null);

  const addButton = (
    <AddGitTokenDialog
      onCreated={setSaved}
      trigger={
        <Button>
          <PlusIcon />
          Add token
        </Button>
      }
    />
  );

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Settings</p>
          <h1 className="text-2xl font-semibold">GitHub</h1>
        </div>
        {credentials.data && credentials.data.length > 0 && addButton}
      </header>

      {saved && <SaveWarnings saved={saved} />}

      {credentials.isPending ? (
        <LoadingState label="Loading GitHub tokens" />
      ) : credentials.isError ? (
        <ErrorState
          error={credentials.error}
          title="Could not load GitHub tokens"
          onRetry={() => void credentials.refetch()}
        />
      ) : credentials.data.length === 0 ? (
        <EmptyState
          title="No GitHub token yet"
          description="Agents need a token to create repositories, push branches and open pull requests."
          action={addButton}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {credentials.data.map((credential) => (
            <GitCredentialCard key={credential.id} credential={credential} />
          ))}
        </div>
      )}

      <TokenInstructions />
    </div>
  );
}
