import type { Schemas } from '@aievo/api-client';
import { createProviderSchema, withoutUndefined } from '@aievo/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useCreateProvider } from './queries';

type FormInput = z.input<typeof createProviderSchema>;
type FormOutput = z.output<typeof createProviderSchema>;

const FIELDS = ['type', 'label', 'apiKey', 'baseUrl'] as const;

/** An empty optional field is left out instead of being sent as "". */
const emptyToUndefined = (value: string) => (value === '' ? undefined : value);

/** At least one type: the form preselects the first. */
export type ProviderTypes = [Schemas['ProviderTypeInfo'], ...Schemas['ProviderTypeInfo'][]];

interface AddProviderFormProps {
  types: ProviderTypes;
  onDone: () => void;
}

function AddProviderForm({ types, onDone }: AddProviderFormProps) {
  const createProvider = useCreateProvider();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createProviderSchema),
    defaultValues: { type: types[0].type, label: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: 'type' });
  const info = types.find((candidate) => candidate.type === type);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const provider = await createProvider.mutateAsync(withoutUndefined(values));
      // The key is dropped from the form state before anything else renders.
      form.reset();
      toast.success(`Provider "${provider.label}" added. Test the connection to load its models.`);
      onDone();
    } catch (error) {
      applyApiErrors(error, form.setError, FIELDS);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" autoComplete="off">
      <FormField id="provider-type" label="Type" error={errors.type?.message}>
        {(control) => (
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  form.clearErrors();
                }}
              >
                <SelectTrigger {...control} className="w-full" onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((candidate) => (
                    <SelectItem key={candidate.type} value={candidate.type}>
                      {candidate.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </FormField>

      <FormField id="provider-label" label="Name" error={errors.label?.message}>
        {(control) => (
          <Input {...control} placeholder={info?.displayName} {...form.register('label')} />
        )}
      </FormField>

      <FormField
        id="provider-api-key"
        label={info?.apiKey === 'optional' ? 'API key (optional)' : 'API key'}
        hint="Stored encrypted. It is never shown again, only its last characters."
        error={errors.apiKey?.message}
      >
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            {...form.register('apiKey', { setValueAs: emptyToUndefined })}
          />
        )}
      </FormField>

      <FormField
        id="provider-base-url"
        label={info?.baseUrl === 'optional' ? 'Base URL (optional)' : 'Base URL'}
        {...(info?.defaultBaseUrl ? { hint: `Leave empty to use ${info.defaultBaseUrl}` } : {})}
        error={errors.baseUrl?.message}
      >
        {(control) => (
          <Input
            {...control}
            type="url"
            placeholder={info?.defaultBaseUrl ?? 'http://127.0.0.1:11434/v1'}
            {...form.register('baseUrl', { setValueAs: emptyToUndefined })}
          />
        )}
      </FormField>

      <FormError message={errors.root?.message} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add provider'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface AddProviderDialogProps {
  types: ProviderTypes;
  trigger: React.ReactNode;
}

export function AddProviderDialog({ types, trigger }: AddProviderDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add model provider</DialogTitle>
          <DialogDescription>Connect a model API with your own key.</DialogDescription>
        </DialogHeader>
        {/* Unmounted when closed, so a typed key never outlives the dialog. */}
        {open && <AddProviderForm types={types} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
