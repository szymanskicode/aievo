import type { Schemas } from '@aievo/api-client';
import { PlugZapIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { errorMessage } from '@/api/errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { describeKey } from './format';
import { ModelsList } from './ModelsList';
import { useDeleteProvider, useTestProvider } from './queries';

interface ProviderCardProps {
  provider: Schemas['Provider'];
  typeInfo: Schemas['ProviderTypeInfo'] | undefined;
}

function DeleteProviderButton({ provider }: { provider: Schemas['Provider'] }) {
  const deleteProvider = useDeleteProvider();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${provider.label}`}>
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{provider.label}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The stored key and the list of models of this provider are deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              deleteProvider.mutate(provider.id, {
                onError: (error) =>
                  toast.error(`Could not delete the provider: ${errorMessage(error)}`),
              })
            }
          >
            Delete provider
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ProviderCard({ provider, typeInfo }: ProviderCardProps) {
  const testProvider = useTestProvider(provider.id);
  const baseUrl = provider.baseUrl ?? typeInfo?.defaultBaseUrl;

  function onTest() {
    testProvider.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(
          `Connection works: ${result.discovered} ${result.discovered === 1 ? 'model' : 'models'} found`,
        ),
    });
  }

  return (
    <Card role="article" aria-label={provider.label}>
      <CardHeader>
        <CardTitle>{provider.label}</CardTitle>
        <CardDescription className="flex flex-wrap gap-x-3">
          <span>{typeInfo?.displayName ?? provider.type}</span>
          <span>{describeKey(provider)}</span>
          {baseUrl && <span className="truncate">{baseUrl}</span>}
        </CardDescription>
        <CardAction className="flex gap-1">
          <Button variant="outline" size="sm" onClick={onTest} disabled={testProvider.isPending}>
            <PlugZapIcon />
            {testProvider.isPending ? 'Testing…' : 'Test connection'}
          </Button>
          <DeleteProviderButton provider={provider} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {testProvider.isError && (
          <Alert variant="destructive">
            <AlertTitle>Connection failed</AlertTitle>
            <AlertDescription>{errorMessage(testProvider.error)}</AlertDescription>
          </Alert>
        )}
        <ModelsList providerId={provider.id} />
      </CardContent>
    </Card>
  );
}
