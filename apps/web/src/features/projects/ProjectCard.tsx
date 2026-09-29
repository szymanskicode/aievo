import type { Schemas } from '@aievo/api-client';
import { Link } from '@tanstack/react-router';
import { GitBranchIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { DeleteProjectDialog } from './DeleteProjectDialog';

export function ProjectCard({ project }: { project: Schemas['Project'] }) {
  return (
    <Card aria-label={project.name} role="article">
      <CardHeader>
        <CardTitle>
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="hover:underline"
          >
            {project.name}
          </Link>
        </CardTitle>
        {project.description && (
          <CardDescription className="line-clamp-2">{project.description}</CardDescription>
        )}
        <CardAction>
          <DeleteProjectDialog
            project={project}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Delete ${project.name}`}>
                <Trash2Icon />
              </Button>
            }
          />
        </CardAction>
      </CardHeader>
      {project.repoUrl && (
        <CardContent className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <GitBranchIcon className="size-4 shrink-0" />
          <span className="truncate">{project.repoUrl}</span>
        </CardContent>
      )}
    </Card>
  );
}
