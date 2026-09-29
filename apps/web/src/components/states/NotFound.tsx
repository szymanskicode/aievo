import { Link } from '@tanstack/react-router';

import { EmptyState } from './EmptyState';

export function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The address does not match any page."
      action={
        <Link to="/projects" className="text-sm underline">
          Go to projects
        </Link>
      }
    />
  );
}
