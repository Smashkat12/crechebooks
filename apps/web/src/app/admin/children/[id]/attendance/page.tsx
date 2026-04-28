'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useChildAttendanceHistory,
  useUpdateAttendance,
  useDeleteAttendance,
} from '@/hooks/admin/use-attendance';
import { useChild } from '@/hooks/use-parents';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, CalendarDays, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { AttendanceRecord, AttendanceStatus } from '@/lib/api/attendance';

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-100 text-green-800',
  ABSENT: 'bg-red-100 text-red-800',
  LATE: 'bg-amber-100 text-amber-800',
  EXCUSED: 'bg-blue-100 text-blue-800',
  EARLY_PICKUP: 'bg-purple-100 text-purple-800',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  EXCUSED: 'Excused',
  EARLY_PICKUP: 'Early pickup',
};

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Edit modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  record: AttendanceRecord;
  onClose: () => void;
}

function EditModal({ record, onClose }: EditModalProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<AttendanceStatus>(record.status);
  const [arrivalAt, setArrivalAt] = useState(record.arrivalAt ?? '');
  const [departureAt, setDepartureAt] = useState(record.departureAt ?? '');
  const [note, setNote] = useState(record.note ?? '');

  const { mutate: updateAttendance, isPending } = useUpdateAttendance();

  function handleSave() {
    updateAttendance(
      {
        id: record.id,
        status,
        arrivalAt: arrivalAt || null,
        departureAt: departureAt || null,
        note: note || null,
      },
      {
        onSuccess: () => {
          toast({ title: 'Saved', description: 'Attendance record updated.' });
          onClose();
        },
        onError: () => {
          toast({ title: 'Failed', description: 'Could not update record.', variant: 'destructive' });
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Attendance — {record.date}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Arrival time</label>
              <Input
                type="time"
                value={arrivalAt}
                onChange={(e) => setArrivalAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Departure time</label>
              <Input
                type="time"
                value={departureAt}
                onChange={(e) => setDepartureAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Note</label>
            <Input
              placeholder="Optional note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChildAttendanceHistoryPage() {
  const params = useParams<{ id: string }>();
  const childId = params?.id ?? '';
  const router = useRouter();
  const { toast } = useToast();

  const [from, setFrom] = useState(nDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);

  const { data: child } = useChild(childId);
  const { data: records, isLoading } = useChildAttendanceHistory(childId, { from, to });
  const { mutate: deleteRecord, isPending: isDeleting } = useDeleteAttendance();

  const childName = child
    ? `${child.firstName} ${child.lastName}`.trim()
    : 'Child';

  const stats = useMemo(() => {
    const result = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, EARLY_PICKUP: 0 };
    (records ?? []).forEach((r) => {
      result[r.status]++;
    });
    return result;
  }, [records]);

  function handleDelete(record: AttendanceRecord) {
    if (!confirm(`Delete attendance record for ${record.date}?`)) return;
    deleteRecord(
      { id: record.id, date: record.date, childId: record.childId },
      {
        onSuccess: () => toast({ title: 'Deleted', description: 'Attendance record removed.' }),
        onError: () =>
          toast({ title: 'Failed', description: 'Could not delete record.', variant: 'destructive' }),
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Attendance History</h1>
        <p className="text-muted-foreground">{childName}</p>
      </div>

      {/* Date range */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="pl-8 w-40"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="date"
              value={to}
              max={todayIso()}
              onChange={(e) => setTo(e.target.value)}
              className="pl-8 w-40"
            />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.keys(STATUS_LABEL) as AttendanceStatus[]).map((s) => (
          <Card key={s}>
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl font-bold">{stats[s]}</p>
              <Badge className={STATUS_BADGE[s] + ' text-xs font-normal mt-1 hover:opacity-100'}>
                {STATUS_LABEL[s]}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Records table */}
      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>
            {records?.length ?? 0} records from {from} to {to}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Arrival</TableHead>
                  <TableHead>Departure</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : !records || records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No attendance records found for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell className="font-mono text-sm">{rec.date}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[rec.status] + ' hover:opacity-100'}>
                          {STATUS_LABEL[rec.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rec.arrivalAt ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rec.departureAt ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {rec.note ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditingRecord(rec)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            disabled={isDeleting}
                            onClick={() => handleDelete(rec)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editingRecord && (
        <EditModal record={editingRecord} onClose={() => setEditingRecord(null)} />
      )}
    </div>
  );
}
