'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClassGroups } from '@/hooks/admin/use-class-groups';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Users, BookOpen } from 'lucide-react';

export default function ClassGroupsPage() {
  const router = useRouter();
  const [includeInactive, setIncludeInactive] = useState(false);

  const { data: groups, isLoading, error } = useClassGroups({ includeInactive });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Class Groups</h1>
          <p className="text-muted-foreground">Manage classroom groups and assign children</p>
        </div>
        <Button asChild>
          <Link href="/admin/class-groups/new">
            <Plus className="mr-2 h-4 w-4" />
            Create class group
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="show-inactive"
          checked={includeInactive}
          onCheckedChange={setIncludeInactive}
        />
        <Label htmlFor="show-inactive" className="cursor-pointer text-sm text-muted-foreground">
          Show inactive groups
        </Label>
      </div>

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load class groups. Please try again.
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Children</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading class groups...
                </TableCell>
              </TableRow>
            ) : !groups || groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <BookOpen className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-muted-foreground">No class groups yet.</p>
                    <Button asChild size="sm">
                      <Link href="/admin/class-groups/new">Create your first class group</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group) => (
                <TableRow
                  key={group.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => router.push(`/admin/class-groups/${group.id}`)}
                >
                  <TableCell className="text-muted-foreground">{group.displayOrder}</TableCell>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell className="text-muted-foreground">{group.code ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      {group.childCount ?? '—'}
                    </div>
                  </TableCell>
                  <TableCell>{group.capacity ?? '—'}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        group.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }
                    >
                      {group.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
