import { Skeleton } from '@/components/ui/skeleton';

export default function SarsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-56 mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-44 rounded-lg" />
        <Skeleton className="h-44 rounded-lg" />
      </div>

      <Skeleton className="h-10 w-64" />

      <Skeleton className="h-[300px] rounded-lg" />
    </div>
  );
}
