import { Link, Outlet } from '@tanstack/react-router';
import { FolderKanbanIcon, SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';

/** Top-level sections of the side menu; routes with parameters never belong here. */
interface NavLinkProps {
  to: '/projects' | '/settings';
  icon: ReactNode;
  children: ReactNode;
}

function NavLink({ to, icon, children }: NavLinkProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4"
      activeProps={{ className: 'bg-muted font-medium text-foreground', 'aria-current': 'page' }}
    >
      {icon}
      {children}
    </Link>
  );
}

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r bg-sidebar p-4">
        <Link to="/projects" className="px-3 text-lg font-semibold">
          AIEvo
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          <NavLink to="/projects" icon={<FolderKanbanIcon />}>
            Projects
          </NavLink>
          <NavLink to="/settings" icon={<SettingsIcon />}>
            Settings
          </NavLink>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
