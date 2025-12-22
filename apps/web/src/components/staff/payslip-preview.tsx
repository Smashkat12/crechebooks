'use client';

import { format } from 'date-fns';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils/format';
import type { IStaff, IPayrollEntry } from '@crechebooks/types';

interface PayslipPreviewProps {
  staff: IStaff;
  entry: IPayrollEntry;
  period: { year: number; month: number };
  tenantName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrint?: () => void;
  onDownload?: () => void;
}

export function PayslipPreview({
  staff,
  entry,
  period,
  tenantName = 'CrecheBooks',
  open,
  onOpenChange,
  onPrint,
  onDownload,
}: PayslipPreviewProps) {
  const periodDate = new Date(period.year, period.month - 1, 1);
  const periodLabel = format(periodDate, 'MMMM yyyy');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Payslip - {periodLabel}</span>
            <div className="flex gap-2">
              {onPrint && (
                <Button variant="outline" size="sm" onClick={onPrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              )}
              {onDownload && (
                <Button variant="outline" size="sm" onClick={onDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="border rounded-lg p-6 space-y-6 bg-white dark:bg-gray-950">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">{tenantName}</h2>
              <p className="text-sm text-muted-foreground">Payslip for {periodLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Employee Number</p>
              <p className="font-mono font-medium">{staff.employeeNumber}</p>
            </div>
          </div>

          <Separator />

          {/* Employee Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Employee Name</p>
              <p className="font-medium">{staff.firstName} {staff.lastName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ID Number</p>
              <p className="font-mono">{staff.idNumber.replace(/(\d{6})(\d{4})(\d{3})/, '$1 $2 $3')}</p>
            </div>
            {staff.taxNumber && (
              <div>
                <p className="text-sm text-muted-foreground">Tax Number</p>
                <p className="font-mono">{staff.taxNumber}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Start Date</p>
              <p>{format(new Date(staff.startDate), 'dd MMM yyyy')}</p>
            </div>
          </div>

          <Separator />

          {/* Earnings */}
          <div>
            <h3 className="font-semibold mb-3">Earnings</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Basic Salary</span>
                <span className="font-mono">{formatCurrency(entry.grossSalary / 100)}</span>
              </div>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Gross Salary</span>
              <span className="font-mono">{formatCurrency(entry.grossSalary / 100)}</span>
            </div>
          </div>

          <Separator />

          {/* Deductions */}
          <div>
            <h3 className="font-semibold mb-3">Deductions</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>PAYE (Income Tax)</span>
                <span className="font-mono text-red-600">-{formatCurrency(entry.paye / 100)}</span>
              </div>
              <div className="flex justify-between">
                <span>UIF (Employee)</span>
                <span className="font-mono text-red-600">-{formatCurrency(entry.uif / 100)}</span>
              </div>
              {entry.deductions?.map((deduction, index) => (
                <div key={index} className="flex justify-between">
                  <span>{deduction.description || deduction.type}</span>
                  <span className="font-mono text-red-600">-{formatCurrency(deduction.amount / 100)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total Deductions</span>
              <span className="font-mono text-red-600">
                -{formatCurrency((entry.paye + entry.uif + (entry.deductions?.reduce((sum, d) => sum + d.amount, 0) || 0)) / 100)}
              </span>
            </div>
          </div>

          <Separator />

          {/* Net Pay */}
          <div className="bg-primary/5 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold">Net Pay</span>
              <span className="text-2xl font-bold font-mono text-primary">
                {formatCurrency(entry.netSalary / 100)}
              </span>
            </div>
          </div>

          {/* Employer Contributions (for info) */}
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Employer Contributions (not deducted from pay)</p>
            <div className="flex justify-between">
              <span>UIF (Employer)</span>
              <span className="font-mono">{formatCurrency(entry.uifEmployer / 100)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-muted-foreground text-center pt-4 border-t">
            <p>This payslip was generated by {tenantName} on {format(new Date(), 'dd MMMM yyyy')}</p>
            <p>Please retain for your records.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
