import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  /** Show header section with title and description */
  showHeader?: boolean;
  /** Show action button in header */
  showHeaderAction?: boolean;
  /** Number of stat cards to display */
  statCards?: number;
  /** Show a large content area */
  showContent?: boolean;
  /** Content area height */
  contentHeight?: string;
}

/**
 * Full page skeleton for route loading states.
 * Configurable to match different page layouts.
 */
export function PageSkeleton({
  showHeader = true,
  showHeaderAction = true,
  statCards = 0,
  showContent = true,
  contentHeight = '400px',
}: PageSkeletonProps) {
  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-64 mt-2" />
          </div>
          {showHeaderAction && <Skeleton className="h-10 w-40" />}
        </div>
      )}

      {statCards > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: statCards }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      )}

      {showContent && (
        <Skeleton className="w-full rounded-lg" style={{ height: contentHeight }} />
      )}
    </div>
  );
}

/**
 * Dashboard-specific page skeleton with stats and charts layout
 */
export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Skeleton className="col-span-4 h-[400px] rounded-lg" />
        <Skeleton className="col-span-3 h-[400px] rounded-lg" />
      </div>
    </div>
  );
}

/**
 * List page skeleton with table-like content
 */
export function ListPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-5 w-48 mt-2" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-[250px]" />
        <Skeleton className="h-10 w-[100px]" />
      </div>

      <Skeleton className="h-[600px] rounded-lg" />
    </div>
  );
}

/**
 * Detail page skeleton with sidebar layout
 */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32 mt-1" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-[300px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-[200px] rounded-lg" />
          <Skeleton className="h-[150px] rounded-lg" />
        </div>
      </div>
    </div>
  );
}
