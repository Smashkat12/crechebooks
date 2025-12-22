import { Skeleton } from '@/components/ui/skeleton';

export default function StaffLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-5 w-48 mt-2" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      <Skeleton className="h-10 w-80" />

      <Skeleton className="h-[500px] rounded-lg" />
    </div>
  );
}
