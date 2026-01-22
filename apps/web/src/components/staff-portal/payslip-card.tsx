'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Download, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface PayslipSummary {
  id: string;
  payDate: Date | string;
  period: string;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  status: 'paid' | 'pending' | 'processing';
}

interface PayslipCardProps {
  payslip: PayslipSummary;
  onView: () => void;
  onDownload: () => void;
}

export function PayslipCard({ payslip, onView, onDownload }: PayslipCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  const statusVariants: Record<string, 'success' | 'warning' | 'default'> = {
    paid: 'success',
    pending: 'warning',
    processing: 'default',
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="font-semibold">{payslip.period}</p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{format(new Date(payslip.payDate), 'dd MMM yyyy')}</span>
            </div>
          </div>
          <Badge variant={statusVariants[payslip.status]}>
            {payslip.status.charAt(0).toUpperCase() + payslip.status.slice(1)}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm mb-3">
          <div>
            <p className="text-muted-foreground">Gross</p>
            <p className="font-medium">{formatCurrency(payslip.grossPay)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Deductions</p>
            <p className="font-medium text-red-600 dark:text-red-400">
              -{formatCurrency(payslip.totalDeductions)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Net</p>
            <p className="font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(payslip.netPay)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onView}>
            <Eye className="h-4 w-4 mr-2" /> View
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onDownload}
          >
            <Download className="h-4 w-4 mr-2" /> PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
