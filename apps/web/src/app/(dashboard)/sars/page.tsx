'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import { SarsReadinessChecklist } from '@/components/sars/readiness-checklist';
import { SubmissionHistory } from '@/components/sars/submission-history';
import { getSarsReadiness } from '@/lib/api/sars';
import { useSarsSubmissions } from '@/hooks/use-sars';
import { queryKeys } from '@/lib/api';
import type { ISarsSubmission } from '@crechebooks/types';

/**
 * SARS Compliance Hub
 *
 * F-A-005: Submission history table wired to GET /sars/submissions.
 * F-A-006: Deadline dates sourced from backend (readiness endpoint) so that
 *          weekend/SA public holiday adjustments computed server-side are
 *          reflected correctly. Client-side calendar arithmetic removed.
 */
export default function SarsPage() {
  // Backend-authoritative deadline — F-A-006: adjustment computed server-side
  const { data: readiness } = useQuery({
    queryKey: queryKeys.sars.all,
    queryFn: () => getSarsReadiness(),
    staleTime: 5 * 60 * 1000, // 5 min
  });

  // Submission history — F-A-005
  const { data: submissionsResp, isLoading: submissionsLoading } = useSarsSubmissions();

  // Deadline display helpers
  const nextDeadline = readiness?.nextDeadline;
  const emp201DueDate = nextDeadline?.type === 'EMP201' ? nextDeadline.dueDate : null;
  const vat201DueDate = nextDeadline?.type === 'VAT201' ? nextDeadline.dueDate : null;

  const getDaysUntil = (isoDate: string | null): number | null => {
    if (!isoDate) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(isoDate);
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const empDaysUntil = getDaysUntil(emp201DueDate);
  const vatDaysUntil = getDaysUntil(vat201DueDate);

  // Map API response shape to ISarsSubmission expected by SubmissionHistory
  const submissions: ISarsSubmission[] = submissionsResp?.data?.items?.map((item) => ({
    id: item.id,
    tenantId: '',
    type: item.submission_type as ISarsSubmission['type'],
    period: item.period,
    year: parseInt(item.period.slice(0, 4), 10),
    status: item.status as ISarsSubmission['status'],
    data: {},
    generatedAt: new Date(item.created_at),
    submittedAt: item.submitted_at ? new Date(item.submitted_at) : undefined,
    referenceNumber: item.sars_reference ?? undefined,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SARS Compliance</h1>
        <p className="text-muted-foreground">
          Manage VAT and payroll tax submissions
        </p>
      </div>

      {/* Filing readiness checklist — surfaces blockers for the next deadline */}
      <SarsReadinessChecklist />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  VAT201
                </CardTitle>
                <CardDescription>Monthly VAT Return</CardDescription>
              </div>
              {vatDaysUntil !== null && (
                <Badge variant={vatDaysUntil <= 5 ? 'destructive' : 'secondary'}>
                  <Clock className="h-3 w-3 mr-1" />
                  {vatDaysUntil} days
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Next deadline</span>
              <span className="font-medium">
                {vat201DueDate ? formatDate(new Date(vat201DueDate)) : 'See readiness checker'}
              </span>
            </div>
            <Link href="/sars/vat201">
              <Button className="w-full">Prepare VAT201</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  EMP201
                </CardTitle>
                <CardDescription>Monthly Employer Declaration</CardDescription>
              </div>
              {empDaysUntil !== null && (
                <Badge variant={empDaysUntil <= 5 ? 'destructive' : 'secondary'}>
                  <Clock className="h-3 w-3 mr-1" />
                  {empDaysUntil} days
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Next deadline</span>
              <span className="font-medium">
                {emp201DueDate ? formatDate(new Date(emp201DueDate)) : 'See readiness checker'}
              </span>
            </div>
            <Link href="/sars/emp201">
              <Button className="w-full">Prepare EMP201</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* F-A-005: Submission history wired to GET /sars/submissions */}
      <SubmissionHistory
        submissions={submissions}
        isLoading={submissionsLoading}
      />
    </div>
  );
}
