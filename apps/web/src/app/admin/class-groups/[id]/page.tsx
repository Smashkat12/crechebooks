'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { differenceInMonths, parseISO } from 'date-fns';
import {
  useClassGroup,
  useClassGroupChildren,
  useDeleteClassGroup,
  useAssignChildren,
  useUnassignChild,
} from '@/hooks/admin/use-class-groups';
import { useChildren } from '@/hooks/use-parents';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Pencil, Trash2, Users, UserPlus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PageProps {
  params: Promise<{ id: string }>;
}

function ageLabel(dobStr: string | null): string {
  if (!dobStr) return '—';
  const months = differenceInMonths(new Date(), parseISO(dobStr));
  if (months < 12) return `${months}m`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}m` : `${years}y`;
}

function ageRangeLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Any age';
  if (min == null) return `Up to ${max} months`;
  if (max == null) return `${min}+ months`;
  return `${min}–${max} months`;
}

export default function ClassGroupDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const { data: group, isLoading: groupLoading } = useClassGroup(id);
  const { data: assigned, isLoading: assignedLoading } = useClassGroupChildren(id);
  const deleteMutation = useDeleteClassGroup();
  const assignMutation = useAssignChildren();
  const unassignMutation = useUnassignChild();

  // Children picker state
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch all children to compute unassigned set client-side
  const { data: allChildrenRes } = useChildren({ limit: 500 });

  const assignedIds = new Set((assigned ?? []).map((c) => c.id));

  // Filter: not already in this group, matches search
  const unassignedChildren = (allChildrenRes?.data ?? []).filter((c) => {
    if (assignedIds.has(c.id)) return false;
    if (!search.trim()) return true;
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function toggleSelect(childId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId);
      else next.add(childId);
      return next;
    });
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: 'Class group deleted' });
      router.push('/admin/class-groups');
    } catch {
      toast({ title: 'Error', description: 'Failed to delete class group', variant: 'destructive' });
    }
  }

  async function handleAssign() {
    if (selectedIds.size === 0) return;
    try {
      await assignMutation.mutateAsync({ groupId: id, childIds: Array.from(selectedIds) });
      toast({ title: `${selectedIds.size} child${selectedIds.size > 1 ? 'ren' : ''} assigned` });
      setSelectedIds(new Set());
      setSearch('');
    } catch {
      toast({ title: 'Error', description: 'Failed to assign children', variant: 'destructive' });
    }
  }

  async function handleUnassign(childId: string, name: string) {
    try {
      await unassignMutation.mutateAsync({ groupId: id, childId });
      toast({ title: `${name} removed from group` });
    } catch {
      toast({ title: 'Error', description: 'Failed to remove child', variant: 'destructive' });
    }
  }

  if (groupLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Class group not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin/class-groups">Back to list</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/class-groups">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{group.name}</h1>
            {group.code && (
              <Badge variant="outline" className="text-sm font-mono">
                {group.code}
              </Badge>
            )}
            <Badge className={group.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
              {group.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/admin/class-groups/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete class group?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will soft-delete &quot;{group.name}&quot;. Children will be unassigned. This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Details card */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {group.description && (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-sm text-muted-foreground">{group.description}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Age range</p>
            <p className="mt-1 text-sm">{ageRangeLabel(group.ageMinMonths, group.ageMaxMonths)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Capacity</p>
            <p className="mt-1 text-sm">{group.capacity ?? 'Unlimited'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Display order</p>
            <p className="mt-1 text-sm">{group.displayOrder}</p>
          </div>
        </CardContent>
      </Card>

      {/* Assigned children */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Children in this group
          </CardTitle>
          <CardDescription>
            {assigned ? `${assigned.length} child${assigned.length !== 1 ? 'ren' : ''} assigned` : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignedLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading children...
                    </TableCell>
                  </TableRow>
                ) : !assigned || assigned.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No children assigned to this group yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  assigned.map((child) => (
                    <TableRow key={child.id}>
                      <TableCell className="font-medium">
                        {child.first_name} {child.last_name}
                      </TableCell>
                      <TableCell>{ageLabel(child.date_of_birth)}</TableCell>
                      <TableCell>
                        {child.parent
                          ? `${child.parent.first_name} ${child.parent.last_name}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {child.parent?.phone ?? child.parent?.email ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove from group"
                          disabled={unassignMutation.isPending}
                          onClick={() =>
                            handleUnassign(child.id, `${child.first_name} ${child.last_name}`)
                          }
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add children picker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add children
          </CardTitle>
          <CardDescription>
            Search and select children not currently assigned to this group
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />

          {unassignedChildren.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {search ? 'No matching children found.' : 'All children are already assigned.'}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Parent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unassignedChildren.slice(0, 50).map((child) => (
                    <TableRow
                      key={child.id}
                      className="cursor-pointer"
                      onClick={() => toggleSelect(child.id)}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(child.id)}
                          onCheckedChange={() => toggleSelect(child.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {child.first_name} {child.last_name}
                      </TableCell>
                      <TableCell>{ageLabel(child.date_of_birth)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {child.parent?.name ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                {selectedIds.size} child{selectedIds.size > 1 ? 'ren' : ''} selected
              </p>
              <Button onClick={handleAssign} disabled={assignMutation.isPending}>
                {assignMutation.isPending
                  ? 'Assigning...'
                  : `Assign ${selectedIds.size} child${selectedIds.size > 1 ? 'ren' : ''}`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
