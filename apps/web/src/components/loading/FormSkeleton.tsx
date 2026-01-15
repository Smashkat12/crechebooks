import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';

interface FormSkeletonProps {
  /** Number of form fields */
  fields?: number;
  /** Show form in a card wrapper */
  inCard?: boolean;
  /** Show submit button area */
  showActions?: boolean;
  /** Number of action buttons */
  actionCount?: number;
}

/**
 * Form skeleton for form loading states
 */
export function FormSkeleton({
  fields = 4,
  inCard = true,
  showActions = true,
  actionCount = 2,
}: FormSkeletonProps) {
  const content = (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}

      {showActions && (
        <div className="flex justify-end gap-2 pt-4">
          {Array.from({ length: actionCount }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24" />
          ))}
        </div>
      )}
    </div>
  );

  if (!inCard) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64 mt-1" />
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

/**
 * Settings form skeleton with sections
 */
export function SettingsFormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="space-y-8">
      {Array.from({ length: sections }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48 mt-1" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <Skeleton className="h-10 w-24" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
