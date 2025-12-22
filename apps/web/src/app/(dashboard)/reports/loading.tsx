import { Skeleton } from '@/components/ui/skeleton';

export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-5 w-56 mt-2" />
      </div>

      <div className="flex gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>

      <Skeleton className="h-[500px] rounded-lg" />

      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    </div>
  );
}
