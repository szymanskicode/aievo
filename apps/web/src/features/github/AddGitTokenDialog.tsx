import type { Schemas } from '@aievo/api-client';
import { createGitCredentialSchema } from '@aievo/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { applyApiErrors } from '@/api/form-errors';
import { FormError, FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { useCreateGitCredential } from './queries';

type FormInput = z.input<typeof createGitCredentialSchema>;
type FormOutput = z.output<typeof createGitCredentialSchema>;

const FIELDS = ['label', 'token'] as const;

interface AddGitTokenFormProps {
  onCreated: (credential: Schemas['CreatedGitCredential']) => void;
  onCancel: () => void;
}

function AddGitTokenForm({ onCreated, onCancel }: AddGitTokenFormProps) {
  const createCredential = useCreateGitCredential();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createGitCredentialSchema),
    defaultValues: { label: 'GitHub', token: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const credential = await createCredential.mutateAsync(values);
      // The token is dropped from the form state before anything else renders.
      form.reset();
      onCreated(credential);
    } catch (error) {
      applyApiErrors(error, form.setError, FIELDS);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" autoComplete="off">
      <FormField id="git-token-label" label="Name" error={errors.label?.message}>
        {(control) => <Input {...control} {...form.register('label')} />}
      </FormField>

      <FormField
        id="git-token-value"
        label="Token"
        hint="Checked with GitHub and stored encrypted. It is never shown again, only its last characters."
        error={errors.token?.message}
      >
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            placeholder="github_pat_…"
            {...form.register('token')}
          />
        )}
      </FormField>

      <FormError message={errors.root?.message} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Checking…' : 'Add token'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface AddGitTokenDialogProps {
  trigger: React.ReactNode;
  onCreated: (credential: Schemas['CreatedGitCredential']) => void;
}

export function AddGitTokenDialog({ trigger, onCreated }: AddGitTokenDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add GitHub token</DialogTitle>
          <DialogDescription>
            A fine-grained personal access token with access to all repositories.
          </DialogDescription>
        </DialogHeader>
        {/* Unmounted when closed, so a typed token never outlives the dialog. */}
        {open && (
          <AddGitTokenForm
            onCancel={() => setOpen(false)}
            onCreated={(credential) => {
              setOpen(false);
              onCreated(credential);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
