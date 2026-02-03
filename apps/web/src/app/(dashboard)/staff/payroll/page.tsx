'use client';

/**
 * Payroll Processing Page
 * TASK-PAY-021: Complete Payroll Processing Frontend Integration
 *
 * Processes monthly payroll for staff members:
 * 1. Select staff members (PayrollWizard handles)
 * 2. Calculate PAYE/UIF preview (PayrollWizard handles)
 * 3. Process payroll via backend API
 * 4. Create Xero journal entries (if Xero connected)
 * 5. Post journals to Xero (if Xero connected)
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PayrollWizard } from '@/components/staff';
import { useStaffList, useProcessPayroll } from '@/hooks/use-staff';
import { useXeroStatus } from '@/hooks/useXeroStatus';
import { useSimplePayStatus } from '@/hooks/use-simplepay';
import { useToast } from '@/hooks/use-toast';
import {
  useGenerateXeroJournals,
  useBulkPostXeroJournals,
} from '@/hooks/use-payroll-processing';
import type { IPayrollEntry } from '@crechebooks/types';

type ProcessingStep = 'idle' | 'payroll' | 'journals' | 'posting' | 'complete' | 'error';

interface ProcessingState {
  step: ProcessingStep;
  message: string;
  details?: string;
}

export default function PayrollPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data } = useStaffList({ status: 'active' });
  const { status: xeroStatus } = useXeroStatus();
  const { data: simplePayStatus } = useSimplePayStatus();
  const now = new Date();

  const [processingState, setProcessingState] = useState<ProcessingState>({
    step: 'idle',
    message: '',
  });

  const processPayroll = useProcessPayroll();
  const generateJournals = useGenerateXeroJournals();
  const bulkPostJournals = useBulkPostXeroJournals();

  const isProcessing = processingState.step !== 'idle' && processingState.step !== 'complete' && processingState.step !== 'error';

  /**
   * Handle payroll completion from PayrollWizard.
   *
   * This is the main flow that:
   * 1. Processes payroll via backend (creates Payroll records)
   * 2. Generates Xero journals (if Xero connected)
   * 3. Posts journals to Xero (if Xero connected)
   */
  const handleComplete = async (
    selectedStaff: string[],
    _payrollEntries: IPayrollEntry[]
  ): Promise<void> => {
    if (selectedStaff.length === 0) {
      toast({
        title: 'No staff members selected',
        description: 'Please select at least one staff member to process payroll.',
        variant: 'destructive',
      });
      return;
    }

    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    try {
      // Step 1: Process payroll
      setProcessingState({
        step: 'payroll',
        message: 'Processing payroll...',
        details: `Calculating PAYE and UIF for ${selectedStaff.length} staff members`,
      });

      const result = await processPayroll.mutateAsync({
        month,
        year,
        staffIds: selectedStaff,
      });

      if (!result.success) {
        throw new Error('Payroll processing failed on server');
      }

      // Report partial failures but continue
      if (result.errors && result.errors.length > 0) {
        const failedCount = result.errors.length;
        const errorMessages = result.errors.slice(0, 3).map((e) => e.error).join('; ');
        toast({
          title: `Processed ${result.count} staff, ${failedCount} failed`,
          description: errorMessages,
          variant: 'destructive',
        });
      }

      // Step 2: Create Xero journals (if Xero connected)
      if (xeroStatus?.isConnected) {
        setProcessingState({
          step: 'journals',
          message: 'Creating Xero journal entries...',
          details: `Generating journal entries for ${result.count} payroll records`,
        });

        // Calculate period start and end for the month
        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0); // Last day of month

        const journalResult = await generateJournals.mutateAsync({
          payrollPeriodStart: periodStart.toISOString(),
          payrollPeriodEnd: periodEnd.toISOString(),
        });

        // Report skipped journals
        if (journalResult.skipped.length > 0) {
          const skippedReasons = journalResult.skipped.slice(0, 3).map((s) => s.reason).join('; ');
          toast({
            title: `${journalResult.skipped.length} journal(s) skipped`,
            description: skippedReasons,
          });
        }

        // Step 3: Post journals to Xero
        if (journalResult.created.length > 0) {
          setProcessingState({
            step: 'posting',
            message: 'Posting to Xero...',
            details: `Posting ${journalResult.created.length} journal entries`,
          });

          const journalIds = journalResult.created.map((j) => j.id);
          const postResult = await bulkPostJournals.mutateAsync({ journalIds });

          // Report partial posting failures
          if (postResult.failed > 0) {
            const failedJournals = postResult.results
              .filter((r) => r.status === 'FAILED')
              .slice(0, 3)
              .map((r) => r.errorMessage || 'Unknown error')
              .join('; ');

            toast({
              title: `Posted ${postResult.posted}/${postResult.total} journals to Xero`,
              description: failedJournals,
              variant: 'destructive',
            });
          }
        }
      }

      // Success
      setProcessingState({
        step: 'complete',
        message: 'Payroll processed successfully',
        details: xeroStatus?.isConnected
          ? 'Payroll records created and posted to Xero'
          : 'Payroll records created. Connect Xero to sync journals.',
      });

      toast({
        title: `Payroll processed for ${result.count} staff members`,
        description: xeroStatus?.isConnected ? 'Xero journals created and posted' : 'Payroll records created',
      });

      // Redirect after a brief delay to show success state
      setTimeout(() => {
        router.push('/staff');
      }, 1500);
    } catch (error) {
      let errorMessage = 'An unexpected error occurred';
      let errorDetails: string | undefined;

      if (error instanceof AxiosError) {
        errorMessage = error.response?.data?.message || 'Failed to process payroll';
        errorDetails = error.response?.data?.error || error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setProcessingState({
        step: 'error',
        message: errorMessage,
        details: errorDetails,
      });

      toast({
        title: 'Payroll processing failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleRetry = () => {
    setProcessingState({ step: 'idle', message: '' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/staff">
          <Button variant="ghost" size="icon" disabled={isProcessing}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">
            Process monthly payroll for staff members
          </p>
        </div>
      </div>

      {/* SimplePay Integration Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>SimplePay Integration</CardTitle>
          <CardDescription>
            Payroll is processed via SimplePay. PAYE, UIF, and other deductions are calculated automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">PAYE</span>
              <p className="text-muted-foreground">Calculated by SimplePay per SARS brackets</p>
            </div>
            <div>
              <span className="font-medium">UIF</span>
              <p className="text-muted-foreground">1% employee + 1% employer (capped at R17,712)</p>
            </div>
            <div>
              <span className="font-medium">SDL</span>
              <p className="text-muted-foreground">Skills Development Levy (if applicable)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SimplePay Connection Status */}
      {!simplePayStatus?.isConnected && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>SimplePay not connected</AlertTitle>
          <AlertDescription>
            You must connect SimplePay before processing payroll.{' '}
            <Link href="/settings/integrations/simplepay" className="underline">
              Connect SimplePay
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Xero Connection Status */}
      {simplePayStatus?.isConnected && !xeroStatus?.isConnected && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Xero not connected</AlertTitle>
          <AlertDescription>
            Payroll will be processed but journals will not be synced to Xero.{' '}
            <Link href="/settings/integrations" className="underline">
              Connect Xero
            </Link>{' '}
            to enable automatic journal posting.
          </AlertDescription>
        </Alert>
      )}

      {/* Processing State Card */}
      {processingState.step !== 'idle' && (
        <Card
          className={
            processingState.step === 'error'
              ? 'border-destructive bg-destructive/5'
              : processingState.step === 'complete'
              ? 'border-green-500 bg-green-500/5'
              : 'border-primary bg-primary/5'
          }
        >
          <CardContent className="flex items-center gap-4 py-4">
            {processingState.step === 'error' ? (
              <AlertCircle className="h-6 w-6 text-destructive" />
            ) : processingState.step === 'complete' ? (
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            )}
            <div className="flex-1">
              <p className="font-medium">{processingState.message}</p>
              {processingState.details && (
                <p className="text-sm text-muted-foreground">{processingState.details}</p>
              )}
            </div>
            {processingState.step === 'error' && (
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Try Again
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payroll Wizard */}
      <PayrollWizard
        month={now.getMonth() + 1}
        year={now.getFullYear()}
        staff={data?.staff ?? []}
        onComplete={handleComplete}
        onCancel={() => router.push('/staff')}
        isLoading={isProcessing}
      />
    </div>
  );
}
