import { useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';

import { FormField } from '@/components/form/FormField';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { githubOwnersQuery } from '@/features/github/queries';

interface OwnerSelectProps {
  id: string;
  credentialId: string;
  value: string;
  onChange: (owner: string) => void;
  error: string | undefined;
}

/** The token's account and organizations; the account is preselected. */
export function OwnerSelect({ id, credentialId, value, onChange, error }: OwnerSelectProps) {
  const owners = useQuery(githubOwnersQuery(credentialId));
  const first = owners.data?.[0]?.login;

  // An effect event reads the latest `value` and `onChange` without re-running the effect on
  // every render (parents pass a new `onChange` each time); only a new owner list matters.
  const preselect = useEffectEvent((login: string) => {
    if (value === '') onChange(login);
  });
  useEffect(() => {
    if (first) preselect(first);
  }, [first]);

  if (owners.isPending) return <LoadingState label="Loading GitHub accounts" />;
  if (owners.isError) {
    return (
      <ErrorState
        error={owners.error}
        title="Could not load GitHub accounts"
        onRetry={() => void owners.refetch()}
      />
    );
  }

  return (
    <FormField id={id} label="Owner" error={error}>
      {(control) => (
        // Radix reports "" once while its items mount; an owner is never cleared on purpose.
        <Select value={value} onValueChange={(owner) => owner && onChange(owner)}>
          <SelectTrigger {...control} className="w-full">
            <SelectValue placeholder="Choose an account" />
          </SelectTrigger>
          <SelectContent>
            {owners.data.map((owner) => (
              <SelectItem key={owner.login} value={owner.login}>
                {owner.login}
                {owner.type === 'organization' ? ' (organization)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
