'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { ClassGroupForm } from '../../_components/class-group-form';
import { useClassGroup, useUpdateClassGroup } from '@/hooks/admin/use-class-groups';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditClassGroupPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: group, isLoading } = useClassGroup(id);
  const updateMutation = useUpdateClassGroup();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/admin/class-groups/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Class Group</h1>
          <p className="text-muted-foreground">Update group details</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : !group ? (
        <p className="text-muted-foreground">Class group not found.</p>
      ) : (
        <ClassGroupForm
          initialValues={group}
          onSubmit={(dto) => updateMutation.mutateAsync({ id, ...dto })}
        />
      )}
    </div>
  );
}
