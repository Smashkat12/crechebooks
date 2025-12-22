/**
 * Allocation Form Component
 *
 * Form for allocating payment to invoice(s), handling partial payments
 */

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/forms/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';

const allocationSchema = z.object({
  allocations: z.array(
    z.object({
      invoiceId: z.string().min(1, 'Invoice is required'),
      amount: z.number().positive('Amount must be positive'),
    })
  ).min(1, 'At least one allocation is required'),
});

type AllocationFormValues = z.infer<typeof allocationSchema>;

interface AllocationFormProps {
  paymentAmount: number;
  invoiceId?: string;
  invoiceAmount?: number;
  onSubmit: (data: AllocationFormValues) => void;
  isSubmitting?: boolean;
}

export function AllocationForm({
  paymentAmount,
  invoiceId,
  invoiceAmount,
  onSubmit,
  isSubmitting = false,
}: AllocationFormProps) {
  const form = useForm<AllocationFormValues>({
    resolver: zodResolver(allocationSchema),
    defaultValues: {
      allocations: invoiceId
        ? [
            {
              invoiceId,
              amount: Math.min(paymentAmount, invoiceAmount || paymentAmount),
            },
          ]
        : [],
    },
  });

  const allocations = form.watch('allocations');

  const totalAllocated = React.useMemo(() => {
    return allocations.reduce((sum, alloc) => sum + (alloc.amount || 0), 0);
  }, [allocations]);

  const remaining = paymentAmount - totalAllocated;

  const handleAddAllocation = () => {
    const currentAllocations = form.getValues('allocations');
    form.setValue('allocations', [
      ...currentAllocations,
      { invoiceId: '', amount: remaining > 0 ? remaining : 0 },
    ]);
  };

  const handleRemoveAllocation = (index: number) => {
    const currentAllocations = form.getValues('allocations');
    form.setValue(
      'allocations',
      currentAllocations.filter((_, i) => i !== index)
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Payment Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment Amount:</span>
              <span className="font-medium">{formatCurrency(paymentAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Allocated:</span>
              <span className="font-medium">{formatCurrency(totalAllocated)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining:</span>
              <span
                className={`font-medium ${
                  remaining < 0
                    ? 'text-destructive'
                    : remaining > 0
                    ? 'text-amber-600'
                    : 'text-green-600'
                }`}
              >
                {formatCurrency(Math.abs(remaining))}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Allocations */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Allocations</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddAllocation}
              disabled={remaining <= 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Allocation
            </Button>
          </div>

          {allocations.map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-4">
                    <FormField
                      control={form.control}
                      name={`allocations.${index}.invoiceId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice ID</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Enter invoice ID"
                              disabled={!!invoiceId && index === 0}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`allocations.${index}.amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              onChange={(e) =>
                                field.onChange(parseFloat(e.target.value) || 0)
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Enter the amount to allocate to this invoice
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {allocations.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAllocation(index)}
                      className="mt-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || remaining < 0}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Allocating...
            </>
          ) : (
            'Allocate Payment'
          )}
        </Button>

        {remaining < 0 && (
          <p className="text-sm text-destructive text-center">
            Total allocation exceeds payment amount
          </p>
        )}
      </form>
    </Form>
  );
}
