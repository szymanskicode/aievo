import type { Schemas } from '@aievo/api-client';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleCheckIcon, CircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { setupStatusQuery } from './queries';

type StepKey = keyof Schemas['SetupStatus'];

const STEPS: {
  key: StepKey;
  title: string;
  why: string;
  action: string;
  to: '/settings/providers' | '/settings/github' | '/projects/new';
}[] = [
  {
    key: 'modelProvider',
    title: 'Add a model provider',
    why: 'Agents think with a language model. Add a provider with your API key and keep at least one model enabled.',
    action: 'Open model providers',
    to: '/settings/providers',
  },
  {
    key: 'githubToken',
    title: 'Add a GitHub token',
    why: 'AIEvo uses it to create repositories, push agent branches and open pull requests.',
    action: 'Open GitHub settings',
    to: '/settings/github',
  },
  {
    key: 'project',
    title: 'Create a project',
    why: 'A project links a GitHub repository, new or existing, where agents deliver tasks.',
    action: 'Create a project',
    to: '/projects/new',
  },
];

/** First-run checklist; gone once every step is done. Its state always comes from the API. */
export function GettingStartedCard() {
  const status = useQuery(setupStatusQuery());
  if (!status.data) return null;

  const done = STEPS.filter((step) => status.data[step.key]).length;
  if (done === STEPS.length) return null;

  return (
    <Card role="region" aria-labelledby="getting-started-title">
      <CardHeader>
        <CardTitle id="getting-started-title">Getting started</CardTitle>
        <CardDescription>
          {done} of {STEPS.length} steps done. Everything is configured here, in the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col divide-y">
          {STEPS.map((step) => {
            const isDone = status.data[step.key];
            return (
              <li
                key={step.key}
                aria-label={step.title}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                {isDone ? (
                  <CircleCheckIcon className="size-5 shrink-0 text-green-600" aria-hidden />
                ) : (
                  <CircleIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {step.title}
                    <span className="sr-only">{isDone ? ' (done)' : ' (to do)'}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{step.why}</p>
                </div>
                {!isDone && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={step.to}>{step.action}</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
