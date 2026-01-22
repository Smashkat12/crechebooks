'use client';

/**
 * Banking Details Component
 * TASK-PORTAL-025: Staff Portal Profile
 *
 * Displays banking details in read-only format with masked account numbers.
 * Includes clear instructions for updating banking details via HR.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, CreditCard, Hash, Shield, Info, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface BankingDetails {
  bankName: string;
  accountNumber: string; // Already masked (e.g., ****4521)
  branchCode: string;
  accountType: string;
  updateNote?: string;
}

export interface BankingDetailsProps {
  details: BankingDetails;
  className?: string;
}

// ============================================================================
// Detail Row Component
// ============================================================================

interface DetailRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  isMasked?: boolean;
}

function DetailRow({ icon: Icon, label, value, isMasked }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <div className="p-2 rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className={cn(
            'font-medium',
            isMasked && 'font-mono tracking-wider'
          )}>
            {value}
          </p>
          {isMasked && (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function BankingDetailsDisplay({ details, className }: BankingDetailsProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-lg">Banking Details</CardTitle>
            <CardDescription>Your salary payment information</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Security Notice */}
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
          <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
            For your security, account numbers are partially hidden. Banking details can only
            be viewed, not modified, through this portal.
          </AlertDescription>
        </Alert>

        {/* Banking Details */}
        <div className="divide-y">
          <DetailRow
            icon={Building2}
            label="Bank Name"
            value={details.bankName}
          />
          <DetailRow
            icon={CreditCard}
            label="Account Number"
            value={details.accountNumber}
            isMasked
          />
          <DetailRow
            icon={Hash}
            label="Branch Code"
            value={details.branchCode}
          />
          <DetailRow
            icon={CreditCard}
            label="Account Type"
            value={details.accountType}
          />
        </div>

        {/* Update Instructions */}
        <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
          <Info className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200 text-sm">
            {details.updateNote || 'To update your banking details, please contact HR directly. Changes require verification for your protection.'}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

export default BankingDetailsDisplay;
