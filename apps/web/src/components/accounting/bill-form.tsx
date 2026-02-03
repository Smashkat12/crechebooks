'use client';

/**
 * TASK-ACCT-UI-004: Bill Form Component
 * Create bill form with line items and VAT calculation.
 */

import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import type { CreateBillDto } from '@/hooks/use-suppliers';
import type { Account } from '@/hooks/use-accounts';

const billLineSchema = z.object({
  description: z.string().min(1, 'Description required'),
  quantity: z.coerce.number().min(0.01, 'Quantity must be positive').default(1),
  unitPriceCents: z.coerce.number().min(0, 'Price must be non-negative'),
  vatType: z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT']).default('STANDARD'),
  accountId: z.string().optional(),
});

const billFormSchema = z.object({
  billNumber: z.string().min(1, 'Bill number is required'),
  billDate: z.string().min(1, 'Bill date is required'),
  dueDate: z.string().optional(),
  purchaseOrderRef: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(billLineSchema).min(1, 'At least one line item required'),
});

type BillFormValues = z.infer<typeof billFormSchema>;

interface BillFormProps {
  accounts?: Account[];
  defaultAccountId?: string | null;
  onSubmit: (data: CreateBillDto) => void;
  isLoading?: boolean;
}

const VAT_RATE = 0.15; // 15% VAT

export function BillForm({ accounts, defaultAccountId, onSubmit, isLoading }: BillFormProps) {
  const form = useForm<BillFormValues>({
    resolver: zodResolver(billFormSchema),
    defaultValues: {
      billNumber: '',
      billDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      purchaseOrderRef: '',
      notes: '',
      lines: [
        {
          description: '',
          quantity: 1,
          unitPriceCents: 0,
          vatType: 'STANDARD',
          accountId: defaultAccountId || '',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const lines = form.watch('lines');
  const expenseAccounts = accounts?.filter((a) => a.type === 'EXPENSE' && a.isActive) || [];

  // Calculate totals
  const subtotalCents = lines.reduce((sum, line) => {
    return sum + (line.unitPriceCents || 0) * (line.quantity || 1);
  }, 0);

  const vatCents = lines.reduce((sum, line) => {
    const lineTotal = (line.unitPriceCents || 0) * (line.quantity || 1);
    if (line.vatType === 'STANDARD') {
      return sum + Math.round(lineTotal * VAT_RATE);
    }
    return sum;
  }, 0);

  const totalCents = subtotalCents + vatCents;

  const handleSubmit = (data: BillFormValues) => {
    const createDto: CreateBillDto = {
      billNumber: data.billNumber,
      billDate: data.billDate,
      dueDate: data.dueDate || undefined,
      purchaseOrderRef: data.purchaseOrderRef || undefined,
      notes: data.notes || undefined,
      lines: data.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        vatType: line.vatType,
        accountId: line.accountId || undefined,
      })),
    };
    onSubmit(createDto);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormField
            control={form.control}
            name="billNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bill Number *</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="INV-001" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="billDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bill Date *</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due Date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="purchaseOrderRef"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PO Reference</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="PO-001" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Line Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Line Items</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  description: '',
                  quantity: 1,
                  unitPriceCents: 0,
                  vatType: 'STANDARD',
                  accountId: defaultAccountId || '',
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-32">Unit Price (c)</TableHead>
                  <TableHead className="w-32">VAT Type</TableHead>
                  <TableHead className="w-48">Account</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const lineTotal = (lines[index]?.unitPriceCents || 0) * (lines[index]?.quantity || 1);
                  return (
                    <TableRow key={field.id}>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`lines.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input {...field} placeholder="Item description" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`lines.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input {...field} type="number" min={0.01} step={0.01} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`lines.${index}.unitPriceCents`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input {...field} type="number" min={0} placeholder="0" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`lines.${index}.vatType`}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="STANDARD">15% VAT</SelectItem>
                                <SelectItem value="ZERO_RATED">0% (Zero)</SelectItem>
                                <SelectItem value="EXEMPT">Exempt</SelectItem>
                                <SelectItem value="NO_VAT">No VAT</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`lines.${index}.accountId`}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">None</SelectItem>
                                {expenseAccounts.map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(lineTotal / 100)}
                      </TableCell>
                      <TableCell>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-right">
                    Subtotal
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(subtotalCents / 100)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} className="text-right">
                    VAT (15%)
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(vatCents / 100)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} className="text-right font-bold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {formatCurrency(totalCents / 100)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Additional notes..." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Bill'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
