'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/forms/form';
import { FormInput } from '@/components/forms/form-input';
import { DatePicker } from '@/components/forms/date-picker';
import { CurrencyInput } from '@/components/forms/currency-input';
import { useReconcile } from '@/hooks/use-reconciliation';
import { toast } from '@/hooks/use-toast';

// Validation schema
const reconciliationFormSchema = z.object({
  bankAccount: z.string().min(1, 'Bank account is required'),
  periodStart: z.date({ required_error: 'Start date is required' }),
  periodEnd: z.date({ required_error: 'End date is required' }),
  openingBalance: z.number({ required_error: 'Opening balance is required' }).min(0, 'Opening balance must be 0 or greater'),
  closingBalance: z.number({ required_error: 'Closing balance is required' }).min(0, 'Closing balance must be 0 or greater'),
}).refine(
  (data) => data.periodEnd > data.periodStart,
  {
    message: 'End date must be after start date',
    path: ['periodEnd'],
  }
);

type ReconciliationFormValues = z.infer<typeof reconciliationFormSchema>;

interface ReconciliationFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ReconciliationForm({ onSuccess, onCancel }: ReconciliationFormProps) {
  const reconcile = useReconcile();

  const form = useForm<ReconciliationFormValues>({
    resolver: zodResolver(reconciliationFormSchema),
    defaultValues: {
      bankAccount: '',
      periodStart: undefined,
      periodEnd: undefined,
      openingBalance: 0,
      closingBalance: 0,
    },
  });

  const onSubmit = async (data: ReconciliationFormValues) => {
    try {
      await reconcile.mutateAsync({
        startDate: data.periodStart.toISOString(),
        endDate: data.periodEnd.toISOString(),
        bankAccount: data.bankAccount,
        openingBalance: data.openingBalance,
        closingBalance: data.closingBalance,
      });

      toast({
        title: 'Reconciliation complete',
        description: 'Bank transactions have been reconciled successfully.',
      });

      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reconcile transactions';
      toast({
        title: 'Reconciliation failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormInput
          control={form.control}
          name="bankAccount"
          label="Bank Account"
          placeholder="e.g., FNB Business Account"
          description="Enter the name or identifier for your bank account"
          required
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DatePicker
            control={form.control}
            name="periodStart"
            label="Period Start"
            placeholder="Select start date"
            required
          />
          <DatePicker
            control={form.control}
            name="periodEnd"
            label="Period End"
            placeholder="Select end date"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CurrencyInput
            control={form.control}
            name="openingBalance"
            label="Opening Balance"
            description="Balance at period start (Rands)"
            required
          />
          <CurrencyInput
            control={form.control}
            name="closingBalance"
            label="Closing Balance"
            description="Balance at period end (Rands)"
            required
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={reconcile.isPending}>
            {reconcile.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {reconcile.isPending ? 'Reconciling...' : 'Start Reconciliation'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
