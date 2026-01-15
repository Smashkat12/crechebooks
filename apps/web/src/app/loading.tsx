import { Skeleton } from '@/components/ui/skeleton';

/**
 * Root loading component for the app.
 * Displays a centered loading spinner for root-level navigation.
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        </div>
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
