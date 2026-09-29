import { createProjectSchema } from '@aievo/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { withoutUndefined } from '@/lib/without-undefined';

import { useCreateProject } from './queries';

const formSchema = createProjectSchema.pick({ name: true, description: true, repoUrl: true });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

const FIELDS = ['name', 'description', 'repoUrl'] as const;

/** An empty optional field is left out instead of being sent as "". */
const emptyToUndefined = (value: string) => (value === '' ? undefined : value);

export function CreateProjectDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const createProject = useCreateProject();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', description: '' },
  });
  const { errors, isSubmitting } = form.formState;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) form.reset();
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const project = await createProject.mutateAsync(withoutUndefined(values));
      toast.success(`Project "${project.name}" created`);
      onOpenChange(false);
    } catch (error) {
      applyApiErrors(error, form.setError, FIELDS);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Tasks live in projects. You can connect a repository later.
            </DialogDescription>
          </DialogHeader>

          <FormField id="project-name" label="Name" error={errors.name?.message}>
            {(control) => <Input {...control} autoFocus {...form.register('name')} />}
          </FormField>
          <FormField
            id="project-description"
            label="Description"
            error={errors.description?.message}
          >
            {(control) => <Textarea {...control} rows={3} {...form.register('description')} />}
          </FormField>
          <FormField
            id="project-repo-url"
            label="Repository URL"
            hint="Optional, e.g. https://github.com/acme/app"
            error={errors.repoUrl?.message}
          >
            {(control) => (
              <Input
                {...control}
                type="url"
                {...form.register('repoUrl', { setValueAs: emptyToUndefined })}
              />
            )}
          </FormField>

          <FormError message={errors.root?.message} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
