import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Button } from '@/components/ui/button';

import { AddProviderDialog } from './AddProviderDialog';
import { ProviderCard } from './ProviderCard';
import { providersQuery, providerTypesQuery } from './queries';

export function ProvidersPage() {
  const types = useQuery(providerTypesQuery());
  const providers = useQuery(providersQuery());

  const addButton = types.data && (
    <AddProviderDialog
      types={types.data}
      trigger={
        <Button>
          <PlusIcon />
          Add provider
        </Button>
      }
    />
  );

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Settings</p>
          <h1 className="text-2xl font-semibold">Model providers</h1>
        </div>
        {providers.data && providers.data.length > 0 && addButton}
      </header>

      {providers.isPending || types.isPending ? (
        <LoadingState label="Loading providers" />
      ) : types.isError ? (
        <ErrorState
          error={types.error}
          title="Could not load provider types"
          onRetry={() => void types.refetch()}
        />
      ) : providers.isError ? (
        <ErrorState
          error={providers.error}
          title="Could not load providers"
          onRetry={() => void providers.refetch()}
        />
      ) : providers.data.length === 0 ? (
        <EmptyState
          title="No model providers yet"
          description="Add a provider with your API key to let agents use its models."
          action={addButton}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {providers.data.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              typeInfo={types.data.find((info) => info.type === provider.type)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
