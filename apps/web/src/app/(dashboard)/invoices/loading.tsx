import { Skeleton } from '@/components/ui/skeleton';

export default function InvoicesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-5 w-48 mt-2" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <Skeleton className="h-10 w-44" />

      <Skeleton className="h-[600px] rounded-lg" />
    </div>
  );
}
