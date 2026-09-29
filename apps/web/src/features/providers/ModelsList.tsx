import type { Schemas } from '@aievo/api-client';
import { useQuery } from '@tanstack/react-query';

import { ErrorState } from '@/components/states/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import { formatTokens } from './format';
import { modelsQuery, useSetModelEnabled } from './queries';

type Capabilities = Schemas['Model']['capabilities'];

const capabilityLabels: Record<keyof Omit<Capabilities, 'contextWindow' | 'maxOutput'>, string> = {
  tools: 'Tools',
  vision: 'Vision',
  structuredOutput: 'Structured output',
  promptCaching: 'Prompt caching',
  reasoning: 'Reasoning',
};

function ModelRow({ model, providerId }: { model: Schemas['Model']; providerId: string }) {
  const setEnabled = useSetModelEnabled(providerId);
  const { capabilities } = model;
  const switchId = `model-${model.id}-enabled`;

  return (
    <li aria-label={model.displayName} className="flex items-start justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <label htmlFor={switchId} className="font-medium">
            {model.displayName}
          </label>
          <code className="text-xs text-muted-foreground">{model.modelId}</code>
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(capabilityLabels)
            .filter(([key]) => capabilities[key as keyof typeof capabilityLabels])
            .map(([key, label]) => (
              <Badge key={key} variant="secondary">
                {label}
              </Badge>
            ))}
          {capabilities.contextWindow !== null && (
            <Badge variant="outline">{formatTokens(capabilities.contextWindow)} context</Badge>
          )}
          {capabilities.maxOutput !== null && (
            <Badge variant="outline">{formatTokens(capabilities.maxOutput)} output</Badge>
          )}
        </div>
      </div>
      <Switch
        id={switchId}
        checked={model.enabled}
        onCheckedChange={(enabled) => setEnabled.mutate({ id: model.id, enabled })}
      />
    </li>
  );
}

export function ModelsList({ providerId }: { providerId: string }) {
  const models = useQuery(modelsQuery(providerId));

  if (models.isPending) {
    return (
      <div role="status" aria-label="Loading models" className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (models.isError) {
    return (
      <ErrorState
        error={models.error}
        title="Could not load models"
        onRetry={() => void models.refetch()}
      />
    );
  }
  if (models.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No models yet. Test the connection to discover them.
      </p>
    );
  }
  return (
    <ul aria-label="Models" className="divide-y">
      {models.data.map((model) => (
        <ModelRow key={model.id} model={model} providerId={providerId} />
      ))}
    </ul>
  );
}
