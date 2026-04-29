'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarX, Loader2, Trash2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useParentChild } from '@/hooks/parent-portal/use-parent-profile';
import {
  useParentAbsenceReports,
  useReportAbsence,
  useCancelAbsenceReport,
} from '@/hooks/parent-portal/use-parent-absences';
import type { AbsenceReportResponse } from '@/lib/api/attendance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns true if the given YYYY-MM-DD date is today or in the future */
function isFutureOrToday(date: string): boolean {
  return date >= todayIso();
}

function formatDisplayDate(dateStr: string): string {
  // YYYY-MM-DD → e.g. "28 Apr 2026"
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Absence list item ────────────────────────────────────────────────────────

interface AbsenceItemProps {
  report: AbsenceReportResponse;
  onCancel: (id: string) => void;
  isCancelling: boolean;
}

function AbsenceItem({ report, onCancel, isCancelling }: AbsenceItemProps) {
  const canCancel = !report.cancelledAt && isFutureOrToday(report.date);

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b last:border-b-0">
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{formatDisplayDate(report.date)}</span>
          {report.cancelledAt ? (
            <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 text-xs font-normal">
              Cancelled
            </Badge>
          ) : isFutureOrToday(report.date) ? (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs font-normal">
              Upcoming
            </Badge>
          ) : (
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs font-normal">
              Past
            </Badge>
          )}
        </div>
        {report.reason && (
          <p className="text-xs text-muted-foreground truncate max-w-xs">{report.reason}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Reported {new Date(report.reportedAt).toLocaleString('en-ZA', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
      {canCancel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCancel(report.id)}
          disabled={isCancelling}
          className="shrink-0 text-destructive hover:text-destructive"
        >
          {isCancelling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          <span className="sr-only">Cancel</span>
        </Button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentAbsencesPage() {
  const params = useParams<{ id: string }>();
  const childId = params?.id ?? '';
  const router = useRouter();
  const { toast } = useToast();

  // Auth guard
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) router.push('/parent/login');
  }, [router]);

  const { data: child, isLoading: childLoading } = useParentChild(childId);
  const { data: absenceData, isLoading: absencesLoading } = useParentAbsenceReports(childId);
  const { mutate: reportAbsence, isPending: isReporting } = useReportAbsence(childId);
  const { mutate: cancelReport, isPending: isCancelling } = useCancelAbsenceReport(childId);

  // ─── Form state ───────────────────────────────────────────────────────────

  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!date) {
      errors.date = 'Date is required.';
    } else if (date < todayIso()) {
      errors.date = 'You can only report absences for today or future dates.';
    }
    if (reason.length > 500) {
      errors.reason = 'Reason must be 500 characters or fewer.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    reportAbsence(
      { date, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast({
            title: 'Absence reported',
            description: `Absence reported for ${formatDisplayDate(date)}.`,
          });
          setDate(todayIso());
          setReason('');
          setFormErrors({});
        },
        onError: (err) => {
          const msg = err.message ?? 'Failed to report absence.';
          if (msg.toLowerCase().includes('already') || msg.includes('409')) {
            setFormErrors({ date: 'An absence report already exists for this date.' });
          } else {
            toast({ title: 'Failed', description: msg, variant: 'destructive' });
          }
        },
      },
    );
  }

  function handleCancel(absenceId: string) {
    cancelReport(
      { absenceId },
      {
        onSuccess: () => {
          toast({ title: 'Absence cancelled', description: 'The absence report has been cancelled.' });
        },
        onError: (err) => {
          toast({
            title: 'Failed to cancel',
            description: err.message ?? 'Could not cancel the absence report.',
            variant: 'destructive',
          });
        },
      },
    );
  }

  const childName = child ? `${child.firstName} ${child.lastName}` : 'Your child';
  const isLoading = childLoading || absencesLoading;

  const reports = absenceData?.reports ?? [];

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
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarX className="h-6 w-6" />
          Report an Absence
        </h1>
        <p className="text-muted-foreground">{childName}</p>
      </div>

      {/* Report form */}
      <Card>
        <CardHeader>
          <CardTitle>New absence report</CardTitle>
          <CardDescription>
            Notify the school in advance. You can only report today or future dates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="absence-date">
                Date
              </label>
              <Input
                id="absence-date"
                type="date"
                value={date}
                min={todayIso()}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (formErrors.date) setFormErrors((p) => ({ ...p, date: '' }));
                }}
                className="w-44"
              />
              {formErrors.date && (
                <p className="text-xs text-destructive">{formErrors.date}</p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="absence-reason">
                Reason{' '}
                <span className="text-muted-foreground font-normal">(optional, max 500 chars)</span>
              </label>
              <textarea
                id="absence-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (formErrors.reason) setFormErrors((p) => ({ ...p, reason: '' }));
                }}
                rows={3}
                maxLength={500}
                placeholder="e.g. Doctor's appointment"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
              <div className="flex justify-between">
                {formErrors.reason ? (
                  <p className="text-xs text-destructive">{formErrors.reason}</p>
                ) : (
                  <span />
                )}
                <p className="text-xs text-muted-foreground">{reason.length}/500</p>
              </div>
            </div>

            <Button type="submit" disabled={isReporting} className="w-full sm:w-auto">
              {isReporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Report absence
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Reports list */}
      <Card>
        <CardHeader>
          <CardTitle>Absence reports</CardTitle>
          <CardDescription>
            Upcoming and recent reports. Cancel a future report if plans change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : reports.length === 0 ? (
            <Alert>
              <AlertDescription>No absence reports yet.</AlertDescription>
            </Alert>
          ) : (
            <div>
              {reports.map((r) => (
                <AbsenceItem
                  key={r.id}
                  report={r}
                  onCancel={handleCancel}
                  isCancelling={isCancelling}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
