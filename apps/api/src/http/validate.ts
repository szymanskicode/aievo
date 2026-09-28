import type { RequestHandler } from 'express';
import type { z } from 'zod';

import { unsupportedMediaType, validationError } from '../errors.js';
import type { RouteSpec } from './route.js';

type Part = 'params' | 'query' | 'body';

/**
 * Parses `params`, `query` and `body` with the route's schemas. Express 5 makes
 * `req.query` read-only, so the parsed values go to `res.locals.input` instead.
 */
export function validate(spec: RouteSpec): RequestHandler {
  return (req, res, next) => {
    // Without this, a form or text body would be reported as missing fields.
    if (spec.body && !req.is('application/json')) {
      next(unsupportedMediaType());
      return;
    }

    const input: Partial<Record<Part, unknown>> = {};
    const issues: z.core.$ZodIssue[] = [];

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = spec[part];
      if (!schema) continue;

      const raw: unknown = req[part];
      const result = schema.safeParse(raw);

      if (result.success) {
        input[part] = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({ ...issue, path: [part, ...issue.path] })),
        );
      }
    }

    if (issues.length > 0) {
      next(validationError(issues));
      return;
    }

    res.locals.input = input;
    next();
  };
}
