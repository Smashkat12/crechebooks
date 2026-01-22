'use client';

/**
 * Bank Details Card Component
 * TASK-PORTAL-015: Parent Portal Payments Page
 *
 * Displays creche bank details for EFT payments with:
 * - Bank name, account holder, account number
 * - Branch code, account type
 * - Auto-generated payment reference
 * - Copy to clipboard functionality
 */

import { useState, useCallback } from 'react';
import { Building2, Copy, Check, CreditCard, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import type { CrecheBankDetails } from '@/hooks/parent-portal/use-parent-payments';

interface BankDetailsCardProps {
  bankDetails?: CrecheBankDetails;
  isLoading?: boolean;
  error?: Error | null;
  paymentReference: string;
}

interface CopyButtonProps {
  text: string;
  label: string;
}

function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: `${label} copied to clipboard`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Please copy manually',
        variant: 'destructive',
      });
    }
  }, [text, label, toast]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={handleCopy}
      title={`Copy ${label}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </Button>
  );
}

function BankDetailsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
        <Skeleton className="h-10 w-full mt-4" />
      </CardContent>
    </Card>
  );
}

export function BankDetailsCard({
  bankDetails,
  isLoading,
  error,
  paymentReference,
}: BankDetailsCardProps) {
  const { toast } = useToast();
  const [copiedAll, setCopiedAll] = useState(false);

  const copyAllDetails = useCallback(async () => {
    if (!bankDetails) return;

    const allDetails = `Bank Details for Payment:
Bank: ${bankDetails.bankName}
Account Holder: ${bankDetails.accountHolderName}
Account Number: ${bankDetails.accountNumber}
Branch Code: ${bankDetails.branchCode}
Account Type: ${bankDetails.accountType}
Reference: ${paymentReference}`;

    try {
      await navigator.clipboard.writeText(allDetails);
      setCopiedAll(true);
      toast({
        title: 'All details copied!',
        description: 'Bank details copied to clipboard',
      });
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Please copy manually',
        variant: 'destructive',
      });
    }
  }, [bankDetails, paymentReference, toast]);

  if (isLoading) {
    return <BankDetailsSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load bank details: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!bankDetails) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Bank details not available. Please contact the creche for payment information.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Bank Details for EFT Payment
        </CardTitle>
        <CardDescription>
          Use the details below to make an EFT payment
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Bank Name */}
        <div className="flex justify-between items-center py-2 border-b border-border/50">
          <span className="text-sm text-muted-foreground">Bank</span>
          <span className="font-medium">{bankDetails.bankName}</span>
        </div>

        {/* Account Holder */}
        <div className="flex justify-between items-center py-2 border-b border-border/50">
          <span className="text-sm text-muted-foreground">Account Holder</span>
          <span className="font-medium">{bankDetails.accountHolderName}</span>
        </div>

        {/* Account Number */}
        <div className="flex justify-between items-center py-2 border-b border-border/50">
          <span className="text-sm text-muted-foreground">Account Number</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-medium">{bankDetails.accountNumber}</span>
            <CopyButton text={bankDetails.accountNumber} label="Account number" />
          </div>
        </div>

        {/* Branch Code */}
        <div className="flex justify-between items-center py-2 border-b border-border/50">
          <span className="text-sm text-muted-foreground">Branch Code</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-medium">{bankDetails.branchCode}</span>
            <CopyButton text={bankDetails.branchCode} label="Branch code" />
          </div>
        </div>

        {/* Account Type */}
        <div className="flex justify-between items-center py-2 border-b border-border/50">
          <span className="text-sm text-muted-foreground">Account Type</span>
          <Badge variant="secondary">{bankDetails.accountType}</Badge>
        </div>

        {/* SWIFT Code (if available) */}
        {bankDetails.swiftCode && (
          <div className="flex justify-between items-center py-2 border-b border-border/50">
            <span className="text-sm text-muted-foreground">SWIFT Code</span>
            <div className="flex items-center gap-1">
              <span className="font-mono font-medium">{bankDetails.swiftCode}</span>
              <CopyButton text={bankDetails.swiftCode} label="SWIFT code" />
            </div>
          </div>
        )}

        {/* Payment Reference - Highlighted */}
        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 p-3 mt-4">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Your Payment Reference
              </span>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
                Always include this reference
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono font-bold text-yellow-900 dark:text-yellow-100">
                {paymentReference}
              </span>
              <CopyButton text={paymentReference} label="Reference" />
            </div>
          </div>
        </div>

        {/* Payment Instructions */}
        {bankDetails.paymentInstructions && (
          <div className="text-xs text-muted-foreground mt-3 p-2 bg-muted/50 rounded">
            <CreditCard className="h-3.5 w-3.5 inline mr-1" />
            {bankDetails.paymentInstructions}
          </div>
        )}

        {/* Copy All Button */}
        <Button
          variant="outline"
          className="w-full mt-4"
          onClick={copyAllDetails}
        >
          {copiedAll ? (
            <>
              <Check className="h-4 w-4 mr-2 text-green-600" />
              Copied All Details
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copy All Bank Details
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
