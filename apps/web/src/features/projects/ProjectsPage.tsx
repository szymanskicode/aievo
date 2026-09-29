import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Button } from '@/components/ui/button';
import { GettingStartedCard } from '@/features/setup/GettingStartedCard';

import { ProjectCard } from './ProjectCard';
import { projectsQuery } from './queries';

function NewProjectButton() {
  return (
    <Button asChild>
      <Link to="/projects/new">
        <PlusIcon />
        New project
      </Link>
    </Button>
  );
}

export function ProjectsPage() {
  const projects = useQuery(projectsQuery());

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {projects.data && projects.data.length > 0 && <NewProjectButton />}
      </header>

      <GettingStartedCard />

      {projects.isPending ? (
        <LoadingState label="Loading projects" />
      ) : projects.isError ? (
        <ErrorState
          error={projects.error}
          title="Could not load projects"
          onRetry={() => void projects.refetch()}
        />
      ) : projects.data.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Connect a GitHub repository or create a new one to start adding tasks."
          action={<NewProjectButton />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.data.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
