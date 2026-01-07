/**
 * Off-boarding Dialog Component
 * TASK-ENROL-005: Off-Boarding Workflow (Graduation & Withdrawal)
 *
 * @description Dialog for processing enrollment off-boarding with:
 * - Account settlement preview
 * - Reason selection (graduation/withdrawal)
 * - Credit handling options
 * - Final statement generation
 */

'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSettlementPreview, useInitiateOffboarding } from '@/hooks/use-enrollments';
import type { CreditAction, OffboardingReason, Enrollment } from '@/lib/api/enrollments';

interface OffboardingDialogProps {
  enrollment: Enrollment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatCurrency(cents: number): string {
  return `R ${(cents / 100).toFixed(2)}`;
}

export function OffboardingDialog({
  enrollment,
  open,
  onOpenChange,
  onSuccess,
}: OffboardingDialogProps) {
  const [endDate, setEndDate] = React.useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = React.useState<OffboardingReason>('GRADUATION');
  const [creditAction, setCreditAction] = React.useState<CreditAction>('apply');
  const [siblingEnrollmentId, setSiblingEnrollmentId] = React.useState<string>('');
  const [step, setStep] = React.useState<'preview' | 'confirm' | 'complete'>('preview');
  const [result, setResult] = React.useState<{
    status: string;
    creditAmount: number;
    finalStatementId: string | null;
  } | null>(null);

  const { data: settlement, isLoading: isLoadingSettlement, error: settlementError } =
    useSettlementPreview(enrollment?.id || '', endDate, open && !!enrollment?.id);

  const offboardingMutation = useInitiateOffboarding();

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setStep('preview');
      setResult(null);
      setEndDate(format(new Date(), 'yyyy-MM-dd'));
      setReason('GRADUATION');
      setCreditAction('apply');
      setSiblingEnrollmentId('');
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!enrollment) return;

    try {
      const response = await offboardingMutation.mutateAsync({
        enrollmentId: enrollment.id,
        endDate,
        reason,
        creditAction,
        siblingEnrollmentId: creditAction === 'sibling' ? siblingEnrollmentId : undefined,
      });

      setResult({
        status: response.status,
        creditAmount: response.creditAmount,
        finalStatementId: response.finalStatementId,
      });
      setStep('complete');
      onSuccess?.();
    } catch {
      // Error is handled by react-query
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  if (!enrollment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'complete' ? 'Off-boarding Complete' : 'Off-board Enrollment'}
          </DialogTitle>
          <DialogDescription>
            {step === 'preview' && `Process off-boarding for ${enrollment.child_name}`}
            {step === 'confirm' && 'Review and confirm the off-boarding details'}
            {step === 'complete' && 'The enrollment has been successfully off-boarded'}
          </DialogDescription>
        </DialogHeader>

        {step === 'preview' && (
          <div className="space-y-4">
            {/* End Date Selection */}
            <div className="space-y-2">
              <Label htmlFor="endDate">Off-boarding Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Reason Selection */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Off-boarding</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as OffboardingReason)}>
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GRADUATION">Graduation</SelectItem>
                  <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Settlement Preview */}
            {isLoadingSettlement && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading settlement preview...</span>
              </div>
            )}

            {settlementError && (
              <Card className="border-destructive">
                <CardContent className="pt-6">
                  <div className="flex items-center text-destructive">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    <span>Failed to load settlement preview</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {settlement && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Account Settlement Preview</CardTitle>
                  <CardDescription>
                    {settlement.childName} ({settlement.parentName})
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Outstanding Balance:</span>
                      <span className="ml-2 font-medium">
                        {formatCurrency(settlement.outstandingBalance)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pro-rata Credit:</span>
                      <span className="ml-2 font-medium text-green-600">
                        -{formatCurrency(settlement.proRataCredit)}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <span className="font-medium">Net Amount:</span>
                    <Badge variant={settlement.netAmount > 0 ? 'destructive' : 'default'}>
                      {settlement.netAmount > 0
                        ? `Owes ${formatCurrency(settlement.netAmount)}`
                        : settlement.netAmount < 0
                          ? `Credit ${formatCurrency(Math.abs(settlement.netAmount))}`
                          : 'Settled'}
                    </Badge>
                  </div>

                  {/* Outstanding Invoices */}
                  {settlement.invoices.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2">Outstanding Invoices</h4>
                      <div className="space-y-1 text-sm">
                        {settlement.invoices.map((inv) => (
                          <div key={inv.id} className="flex justify-between">
                            <span>{inv.invoiceNumber}</span>
                            <span>
                              {formatCurrency(inv.totalCents - inv.paidCents)} outstanding
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Credit Action (only if there's credit) */}
            {settlement && settlement.netAmount < 0 && (
              <div className="space-y-2">
                <Label htmlFor="creditAction">How to Handle Credit Balance</Label>
                <Select value={creditAction} onValueChange={(v) => setCreditAction(v as CreditAction)}>
                  <SelectTrigger id="creditAction">
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apply">Apply to Account</SelectItem>
                    <SelectItem value="refund">Mark for Refund</SelectItem>
                    <SelectItem value="donate">Donate to School</SelectItem>
                    <SelectItem value="sibling">Transfer to Sibling</SelectItem>
                    <SelectItem value="none">No Action</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Sibling Enrollment ID (if transferring) */}
            {creditAction === 'sibling' && (
              <div className="space-y-2">
                <Label htmlFor="siblingEnrollmentId">Sibling Enrollment ID</Label>
                <Input
                  id="siblingEnrollmentId"
                  placeholder="Enter sibling's enrollment ID"
                  value={siblingEnrollmentId}
                  onChange={(e) => setSiblingEnrollmentId(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && settlement && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Child:</span>
                    <span className="font-medium">{enrollment.child_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Parent:</span>
                    <span className="font-medium">{enrollment.parent_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End Date:</span>
                    <span className="font-medium">{format(new Date(endDate), 'MMMM d, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reason:</span>
                    <Badge variant={reason === 'GRADUATION' ? 'default' : 'secondary'}>
                      {reason}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Amount:</span>
                    <span className="font-medium">
                      {settlement.netAmount > 0
                        ? formatCurrency(settlement.netAmount)
                        : settlement.netAmount < 0
                          ? `-${formatCurrency(Math.abs(settlement.netAmount))}`
                          : 'R 0.00'}
                    </span>
                  </div>
                  {settlement.netAmount < 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credit Action:</span>
                      <span className="font-medium capitalize">{creditAction}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-2 p-4 bg-amber-50 rounded-lg border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This action cannot be undone. The enrollment will be marked as{' '}
                {reason === 'GRADUATION' ? 'graduated' : 'withdrawn'} and a final statement will be
                generated.
              </p>
            </div>
          </div>
        )}

        {step === 'complete' && result && (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Off-boarding Successful</h3>
            <p className="text-muted-foreground mb-4">
              {enrollment.child_name} has been marked as {result.status.toLowerCase()}.
            </p>
            <div className="space-y-2 text-sm">
              {result.creditAmount > 0 && (
                <p>
                  Credit of {formatCurrency(result.creditAmount)} has been processed.
                </p>
              )}
              {result.finalStatementId && (
                <p className="text-muted-foreground">
                  Final statement has been generated.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep('confirm')}
                disabled={!settlement || isLoadingSettlement}
              >
                Continue
              </Button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={offboardingMutation.isPending}
                variant={reason === 'WITHDRAWAL' ? 'destructive' : 'default'}
              >
                {offboardingMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {reason === 'GRADUATION' ? 'Graduate' : 'Withdraw'} Enrollment
              </Button>
            </>
          )}

          {step === 'complete' && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
