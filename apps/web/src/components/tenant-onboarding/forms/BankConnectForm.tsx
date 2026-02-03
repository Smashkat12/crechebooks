'use client';

/**
 * Bank Connection Inline Form
 * TASK-ACCT-UI-006: Inline form for onboarding wizard
 */

import { Loader2, CheckCircle2, Link2, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useXeroStatus } from '@/hooks/useXeroStatus';
import { useRouter } from 'next/navigation';

interface BankConnectFormProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function BankConnectForm({ onComplete, onCancel }: BankConnectFormProps) {
  const router = useRouter();
  const { status, isLoading } = useXeroStatus();

  const handleConnectXero = () => {
    // Navigate to Xero connection page
    router.push('/settings/integrations');
  };

  const handleConnectBankDirect = () => {
    // Navigate to bank reconciliation setup
    router.push('/reconciliation');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If already connected
  if (status?.isConnected) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              Xero is connected to {status.organizationName || 'your account'}
            </span>
          </div>
          {status.lastSyncAt && (
            <p className="text-sm text-green-600 mt-1">
              Last synced: {new Date(status.lastSyncAt).toLocaleString('en-ZA')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onComplete}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Connect your bank for automatic reconciliation and transaction importing.
          This step is optional but highly recommended.
        </p>
      </div>

      {/* Xero connection option */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#13B5EA]/10 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#13B5EA]" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.927 15.683l-1.727-1.727-1.727 1.727-1.727-1.727 1.727-1.727-1.727-1.727 1.727-1.727 1.727 1.727 1.727-1.727 1.727 1.727-1.727 1.727 1.727 1.727-1.727 1.727zm-6.854 0L8.346 13.956l-1.727 1.727-1.727-1.727 1.727-1.727-1.727-1.727 1.727-1.727 1.727 1.727 1.727-1.727 1.727 1.727-1.727 1.727 1.727 1.727-1.727 1.727z"/>
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-medium">Connect via Xero</h4>
            <p className="text-sm text-muted-foreground">
              Connect your Xero accounting software to sync bank transactions automatically.
            </p>
          </div>
        </div>
        <Button onClick={handleConnectXero} className="w-full">
          <Link2 className="mr-2 h-4 w-4" />
          Connect to Xero
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Manual bank statement option */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Link2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">Import Bank Statements</h4>
            <p className="text-sm text-muted-foreground">
              Manually upload bank statements for reconciliation without Xero.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleConnectBankDirect} className="w-full">
          Go to Reconciliation
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="bg-muted/50 p-3 rounded-lg text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="text-muted-foreground">
            <p className="font-medium">This step is optional</p>
            <p>
              You can connect your bank at any time from Settings &gt; Integrations.
              Bank connection enables automatic payment matching and reconciliation.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button variant="ghost" onClick={onComplete}>
          Skip for now
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export default BankConnectForm;
