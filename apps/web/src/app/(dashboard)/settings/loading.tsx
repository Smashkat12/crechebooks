import { SettingsFormSkeleton } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-5 w-56 mt-2" />
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-48">
          <Skeleton className="h-10 w-full mb-2" />
          <Skeleton className="h-10 w-full mb-2" />
          <Skeleton className="h-10 w-full mb-2" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex-1">
          <SettingsFormSkeleton sections={2} />
        </div>
      </div>
    </div>
  );
}
