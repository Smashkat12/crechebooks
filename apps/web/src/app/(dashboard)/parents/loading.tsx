import { Skeleton } from '@/components/ui/skeleton';

export default function ParentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-56 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <Skeleton className="h-10 w-80" />

      <Skeleton className="h-[500px] rounded-lg" />
    </div>
  );
}
