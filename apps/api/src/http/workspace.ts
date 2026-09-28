import { DEFAULT_WORKSPACE_ID } from '@aievo/db';
import type { Request, RequestHandler, Response } from 'express';

/** Decides which workspace a request acts on. */
export type WorkspaceResolver = (req: Request) => string | Promise<string>;

/** There is a single local user for now, so every request uses the seeded workspace. */
export const defaultWorkspaceResolver: WorkspaceResolver = () => DEFAULT_WORKSPACE_ID;

/** The one place that resolves the current workspace; handlers read it with `getWorkspaceId`. */
export function workspaceMiddleware(resolve: WorkspaceResolver): RequestHandler {
  return async (req, res, next) => {
    res.locals.workspaceId = await resolve(req);
    next();
  };
}

export function getWorkspaceId(res: Response): string {
  const workspaceId: unknown = res.locals.workspaceId;
  if (typeof workspaceId !== 'string') {
    throw new Error('Workspace was not resolved for this request');
  }
  return workspaceId;
}
