'use client';

import Link from 'next/link';
import { FileText, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';

export default function SarsPage() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  // VAT due on 25th of following month
  const vatDeadline = day <= 25
    ? new Date(year, month, 25)
    : new Date(year, month + 1, 25);

  // EMP201 due on 7th of following month
  const empDeadline = day <= 7
    ? new Date(year, month, 7)
    : new Date(year, month + 1, 7);

  const getDaysUntil = (date: Date) => {
    const diff = date.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const vatDaysUntil = getDaysUntil(vatDeadline);
  const empDaysUntil = getDaysUntil(empDeadline);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SARS Compliance</h1>
        <p className="text-muted-foreground">
          Manage VAT and payroll tax submissions
        </p>
      </div>

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
              <Badge variant={vatDaysUntil <= 5 ? 'destructive' : 'secondary'}>
                <Clock className="h-3 w-3 mr-1" />
                {vatDaysUntil} days
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Next deadline</span>
              <span className="font-medium">{formatDate(vatDeadline)}</span>
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
              <Badge variant={empDaysUntil <= 5 ? 'destructive' : 'secondary'}>
                <Clock className="h-3 w-3 mr-1" />
                {empDaysUntil} days
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Next deadline</span>
              <span className="font-medium">{formatDate(empDeadline)}</span>
            </div>
            <Link href="/sars/emp201">
              <Button className="w-full">Prepare EMP201</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submission History</CardTitle>
          <CardDescription>
            Previous SARS submissions and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No submissions yet. Use the buttons above to prepare your first submission.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
