import { z } from 'zod';

/**
 * Friendlier messages for the shared API schemas when they validate forms. Only the wording
 * changes; the rules stay in `@aievo/shared`. Issues not listed keep Zod's default message.
 */
export function formIssueMessage(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case 'too_small':
      if (issue.origin === 'string') {
        return issue.minimum === 1 ? 'Required' : `Must be at least ${issue.minimum} characters`;
      }
      if (issue.origin === 'array') return `Add at least ${issue.minimum}`;
      return undefined;
    case 'too_big':
      if (issue.origin === 'string') return `Must be at most ${issue.maximum} characters`;
      if (issue.origin === 'array') return `At most ${issue.maximum} allowed`;
      return undefined;
    case 'invalid_format':
      return issue.format === 'url' ? 'Enter a valid http(s) URL' : undefined;
    default:
      return undefined;
  }
}

z.config({ customError: formIssueMessage });
