'use client';

import { format } from 'date-fns';
import { CheckCircle2, Clock, AlertCircle, FileText, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ISarsSubmission, SarsSubmissionStatus, SarsSubmissionType } from '@crechebooks/types';

interface SubmissionHistoryProps {
  submissions: ISarsSubmission[];
  onDownload?: (submission: ISarsSubmission) => void;
  isLoading?: boolean;
}

const statusConfig: Record<SarsSubmissionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  DRAFT: { label: 'Draft', variant: 'outline', icon: FileText },
  GENERATED: { label: 'Generated', variant: 'secondary', icon: FileText },
  REVIEWED: { label: 'Reviewed', variant: 'secondary', icon: Clock },
  SUBMITTED: { label: 'Submitted', variant: 'default', icon: Clock },
  ACCEPTED: { label: 'Accepted', variant: 'default', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: AlertCircle },
};

const typeLabels: Record<SarsSubmissionType, string> = {
  VAT201: 'VAT201',
  EMP201: 'EMP201',
  IRP5: 'IRP5',
};

export function SubmissionHistory({
  submissions,
  onDownload,
  isLoading = false,
}: SubmissionHistoryProps) {
  const formatPeriod = (period: string) => {
    const [year, month] = period.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-ZA', {
      month: 'short',
    });
    return `${monthName} ${year}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Submission History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submission History</CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No submissions yet</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => {
                  const status = statusConfig[submission.status];
                  const StatusIcon = status.icon;

                  return (
                    <TableRow key={submission.id}>
                      <TableCell className="font-medium">
                        {typeLabels[submission.type]}
                      </TableCell>
                      <TableCell>{formatPeriod(submission.period)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(submission.generatedAt), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {submission.referenceNumber ?? '-'}
                      </TableCell>
                      <TableCell>
                        {submission.fileName && onDownload && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDownload(submission)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
