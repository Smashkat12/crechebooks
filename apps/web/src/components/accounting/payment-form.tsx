'use client';

/**
 * TASK-ACCT-UI-004: Payment Form Component
 * Record payment against a supplier bill.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import type { RecordPaymentDto, SupplierBill } from '@/hooks/use-suppliers';

const paymentFormSchema = z.object({
  amountCents: z.coerce.number().min(1, 'Amount must be greater than 0'),
  paymentDate: z.string().min(1, 'Payment date is required'),
  paymentMethod: z.enum(['EFT', 'CASH', 'CARD', 'CHEQUE']),
  reference: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

interface PaymentFormProps {
  bill: SupplierBill;
  onSubmit: (data: RecordPaymentDto) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PaymentForm({ bill, onSubmit, onCancel, isLoading }: PaymentFormProps) {
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amountCents: bill.balanceDueCents,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'EFT',
      reference: '',
    },
  });

  const handleSubmit = (data: PaymentFormValues) => {
    if (data.amountCents > bill.balanceDueCents) {
      form.setError('amountCents', {
        type: 'manual',
        message: `Payment cannot exceed balance due (${formatCurrency(bill.balanceDueCents / 100)})`,
      });
      return;
    }

    const dto: RecordPaymentDto = {
      amountCents: data.amountCents,
      paymentDate: data.paymentDate,
      paymentMethod: data.paymentMethod,
      reference: data.reference || undefined,
    };
    onSubmit(dto);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="bg-muted p-4 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span>Bill Number:</span>
            <span className="font-mono font-medium">{bill.billNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Bill Total:</span>
            <span className="font-mono">{formatCurrency(bill.totalCents / 100)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Already Paid:</span>
            <span className="font-mono">{formatCurrency(bill.paidCents / 100)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium border-t pt-2">
            <span>Balance Due:</span>
            <span className="font-mono text-red-600">
              {formatCurrency(bill.balanceDueCents / 100)}
            </span>
          </div>
        </div>

        <FormField
          control={form.control}
          name="amountCents"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Amount (cents) *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="number"
                  min={1}
                  max={bill.balanceDueCents}
                  placeholder="Enter amount in cents"
                />
              </FormControl>
              <FormDescription>
                Enter amount in cents. {formatCurrency(field.value / 100 || 0)} will be recorded.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="paymentDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Date *</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Method *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="EFT">EFT (Bank Transfer)</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="reference"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reference</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Payment reference or transaction ID" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Recording...' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
