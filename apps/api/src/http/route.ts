import type { Db } from '@aievo/db';
import type { Request, RequestHandler, Response, Router } from 'express';
import type { z } from 'zod';

import { validate } from './validate.js';
import { getWorkspaceId, workspaceMiddleware } from './workspace.js';
import type { WorkspaceResolver } from './workspace.js';

export type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

type AnyObject = z.ZodObject;

/**
 * The contract of one endpoint. Express routing, request validation and the OpenAPI
 * document are all derived from it, so the three cannot drift apart.
 */
export interface RouteSpec<
  P extends AnyObject | undefined = AnyObject | undefined,
  Q extends AnyObject | undefined = AnyObject | undefined,
  B extends z.ZodType | undefined = z.ZodType | undefined,
  R extends z.ZodType | undefined = z.ZodType | undefined,
> {
  method: HttpMethod;
  /** Express path relative to `/api`, e.g. `/projects/:id`. */
  path: string;
  summary: string;
  tag: string;
  params?: P;
  query?: Q;
  body?: B;
  status: number;
  /** Omitted for responses without a body (204). */
  response?: R;
  /** Error statuses the route can answer with, besides 400/415 for invalid input. */
  errors?: number[];
}

type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface RouteContext {
  db: Db;
}

export interface PublicHandlerInput<P, Q, B> extends RouteContext {
  params: Parsed<P>;
  query: Parsed<Q>;
  body: Parsed<B>;
}

export interface HandlerInput<P, Q, B> extends PublicHandlerInput<P, Q, B> {
  workspaceId: string;
}

type Result<R> = R extends z.ZodType ? z.input<R> : void;

type Handler<I, R> = (input: I) => Promise<Result<R>> | Result<R>;

export interface Route {
  spec: RouteSpec;
  /** Public routes (health, OpenAPI) do not depend on the current workspace. */
  usesWorkspace: boolean;
  handle: (req: Request, res: Response, ctx: RouteContext) => Promise<void>;
}

function createRoute<I>(
  spec: RouteSpec,
  usesWorkspace: boolean,
  handler: (input: I) => unknown,
): Route {
  return {
    spec,
    usesWorkspace,
    async handle(_req, res, ctx) {
      const input = res.locals.input as Record<'params' | 'query' | 'body', unknown>;
      const workspace = usesWorkspace ? { workspaceId: getWorkspaceId(res) } : {};
      const result = await handler({ ...input, ...ctx, ...workspace } as I);

      if (spec.response) {
        // Serialising through the contract drops anything the schema does not declare.
        res.status(spec.status).json(spec.response.parse(result));
      } else {
        res.status(spec.status).end();
      }
    },
  };
}

/** A route that acts on data of the current workspace. */

export function defineRoute<
  P extends AnyObject | undefined = undefined,
  Q extends AnyObject | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  R extends z.ZodType | undefined = undefined,
>(spec: RouteSpec<P, Q, B, R>, handler: Handler<HandlerInput<P, Q, B>, R>): Route {
  return createRoute(spec as RouteSpec, true, handler);
}

/** A route that works without a workspace, so it keeps answering if resolution fails. */
export function definePublicRoute<
  P extends AnyObject | undefined = undefined,
  Q extends AnyObject | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  R extends z.ZodType | undefined = undefined,
>(spec: RouteSpec<P, Q, B, R>, handler: Handler<PublicHandlerInput<P, Q, B>, R>): Route {
  return createRoute(spec as RouteSpec, false, handler);
}

export interface MountOptions extends RouteContext {
  resolveWorkspace: WorkspaceResolver;
}

/** The only place where routes are registered with Express. */
export function mountRoutes(
  router: Router,
  routes: readonly Route[],
  { resolveWorkspace, ...ctx }: MountOptions,
): void {
  const resolve = workspaceMiddleware(resolveWorkspace);

  for (const route of routes) {
    const handler: RequestHandler = (req, res) => route.handle(req, res, ctx);
    const chain = route.usesWorkspace ? [resolve] : [];
    router[route.spec.method](route.spec.path, ...chain, validate(route.spec), handler);
  }
}
