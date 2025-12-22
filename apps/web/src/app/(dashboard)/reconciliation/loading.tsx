import { Skeleton } from '@/components/ui/skeleton';

export default function ReconciliationLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-44" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>

      <Skeleton className="h-32 rounded-lg" />

      <Skeleton className="h-[400px] rounded-lg" />
    </div>
  );
}
