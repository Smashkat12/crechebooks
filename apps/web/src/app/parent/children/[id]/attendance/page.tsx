'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useParentChildAttendance,
  useParentChildAttendanceSummary,
} from '@/hooks/parent-portal/use-parent-attendance';
import { useParentChild } from '@/hooks/parent-portal/use-parent-profile';
import type { AttendanceStatus } from '@/lib/api/attendance';

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentChildAttendancePage() {
  const params = useParams<{ id: string }>();
  const childId = params?.id ?? '';
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) router.push('/parent/login');
  }, [router]);

  const { data: child, isLoading: childLoading } = useParentChild(childId);

  // Last 30 days
  const from = nDaysAgo(30);

  const { data: records, isLoading: recordsLoading } = useParentChildAttendance(childId, {
    from,
  });
  const { data: summary, isLoading: summaryLoading } = useParentChildAttendanceSummary(childId);

  const isLoading = childLoading || recordsLoading || summaryLoading;

  const childName = child
    ? `${child.firstName} ${child.lastName}`
    : 'Your child';

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/parent/children/${childId}`)}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to child details
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-muted-foreground">{childName} — last 30 days</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Summary card */}
          {summary && (
            <Card>
              <CardHeader>
                <CardTitle>Last 30 days</CardTitle>
                <CardDescription>
                  Out of {summary.totalSchoolDays} school day
                  {summary.totalSchoolDays !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                    <span>
                      <strong>{summary.presentDays}</strong> days present
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span>
                      <strong>{summary.absentDays}</strong> absent
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <span>
                      <strong>{summary.lateDays}</strong> late
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <span>
                      <strong>{summary.excusedDays}</strong> excused
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Attendance list */}
          <Card>
            <CardHeader>
              <CardTitle>Daily record</CardTitle>
              <CardDescription>Read-only view of your child&apos;s attendance</CardDescription>
            </CardHeader>
            <CardContent>
              {!records || records.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No attendance records found for the last 30 days.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Arrival</TableHead>
                        <TableHead>Departure</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell className="font-mono text-sm">{rec.date}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                STATUS_BADGE[rec.status] + ' hover:opacity-100 font-normal text-xs'
                              }
                            >
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Alert>
            <AlertDescription>
              To query an attendance record, please contact the creche office.
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}
