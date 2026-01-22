'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface PayslipPreview {
  id: string;
  payDate: Date | string;
  period: string;
  grossPay: number;
  netPay: number;
}

interface RecentPayslipsProps {
  payslips: PayslipPreview[];
}

export function RecentPayslips({ payslips }: RecentPayslipsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Recent Payslips</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/staff/payslips" className="flex items-center gap-1">
            View All <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {payslips.map((payslip) => (
            <Link
              key={payslip.id}
              href={`/staff/payslips/${payslip.id}`}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">{payslip.period}</p>
                  <p className="text-xs text-muted-foreground">
                    Paid {format(new Date(payslip.payDate), 'dd MMM yyyy')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(payslip.netPay)}
                </p>
                <p className="text-xs text-muted-foreground">Net Pay</p>
              </div>
            </Link>
          ))}
          {payslips.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No payslips available yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
