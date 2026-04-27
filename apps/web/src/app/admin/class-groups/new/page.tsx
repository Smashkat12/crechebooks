'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ClassGroupForm } from '../_components/class-group-form';
import { useCreateClassGroup } from '@/hooks/admin/use-class-groups';

export default function NewClassGroupPage() {
  const createMutation = useCreateClassGroup();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/class-groups">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Class Group</h1>
          <p className="text-muted-foreground">Add a new classroom group to your school</p>
        </div>
      </div>

      <ClassGroupForm onSubmit={(dto) => createMutation.mutateAsync(dto)} />
    </div>
  );
}
