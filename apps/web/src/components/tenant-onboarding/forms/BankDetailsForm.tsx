'use client';

/**
 * Bank Details Inline Form
 * TASK-ACCT-014: Inline form for onboarding wizard
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant, useUpdateTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';

const bankDetailsSchema = z.object({
  bankName: z.string().min(1, 'Bank name is required').max(100),
  bankAccountHolder: z.string().min(1, 'Account holder name is required').max(200),
  bankAccountNumber: z.string().min(1, 'Account number is required').max(50),
  bankBranchCode: z.string().min(1, 'Branch code is required').max(20),
  bankAccountType: z.string().max(30).optional(),
  bankSwiftCode: z.string().max(20).optional(),
});

type BankDetailsFormData = z.infer<typeof bankDetailsSchema>;

interface BankDetailsFormProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function BankDetailsForm({ onComplete, onCancel }: BankDetailsFormProps) {
  const { toast } = useToast();
  const { data: tenant, isLoading: tenantLoading } = useTenant();
  const updateTenant = useUpdateTenant();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BankDetailsFormData>({
    resolver: zodResolver(bankDetailsSchema),
  });

  // Pre-populate form with existing data
  useEffect(() => {
    if (tenant) {
      reset({
        bankName: tenant.bankName || '',
        bankAccountHolder: tenant.bankAccountHolder || '',
        bankAccountNumber: tenant.bankAccountNumber || '',
        bankBranchCode: tenant.bankBranchCode || '',
        bankAccountType: tenant.bankAccountType || '',
        bankSwiftCode: tenant.bankSwiftCode || '',
      });
    }
  }, [tenant, reset]);

  const onSubmit = async (data: BankDetailsFormData) => {
    if (!tenant) return;

    try {
      await updateTenant.mutateAsync({
        tenantId: tenant.id,
        data,
      });
      toast({
        title: 'Banking details saved',
        description: 'Your banking details have been updated successfully.',
      });
      onComplete();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save banking details. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bankName">Bank Name *</Label>
          <Input
            id="bankName"
            {...register('bankName')}
            placeholder="e.g., Standard Bank, FNB, ABSA"
          />
          {errors.bankName && (
            <p className="text-sm text-destructive">{errors.bankName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankAccountHolder">Account Holder *</Label>
          <Input
            id="bankAccountHolder"
            {...register('bankAccountHolder')}
            placeholder="e.g., Elle Elephant Creche PTY LTD"
          />
          {errors.bankAccountHolder && (
            <p className="text-sm text-destructive">{errors.bankAccountHolder.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankAccountNumber">Account Number *</Label>
          <Input
            id="bankAccountNumber"
            {...register('bankAccountNumber')}
            placeholder="e.g., 1234567890"
          />
          {errors.bankAccountNumber && (
            <p className="text-sm text-destructive">{errors.bankAccountNumber.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankBranchCode">Branch Code *</Label>
          <Input
            id="bankBranchCode"
            {...register('bankBranchCode')}
            placeholder="e.g., 051001"
          />
          {errors.bankBranchCode && (
            <p className="text-sm text-destructive">{errors.bankBranchCode.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankAccountType">Account Type</Label>
          <Input
            id="bankAccountType"
            {...register('bankAccountType')}
            placeholder="e.g., Cheque, Savings, Current"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankSwiftCode">SWIFT/BIC Code</Label>
          <Input
            id="bankSwiftCode"
            {...register('bankSwiftCode')}
            placeholder="e.g., SBZAZAJJ (optional)"
          />
        </div>
      </div>

      <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
        These details will appear on invoices and statements sent to parents.
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting || updateTenant.isPending}>
          {(isSubmitting || updateTenant.isPending) ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Save & Complete
            </>
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default BankDetailsForm;
