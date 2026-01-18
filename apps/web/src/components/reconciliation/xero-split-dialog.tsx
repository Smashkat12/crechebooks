'use client';

/**
 * XeroSplitDialog Component
 * TASK-RECON-037: Dialog for splitting Xero transactions to match bank statements
 *
 * When a Xero transaction has a different amount than the bank statement
 * (e.g., Xero shows R1,219.70 but bank shows R1,200.00), this dialog allows
 * the user to split the Xero transaction into:
 * - Net amount (R1,200.00) - matches bank statement
 * - Fee amount (R19.70) - recorded as accrued bank charge
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Scissors, AlertCircle, CheckCircle2, Info, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useDetectSplitParams, useCreateXeroSplit } from '@/hooks/use-xero-split';
import type { SplitDetectionResult } from '@/lib/api/xero-split';

// Common bank fee types
const FEE_TYPES = [
  { value: 'ADT_DEPOSIT_FEE', label: 'ADT Deposit Fee', description: 'Card machine deposit fee' },
  { value: 'EFT_DEPOSIT_FEE', label: 'EFT Deposit Fee', description: 'Electronic transfer deposit fee' },
  { value: 'CARD_PROCESSING_FEE', label: 'Card Processing Fee', description: 'Card transaction fee' },
  { value: 'BANK_CHARGE', label: 'Bank Charge', description: 'General bank charge' },
  { value: 'CASH_DEPOSIT_FEE', label: 'Cash Deposit Fee', description: 'Cash deposit fee' },
  { value: 'OTHER', label: 'Other', description: 'Other fee type' },
];

interface XeroSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Bank transaction details
  bankTransactionId?: string;
  bankStatementMatchId?: string;
  bankAmount: number; // Amount in Rands (what the bank statement shows - NET)
  bankDescription: string;
  bankDate: string;
  // Xero transaction details
  xeroTransactionId: string;
  xeroAmount: number; // Amount in Rands (what Xero shows - GROSS)
  xeroDescription?: string;
  // Callbacks
  onSuccess?: () => void;
}

export function XeroSplitDialog({
  open,
  onOpenChange,
  bankTransactionId,
  bankStatementMatchId,
  bankAmount,
  bankDescription,
  bankDate: _bankDate, // Currently unused but kept for future enhancement
  xeroTransactionId,
  xeroAmount,
  xeroDescription,
  onSuccess,
}: XeroSplitDialogProps) {
  void _bankDate; // Suppress unused warning
  // State for split parameters
  const [netAmount, setNetAmount] = useState<string>('');
  const [feeAmount, setFeeAmount] = useState<string>('');
  const [feeType, setFeeType] = useState<string>('');
  const [feeDescription, setFeeDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [detectionResult, setDetectionResult] = useState<SplitDetectionResult | null>(null);

  // Mutations
  const detectSplit = useDetectSplitParams();
  const createSplit = useCreateXeroSplit();

  // Calculate the difference
  const difference = xeroAmount - bankAmount;
  const differencePercent = ((difference / xeroAmount) * 100).toFixed(2);

  // Auto-detect split parameters on open
  useEffect(() => {
    if (open && xeroTransactionId && xeroAmount > 0 && bankAmount > 0) {
      const diff = xeroAmount - bankAmount;
      detectSplit.mutate(
        {
          xeroTransactionId,
          xeroAmountCents: Math.round(xeroAmount * 100),
          bankAmountCents: Math.round(bankAmount * 100),
          description: xeroDescription || bankDescription,
        },
        {
          onSuccess: (result) => {
            setDetectionResult(result);
            // Pre-fill the form with suggested values
            setNetAmount((result.suggestedNetAmountCents / 100).toFixed(2));
            setFeeAmount((result.suggestedFeeAmountCents / 100).toFixed(2));
            setFeeType(result.suggestedFeeType);
          },
          onError: (error) => {
            console.error('Failed to detect split params:', error);
            // Fall back to calculated values
            setNetAmount(bankAmount.toFixed(2));
            setFeeAmount(diff.toFixed(2));
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, xeroTransactionId, xeroAmount, bankAmount, xeroDescription, bankDescription]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setNetAmount('');
      setFeeAmount('');
      setFeeType('');
      setFeeDescription('');
      setNotes('');
      setDetectionResult(null);
    }
  }, [open]);

  // Calculate validation
  const netAmountNum = parseFloat(netAmount) || 0;
  const feeAmountNum = parseFloat(feeAmount) || 0;
  const totalSplit = netAmountNum + feeAmountNum;
  const isValidSplit = Math.abs(totalSplit - xeroAmount) < 0.01; // Allow 1 cent tolerance
  const canSubmit = isValidSplit && feeType && netAmountNum > 0 && feeAmountNum > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      await createSplit.mutateAsync({
        xero_transaction_id: xeroTransactionId,
        net_amount_cents: Math.round(netAmountNum * 100),
        fee_amount_cents: Math.round(feeAmountNum * 100),
        fee_type: feeType,
        fee_description: feeDescription || undefined,
        bank_transaction_id: bankTransactionId,
        bank_statement_match_id: bankStatementMatchId,
        notes: notes || undefined,
      });

      toast({
        title: 'Transaction split created',
        description: `Split into ${formatCurrency(netAmountNum)} net + ${formatCurrency(feeAmountNum)} fee`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Failed to create split',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleUseSuggested = () => {
    if (detectionResult) {
      setNetAmount((detectionResult.suggestedNetAmountCents / 100).toFixed(2));
      setFeeAmount((detectionResult.suggestedFeeAmountCents / 100).toFixed(2));
      setFeeType(detectionResult.suggestedFeeType);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Split Xero Transaction
          </DialogTitle>
          <DialogDescription>
            Split this Xero transaction to match the bank statement amount by separating the net
            deposit from the bank fee.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Amount Comparison */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Xero Amount</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(xeroAmount)}</p>
              <p className="text-xs text-muted-foreground truncate" title={xeroDescription}>
                {xeroDescription || 'Xero transaction'}
              </p>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Bank Amount</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(bankAmount)}</p>
              <p className="text-xs text-muted-foreground truncate" title={bankDescription}>
                {bankDescription}
              </p>
            </div>
          </div>

          {/* Difference Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Amount Difference: {formatCurrency(difference)}</AlertTitle>
            <AlertDescription>
              The bank statement shows {formatCurrency(bankAmount)} (NET) while Xero shows{' '}
              {formatCurrency(xeroAmount)} (GROSS). The difference of {formatCurrency(difference)} (
              {differencePercent}%) will be recorded as an accrued bank charge.
            </AlertDescription>
          </Alert>

          {/* Detection Result */}
          {detectSplit.isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Analyzing transaction...</span>
            </div>
          )}

          {detectionResult && (
            <Alert variant={detectionResult.isSplitRecommended ? 'default' : 'destructive'}>
              {detectionResult.isSplitRecommended ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle className="flex items-center gap-2">
                {detectionResult.isSplitRecommended ? 'Split Recommended' : 'Low Confidence'}
                <Badge variant="outline">{(detectionResult.confidence * 100).toFixed(0)}% confidence</Badge>
              </AlertTitle>
              <AlertDescription>
                {detectionResult.explanation || 'Based on the transaction amounts and description.'}
                {detectionResult.expectedFeeCents && (
                  <span className="block mt-1">
                    Expected fee based on rules: {formatCurrency(detectionResult.expectedFeeCents / 100)}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Split Form */}
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="netAmount">Net Amount (Bank Statement)</Label>
                <Input
                  id="netAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={netAmount}
                  onChange={(e) => {
                    setNetAmount(e.target.value);
                    // Auto-calculate fee
                    const net = parseFloat(e.target.value) || 0;
                    setFeeAmount((xeroAmount - net).toFixed(2));
                  }}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Amount that matches bank statement
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feeAmount">Fee Amount (Accrued Charge)</Label>
                <Input
                  id="feeAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={feeAmount}
                  onChange={(e) => {
                    setFeeAmount(e.target.value);
                    // Auto-calculate net
                    const fee = parseFloat(e.target.value) || 0;
                    setNetAmount((xeroAmount - fee).toFixed(2));
                  }}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Bank fee to be recorded as accrued
                </p>
              </div>
            </div>

            {/* Validation */}
            {netAmount && feeAmount && (
              <div
                className={`text-sm p-2 rounded ${
                  isValidSplit
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {isValidSplit ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Split amounts add up correctly: {formatCurrency(netAmountNum)} + {formatCurrency(feeAmountNum)} ={' '}
                    {formatCurrency(totalSplit)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Split amounts must equal Xero amount: {formatCurrency(totalSplit)} ≠{' '}
                    {formatCurrency(xeroAmount)} (diff: {formatCurrency(totalSplit - xeroAmount)})
                  </span>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="feeType">Fee Type</Label>
              <Select value={feeType} onValueChange={setFeeType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fee type" />
                </SelectTrigger>
                <SelectContent>
                  {FEE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex flex-col">
                        <span>{type.label}</span>
                        <span className="text-xs text-muted-foreground">{type.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feeDescription">Fee Description (Optional)</Label>
              <Input
                id="feeDescription"
                value={feeDescription}
                onChange={(e) => setFeeDescription(e.target.value)}
                placeholder="e.g., ADT card machine fee"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes about this split..."
                rows={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div className="flex gap-2">
            {detectionResult && (
              <Button variant="outline" onClick={handleUseSuggested} disabled={createSplit.isPending}>
                Use Suggested Values
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createSplit.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || createSplit.isPending}>
              {createSplit.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Split...
                </>
              ) : (
                <>
                  <Scissors className="mr-2 h-4 w-4" />
                  Create Split
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
