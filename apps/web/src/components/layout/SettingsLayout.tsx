import { Link, Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';

function SettingsLink({
  to,
  children,
}: {
  to: '/settings/providers' | '/settings/models' | '/settings/github';
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="border-b-2 border-transparent px-1 pb-2 text-sm text-muted-foreground hover:text-foreground"
      activeProps={{
        className: 'border-foreground font-medium text-foreground',
        'aria-current': 'page',
      }}
    >
      {children}
    </Link>
  );
}

/** Sections of the settings; each is its own route. */
export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Settings" className="flex gap-4 border-b">
        <SettingsLink to="/settings/providers">Model providers</SettingsLink>
        <SettingsLink to="/settings/models">Models</SettingsLink>
        <SettingsLink to="/settings/github">GitHub</SettingsLink>
      </nav>
      <Outlet />
    </div>
  );
}
