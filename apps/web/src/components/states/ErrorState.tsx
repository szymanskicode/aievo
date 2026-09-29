import { CircleAlertIcon } from 'lucide-react';

import { errorMessage } from '@/api/errors';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}

export function ErrorState({ error, title = 'Could not load data', onRetry }: ErrorStateProps) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{errorMessage(error)}</AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
