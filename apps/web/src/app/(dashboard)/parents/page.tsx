'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ParentTable } from '@/components/parents';
import { useParentsList } from '@/hooks/use-parents';

const PAGE_SIZE = 20;

export default function ParentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading, error } = useParentsList({
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
  });

  if (error) {
    throw new Error(`Failed to load parents: ${error.message}`);
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

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

          {/* Server-side Pagination */}
          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between py-4 border-t mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, data.total)} of {data.total} parents
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
