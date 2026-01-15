import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface CardSkeletonProps {
  /** Show card header with title */
  showHeader?: boolean;
  /** Number of content lines */
  lines?: number;
  /** Card height if not using lines */
  height?: string;
}

/**
 * Card skeleton for card-based loading states
 */
export function CardSkeleton({
  showHeader = true,
  lines = 3,
  height,
}: CardSkeletonProps) {
  if (height) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
        )}
        <CardContent>
          <Skeleton className="w-full" style={{ height }} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-4"
            style={{ width: `${70 + Math.random() * 30}%` }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Stat card skeleton for dashboard metrics
 */
export function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

/**
 * Grid of stat card skeletons
 */
export function StatCardsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}
