import type { Schemas } from '@aievo/api-client';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { errorMessage } from '@/api/errors';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { expiryState, formatDate } from './format';
import { useDeleteGitCredential } from './queries';

function DeleteCredentialButton({ credential }: { credential: Schemas['GitCredential'] }) {
  const deleteCredential = useDeleteGitCredential();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${credential.label}`}>
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{credential.label}”?</AlertDialogTitle>
          <AlertDialogDescription>
            AIEvo forgets the token. It stays valid on GitHub until you revoke it there.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              deleteCredential.mutate(credential.id, {
                onSuccess: () => toast.success(`Token "${credential.label}" deleted`),
                onError: (error) =>
                  toast.error(`Could not delete the token: ${errorMessage(error)}`),
              })
            }
          >
            Delete token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const state = expiryState(expiresAt);
  if (state === 'expired') return <Badge variant="destructive">Expired</Badge>;
  if (state === 'soon') return <Badge variant="destructive">Expires soon</Badge>;
  return null;
}

export function GitCredentialCard({ credential }: { credential: Schemas['GitCredential'] }) {
  return (
    <Card role="article" aria-label={credential.label}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {credential.label}
          <ExpiryBadge expiresAt={credential.expiresAt} />
        </CardTitle>
        <CardAction>
          <DeleteCredentialButton credential={credential} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">GitHub account</dt>
          <dd>{credential.githubLogin}</dd>
          <dt className="text-muted-foreground">Token</dt>
          <dd>{credential.tokenHint ? `••••${credential.tokenHint}` : 'Saved'}</dd>
          <dt className="text-muted-foreground">Expires</dt>
          <dd>{credential.expiresAt ? formatDate(credential.expiresAt) : 'No expiration date'}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
