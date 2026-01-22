'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Download } from 'lucide-react';
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

interface PayslipListProps {
  payslips: PayslipSummary[];
  onView: (id: string) => void;
  onDownload: (id: string) => void;
}

export function PayslipList({ payslips, onView, onDownload }: PayslipListProps) {
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
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Pay Date</TableHead>
            <TableHead className="text-right">Gross Pay</TableHead>
            <TableHead className="text-right">Deductions</TableHead>
            <TableHead className="text-right">Net Pay</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payslips.map((payslip) => (
            <TableRow key={payslip.id}>
              <TableCell className="font-medium">{payslip.period}</TableCell>
              <TableCell>
                {format(new Date(payslip.payDate), 'dd MMM yyyy')}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(payslip.grossPay)}
              </TableCell>
              <TableCell className="text-right text-red-600 dark:text-red-400">
                -{formatCurrency(payslip.totalDeductions)}
              </TableCell>
              <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(payslip.netPay)}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariants[payslip.status]}>
                  {payslip.status.charAt(0).toUpperCase() + payslip.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onView(payslip.id)}
                    title="View payslip"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDownload(payslip.id)}
                    title="Download PDF"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
