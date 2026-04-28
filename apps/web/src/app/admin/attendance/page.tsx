'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  useAttendanceByDate,
  useMarkAttendance,
  useBulkMarkAttendance,
} from '@/hooks/admin/use-attendance';
import { useClassGroups } from '@/hooks/admin/use-class-groups';
import { useChildren } from '@/hooks/use-parents';
import { useClassGroupChildren } from '@/hooks/admin/use-class-groups';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarDays, CheckCircle2, Users, Search, BellOff } from 'lucide-react';
import type { AttendanceStatus } from '@/lib/api/attendance';

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Late' },
  { value: 'EXCUSED', label: 'Excused' },
  { value: 'EARLY_PICKUP', label: 'Early pickup' },
];

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-100 text-green-800',
  ABSENT: 'bg-red-100 text-red-800',
  LATE: 'bg-amber-100 text-amber-800',
  EXCUSED: 'bg-blue-100 text-blue-800',
  EARLY_PICKUP: 'bg-purple-100 text-purple-800',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Child row shape ───────────────────────────────────────────────────────────

interface ChildRow {
  id: string;
  firstName: string;
  lastName: string;
  classGroupName?: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendanceMarkingPage() {
  const { toast } = useToast();
  const today = todayIso();

  const [date, setDate] = useState(today);
  const [classGroupId, setClassGroupId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showUnmarkedOnly, setShowUnmarkedOnly] = useState(false);

  // Class groups for dropdown
  const { data: classGroups } = useClassGroups({ includeInactive: false });

  // Children roster
  // When "All groups" is selected → fetch all active/enrolled children via /children?limit=500
  // When a specific group is selected → fetch via /class-groups/:id/children
  const { data: allChildrenResp } = useChildren(
    classGroupId === 'all' ? { limit: 500, status: 'ENROLLED' } : undefined,
  );
  const { data: groupChildren } = useClassGroupChildren(
    classGroupId !== 'all' ? classGroupId : '',
  );

  const childRows: ChildRow[] = useMemo(() => {
    if (classGroupId === 'all') {
      return (allChildrenResp?.data ?? []).map((c) => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
      }));
    }
    const groupName =
      classGroups?.find((g) => g.id === classGroupId)?.name ?? '';
    return (groupChildren ?? []).map((c) => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      classGroupName: groupName,
    }));
  }, [classGroupId, allChildrenResp, groupChildren, classGroups]);

  // Attendance records for the selected date (AdminDayView wrapper)
  const { data: dayView, isLoading: recordsLoading } = useAttendanceByDate({
    date,
    classGroupId: classGroupId !== 'all' ? classGroupId : undefined,
  });

  // Build a lookup: childId → attendance record
  const attendanceMap = useMemo(() => {
    const map = new Map<string, { id: string; status: AttendanceStatus }>();
    (dayView?.records ?? []).forEach((r) => {
      map.set(r.childId, { id: r.id, status: r.status });
    });
    return map;
  }, [dayView]);

  // Build a lookup: childId → parent pre-report (for inline badge)
  const preReportMap = useMemo(() => {
    const map = new Map<string, { reason: string | null }>();
    (dayView?.parentPreReports ?? []).forEach((r) => {
      map.set(r.childId, { reason: r.reason });
    });
    return map;
  }, [dayView]);

  const { mutate: markAttendance, isPending: isMarking } = useMarkAttendance();
  const { mutate: bulkMark, isPending: isBulking } = useBulkMarkAttendance();

  // ─── Computed list ─────────────────────────────────────────────────────────

  const displayedChildren = useMemo(() => {
    return childRows.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.toLowerCase();
      if (search && !name.includes(search.toLowerCase())) return false;
      if (showUnmarkedOnly && attendanceMap.has(c.id)) return false;
      return true;
    });
  }, [childRows, search, showUnmarkedOnly, attendanceMap]);

  // ─── Status counts ─────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const result = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      EXCUSED: 0,
      EARLY_PICKUP: 0,
      unmarked: 0,
    };
    childRows.forEach((c) => {
      const rec = attendanceMap.get(c.id);
      if (rec) {
        result[rec.status]++;
      } else {
        result.unmarked++;
      }
    });
    return result;
  }, [childRows, attendanceMap]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleStatusChange(childId: string, status: AttendanceStatus) {
    markAttendance(
      { childId, date, status },
      {
        onError: () => {
          toast({
            title: 'Failed to save',
            description: 'Could not update attendance. Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  }

  function handleBulkMarkPresent() {
    const unmarkedChildren = childRows.filter((c) => !attendanceMap.has(c.id));
    if (unmarkedChildren.length === 0) {
      toast({ title: 'Nothing to mark', description: 'All children are already marked.' });
      return;
    }
    bulkMark(
      {
        date,
        records: unmarkedChildren.map((c) => ({ childId: c.id, status: 'PRESENT' })),
      },
      {
        onSuccess: () => {
          toast({
            title: 'Bulk marked',
            description: `${unmarkedChildren.length} children marked as Present.`,
          });
        },
        onError: () => {
          toast({
            title: 'Failed',
            description: 'Bulk mark failed. Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  }

  const isPastOrToday = date <= today;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground">Mark and review daily attendance</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Date picker */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="pl-8 w-40"
            />
          </div>
        </div>

        {/* Class group filter */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Class group</label>
          <Select value={classGroupId} onValueChange={setClassGroupId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {(classGroups ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="space-y-1 flex-1 min-w-48">
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Toggle unmarked */}
        <Button
          variant={showUnmarkedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowUnmarkedOnly((v) => !v)}
          className="self-end"
        >
          Unmarked only
        </Button>

        {/* Bulk mark */}
        {isPastOrToday && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkMarkPresent}
            disabled={isBulking || counts.unmarked === 0}
            className="self-end"
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
            Mark {counts.unmarked} unmarked as Present
          </Button>
        )}
      </div>

      {/* Summary counts */}
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Present {counts.PRESENT}
        </Badge>
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          Absent {counts.ABSENT}
        </Badge>
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          Late {counts.LATE}
        </Badge>
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          Excused {counts.EXCUSED}
        </Badge>
        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
          Early pickup {counts.EARLY_PICKUP}
        </Badge>
        <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
          Unmarked {counts.unmarked}
        </Badge>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Child</TableHead>
              <TableHead>Class Group</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordsLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : displayedChildren.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Users className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-muted-foreground">
                      {search ? 'No children match your search.' : 'No children in this group.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              displayedChildren.map((child) => {
                const rec = attendanceMap.get(child.id);
                const currentStatus = rec?.status;
                const preReport = preReportMap.get(child.id);

                return (
                  <TableRow key={child.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <Link
                          href={`/admin/children/${child.id}/attendance`}
                          className="font-medium hover:underline"
                        >
                          {child.firstName} {child.lastName}
                        </Link>
                        {preReport && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <BellOff className="h-3 w-3 shrink-0" />
                            <span>
                              Reported absent
                              {preReport.reason ? ` — ${preReport.reason}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {child.classGroupName ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {STATUS_OPTIONS.map((opt) => {
                          const isActive = currentStatus === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() =>
                                isPastOrToday
                                  ? handleStatusChange(child.id, opt.value)
                                  : undefined
                              }
                              disabled={isMarking || !isPastOrToday}
                              className={[
                                'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all',
                                isActive
                                  ? STATUS_BADGE[opt.value] + ' border-transparent shadow-sm'
                                  : 'bg-background border-border text-muted-foreground hover:border-foreground/30',
                                (!isPastOrToday || isMarking) && 'opacity-50 cursor-not-allowed',
                              ].join(' ')}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {!currentStatus && (
                        <span className="text-xs text-muted-foreground italic">Unmarked</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
