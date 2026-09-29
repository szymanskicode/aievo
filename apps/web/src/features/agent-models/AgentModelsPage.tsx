import type { Schemas } from '@aievo/api-client';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';

import { errorMessage } from '@/api/errors';
import { FormField } from '@/components/form/FormField';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { providersQuery } from '@/features/providers/queries';

import { allModelsQuery, useUpdateAgentModels, workspaceSettingsQuery } from './queries';

/** Value of the "no model" option; Radix Select has no empty value. */
const NONE = 'none';

function modelLabel(model: Schemas['Model'], providers: Schemas['Provider'][]): string {
  const provider = providers.find((candidate) => candidate.id === model.providerId);
  return `${model.displayName} (${provider?.label ?? 'unknown provider'})`;
}

function CoderModelSelect({
  chosen,
  models,
  providers,
}: {
  chosen: string | null;
  models: Schemas['Model'][];
  providers: Schemas['Provider'][];
}) {
  const update = useUpdateAgentModels();
  const enabled = models.filter((model) => model.enabled);
  const chosenMissing = chosen !== null && !enabled.some((model) => model.id === chosen);

  function choose(value: string) {
    const coder = value === NONE ? null : value;
    if (coder === chosen) return;
    update.mutate({ coder }, { onSuccess: () => toast.success('Model of the Programista saved') });
  }

  return (
    <FormField
      id="coder-model"
      label="Model for Programista"
      hint="The agent that implements tasks and opens pull requests. It needs a model with tool calling and a price, so its cost can be limited."
      error={update.isError ? errorMessage(update.error) : undefined}
    >
      {(control) => (
        <Select
          value={chosen ?? NONE}
          disabled={update.isPending}
          onValueChange={(value) => value && choose(value)}
        >
          <SelectTrigger {...control} className="w-full max-w-md">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No model</SelectItem>
            {chosenMissing && (
              <SelectItem value={chosen} disabled>
                A model that is no longer enabled
              </SelectItem>
            )}
            {enabled.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {modelLabel(model, providers)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

/** Which model each agent role uses; for now only the Programista. */
export function AgentModelsPage() {
  const settings = useQuery(workspaceSettingsQuery());
  const models = useQuery(allModelsQuery());
  const providers = useQuery(providersQuery());

  const failed = settings.error ?? models.error ?? providers.error;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="text-2xl font-semibold">Models</h1>
      </header>

      {settings.isPending || models.isPending || providers.isPending ? (
        <LoadingState label="Loading models" />
      ) : failed || !settings.data || !models.data || !providers.data ? (
        <ErrorState
          error={failed}
          title="Could not load models"
          onRetry={() => {
            void settings.refetch();
            void models.refetch();
            void providers.refetch();
          }}
        />
      ) : !models.data.some((model) => model.enabled) ? (
        <EmptyState
          title="No enabled models yet"
          description="Add a model provider and enable at least one of its models."
          action={
            <Button asChild variant="outline">
              <Link to="/settings/providers">Open model providers</Link>
            </Button>
          }
        />
      ) : (
        <CoderModelSelect
          chosen={settings.data.agentModels.coder}
          models={models.data}
          providers={providers.data}
        />
      )}
    </div>
  );
}
