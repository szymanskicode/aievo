import type { Schemas } from '@aievo/api-client';
import { createNewProjectSchema } from '@aievo/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { OwnerSelect } from './OwnerSelect';
import { emptyToUndefined } from './wizard-values';

type FormInput = z.input<typeof createNewProjectSchema>;
export type NewRepoValues = z.output<typeof createNewProjectSchema>;

/** Preselected when it exists: a working app with tests from the first task on. */
export const DEFAULT_TEMPLATE = 'react-vite-ts';

interface NewRepoStepProps {
  credentialId: string;
  templates: Schemas['Template'][];
  initial: NewRepoValues | undefined;
  onBack: () => void;
  onNext: (values: NewRepoValues) => void;
}

const VISIBILITY = [
  { value: true, label: 'Private', hint: 'Only you and people you invite can see it.' },
  { value: false, label: 'Public', hint: 'Anyone on the internet can see it.' },
] as const;

/** Path B: the new repository and the template its first commit comes from. */
export function NewRepoStep({
  credentialId,
  templates,
  initial,
  onBack,
  onNext,
}: NewRepoStepProps) {
  const form = useForm<FormInput, unknown, NewRepoValues>({
    resolver: zodResolver(createNewProjectSchema),
    defaultValues: initial ?? {
      mode: 'new',
      credentialId,
      name: '',
      owner: '',
      private: true,
      template: templates.some((t) => t.id === DEFAULT_TEMPLATE)
        ? DEFAULT_TEMPLATE
        : (templates[0]?.id ?? ''),
    },
  });
  const { errors } = form.formState;

  useEffect(() => {
    form.setValue('credentialId', credentialId);
  }, [credentialId, form]);

  return (
    <form
      onSubmit={form.handleSubmit(onNext)}
      noValidate
      className="flex flex-col gap-5"
      aria-label="New repository"
    >
      <Controller
        control={form.control}
        name="owner"
        render={({ field }) => (
          <OwnerSelect
            id="new-owner"
            credentialId={credentialId}
            value={field.value}
            onChange={field.onChange}
            error={errors.owner?.message}
          />
        )}
      />

      <FormField
        id="new-name"
        label="Repository name"
        hint="Letters, digits, “.”, “-” and “_”. It also names the project."
        error={errors.name?.message}
      >
        {(control) => (
          <Input
            {...control}
            placeholder="aievo-playground"
            spellCheck={false}
            {...form.register('name')}
          />
        )}
      </FormField>

      <FormField
        id="new-description"
        label="Description (optional)"
        error={errors.description?.message}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={2}
            {...form.register('description', { setValueAs: emptyToUndefined })}
          />
        )}
      </FormField>

      <Controller
        control={form.control}
        name="private"
        render={({ field }) => (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Visibility</legend>
            {VISIBILITY.map((option) => (
              <label key={option.label} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={field.name}
                  className="mt-0.5"
                  checked={(field.value ?? true) === option.value}
                  onChange={() => field.onChange(option.value)}
                  onBlur={field.onBlur}
                />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="block text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Template</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => (
            <label
              key={template.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg border p-4 text-sm has-checked:border-foreground has-checked:bg-muted"
            >
              <input
                type="radio"
                value={template.id}
                className="mt-0.5"
                {...form.register('template')}
              />
              <span>
                <span className="font-medium">{template.manifest.name}</span>
                <span className="block text-muted-foreground">{template.manifest.description}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.template && <p className="text-sm text-destructive">{errors.template.message}</p>}
      </fieldset>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Next</Button>
      </div>
    </form>
  );
}
