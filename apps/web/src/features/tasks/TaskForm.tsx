import type { Schemas } from '@aievo/api-client';
import { createTaskSchema, taskPriorities, taskTypes } from '@aievo/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { applyApiErrors } from '@/api/form-errors';
import { FormError, FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { LabelsInput } from './LabelsInput';
import { priorityLabels, typeLabels } from './labels';

/** The editable fields of a task, validated by the same schema as `POST /projects/:id/tasks`. */
const taskFormSchema = createTaskSchema.pick({
  title: true,
  description: true,
  type: true,
  priority: true,
  acceptanceCriteria: true,
  labels: true,
});

export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;

const FIELDS = [
  'title',
  'description',
  'type',
  'priority',
  'acceptanceCriteria',
  'labels',
] as const;

type Field = (typeof FIELDS)[number];

function initialValues(task?: Schemas['Task']): TaskFormInput {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    type: task?.type ?? 'feature',
    priority: task?.priority ?? 'medium',
    acceptanceCriteria: task?.acceptanceCriteria ?? '',
    labels: task?.labels ?? [],
  };
}

interface TaskFormProps {
  /** The task to edit; without it the form creates a new task. */
  task?: Schemas['Task'];
  /**
   * Saves the task: `values` holds every field, `changed` only those the user edited.
   * Throws the API error, which the form then shows.
   */
  onSubmit: (values: TaskFormValues, changed: Partial<TaskFormValues>) => Promise<void>;
  onCancel: () => void;
}

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const form = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: initialValues(task),
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    const changed: Partial<TaskFormValues> = Object.fromEntries(
      FIELDS.filter((field: Field) => dirtyFields[field]).map((field) => [field, values[field]]),
    );
    try {
      await onSubmit(values, changed);
    } catch (error) {
      applyApiErrors(error, form.setError, FIELDS);
    }
  });

  const labelsError =
    errors.labels?.message ?? errors.labels?.find?.((issue) => issue?.message)?.message;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FormField id="task-title" label="Title" error={errors.title?.message}>
        {(control) => <Input {...control} autoFocus {...form.register('title')} />}
      </FormField>

      <FormField id="task-description" label="Description" error={errors.description?.message}>
        {(control) => <Textarea {...control} rows={5} {...form.register('description')} />}
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField id="task-type" label="Type" error={errors.type?.message}>
          {(control) => (
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger {...control} className="w-full" onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {typeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>

        <FormField id="task-priority" label="Priority" error={errors.priority?.message}>
          {(control) => (
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger {...control} className="w-full" onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskPriorities.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priorityLabels[priority]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>
      </div>

      <FormField
        id="task-acceptance-criteria"
        label="Acceptance criteria"
        hint="What must be true for the task to be done."
        error={errors.acceptanceCriteria?.message}
      >
        {(control) => <Textarea {...control} rows={4} {...form.register('acceptanceCriteria')} />}
      </FormField>

      <FormField id="task-labels" label="Labels" error={labelsError}>
        {(control) => (
          <Controller
            control={form.control}
            name="labels"
            render={({ field }) => (
              <LabelsInput
                {...control}
                value={field.value ?? []}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        )}
      </FormField>

      <FormError message={errors.root?.message} />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : task ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </form>
  );
}
