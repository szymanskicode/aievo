import type { Schemas } from '@aievo/api-client';
import { toast } from 'sonner';

import { errorMessage } from '@/api/errors';
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

import { useDeleteProject } from './queries';

interface DeleteProjectDialogProps {
  project: Pick<Schemas['Project'], 'id' | 'name'>;
  trigger: React.ReactNode;
}

export function DeleteProjectDialog({ project, trigger }: DeleteProjectDialogProps) {
  const deleteProject = useDeleteProject();

  function onConfirm() {
    deleteProject.mutate(project.id, {
      onSuccess: () => toast.success(`Project "${project.name}" deleted`),
      onError: (error) => toast.error(`Could not delete the project: ${errorMessage(error)}`),
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The project and all its tasks are deleted permanently.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
