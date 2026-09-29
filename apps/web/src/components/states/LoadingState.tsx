import { Skeleton } from '@/components/ui/skeleton';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
