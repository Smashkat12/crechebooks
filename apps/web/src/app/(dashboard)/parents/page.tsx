'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ParentTable } from '@/components/parents';
import { useParentsList } from '@/hooks/use-parents';

export default function ParentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useParentsList({ search: search || undefined });

  if (error) {
    throw new Error(`Failed to load parents: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Parents</h1>
          <p className="text-muted-foreground">
            Manage parent accounts and contact information
          </p>
        </div>
        <Link href="/parents/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Parent
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search parents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ParentTable
            parents={data?.parents ?? []}
            isLoading={isLoading}
            onView={(parent) => router.push(`/parents/${parent.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
