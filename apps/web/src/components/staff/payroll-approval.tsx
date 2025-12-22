'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Check, X, AlertTriangle, Clock, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils/format';
import type { IPayrollPeriod, PayrollStatus } from '@crechebooks/types';

interface PayrollApprovalProps {
  payrollPeriod: IPayrollPeriod;
  onApprove?: (notes?: string) => Promise<void>;
  onReject?: (reason: string) => Promise<void>;
  onProcess?: () => Promise<void>;
  onSubmit?: () => Promise<void>;
  isLoading?: boolean;
}

const statusConfig: Record<PayrollStatus, { label: string; icon: React.ReactNode; className: string }> = {
  DRAFT: { label: 'Draft', icon: <Clock className="h-4 w-4" />, className: 'bg-gray-100 text-gray-800' },
  APPROVED: { label: 'Approved', icon: <Check className="h-4 w-4" />, className: 'bg-green-100 text-green-800' },
  PROCESSED: { label: 'Processed', icon: <Send className="h-4 w-4" />, className: 'bg-blue-100 text-blue-800' },
  SUBMITTED: { label: 'Submitted to SARS', icon: <Check className="h-4 w-4" />, className: 'bg-purple-100 text-purple-800' },
};

export function PayrollApproval({
  payrollPeriod,
  onApprove,
  onReject,
  onProcess,
  onSubmit,
  isLoading = false,
}: PayrollApprovalProps) {
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const periodDate = new Date(payrollPeriod.year, payrollPeriod.month - 1, 1);
  const periodLabel = format(periodDate, 'MMMM yyyy');

  const totalGross = payrollPeriod.entries.reduce((sum, e) => sum + e.grossSalary, 0);
  const totalPaye = payrollPeriod.entries.reduce((sum, e) => sum + e.paye, 0);
  const totalUif = payrollPeriod.entries.reduce((sum, e) => sum + e.uif, 0);
  const totalUifEmployer = payrollPeriod.entries.reduce((sum, e) => sum + e.uifEmployer, 0);
  const totalNet = payrollPeriod.entries.reduce((sum, e) => sum + e.netSalary, 0);

  const statusInfo = statusConfig[payrollPeriod.status];

  const handleApprove = async () => {
    if (onApprove) {
      await onApprove(approvalNotes);
      setShowApproveDialog(false);
      setApprovalNotes('');
    }
  };

  const handleReject = async () => {
    if (onReject && rejectReason) {
      await onReject(rejectReason);
      setShowRejectDialog(false);
      setRejectReason('');
    }
  };

  const handleProcess = async () => {
    if (onProcess) {
      await onProcess();
      setShowProcessDialog(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl">Payroll Approval - {periodLabel}</CardTitle>
        <Badge variant="outline" className={statusInfo.className}>
          {statusInfo.icon}
          <span className="ml-1">{statusInfo.label}</span>
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Employees</p>
            <p className="text-lg font-semibold">{payrollPeriod.entries.length}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Gross Salaries</p>
            <p className="text-lg font-semibold font-mono">{formatCurrency(totalGross / 100)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">PAYE</p>
            <p className="text-lg font-semibold font-mono text-red-600">{formatCurrency(totalPaye / 100)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">UIF (Total)</p>
            <p className="text-lg font-semibold font-mono text-red-600">
              {formatCurrency((totalUif + totalUifEmployer) / 100)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Net Payable</p>
            <p className="text-lg font-semibold font-mono text-primary">{formatCurrency(totalNet / 100)}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t">
          {payrollPeriod.status === 'DRAFT' && (
            <>
              {onApprove && (
                <Button onClick={() => setShowApproveDialog(true)} disabled={isLoading}>
                  <Check className="h-4 w-4 mr-2" />
                  Approve Payroll
                </Button>
              )}
              {onReject && (
                <Button variant="destructive" onClick={() => setShowRejectDialog(true)} disabled={isLoading}>
                  <X className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              )}
            </>
          )}
          {payrollPeriod.status === 'APPROVED' && onProcess && (
            <Button onClick={() => setShowProcessDialog(true)} disabled={isLoading}>
              <Send className="h-4 w-4 mr-2" />
              Process Payments
            </Button>
          )}
          {payrollPeriod.status === 'PROCESSED' && onSubmit && (
            <Button onClick={onSubmit} disabled={isLoading}>
              <Send className="h-4 w-4 mr-2" />
              Submit to SARS
            </Button>
          )}
        </div>

        {/* Approve Dialog */}
        <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve Payroll</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to approve payroll for {periodLabel} covering{' '}
                {payrollPeriod.entries.length} employee(s) with a total net payment of{' '}
                {formatCurrency(totalNet / 100)}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-4">
              <Label>Approval Notes (optional)</Label>
              <Textarea
                placeholder="Add any notes about this approval..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleApprove}>
                <Check className="h-4 w-4 mr-2" />
                Approve
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reject Dialog */}
        <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Reject Payroll
              </AlertDialogTitle>
              <AlertDialogDescription>
                Please provide a reason for rejecting this payroll. The payroll will be returned
                to draft status for corrections.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-4">
              <Label>Rejection Reason *</Label>
              <Textarea
                placeholder="Explain why this payroll is being rejected..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Process Dialog */}
        <AlertDialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Process Payments</AlertDialogTitle>
              <AlertDialogDescription>
                This will initiate payment processing for {payrollPeriod.entries.length} employee(s)
                totaling {formatCurrency(totalNet / 100)}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Before proceeding, ensure:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside">
                <li>All employee bank details are verified</li>
                <li>Sufficient funds are available</li>
                <li>All deductions are correctly calculated</li>
              </ul>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleProcess}>
                <Send className="h-4 w-4 mr-2" />
                Process Payments
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
