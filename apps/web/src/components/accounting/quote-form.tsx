'use client';

/**
 * TASK-ACCT-UI-005: Quote Form Component
 * Form for creating and editing quotes.
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Quote, CreateQuoteDto } from '@/hooks/use-quotes';
import type { FeeStructure } from '@/hooks/use-fee-structures';

const quoteLineSchema = z.object({
  description: z.string().min(1, 'Description required'),
  quantity: z.coerce.number().min(1).default(1),
  unitPriceCents: z.coerce.number().min(0, 'Amount must be positive'),
  vatType: z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT']).default('EXEMPT'),
  feeStructureId: z.string().optional(),
});

const quoteFormSchema = z.object({
  recipientName: z.string().min(1, 'Recipient name is required'),
  recipientEmail: z.string().email('Valid email required'),
  recipientPhone: z.string().optional(),
  childName: z.string().optional(),
  childDob: z.string().optional(),
  expectedStartDate: z.string().optional(),
  validityDays: z.coerce.number().min(1, 'Must be at least 1 day').default(30),
  notes: z.string().optional(),
  lines: z.array(quoteLineSchema).min(1, 'At least one line item required'),
});

type QuoteFormValues = z.infer<typeof quoteFormSchema>;

interface QuoteFormProps {
  quote?: Quote;
  feeStructures?: FeeStructure[];
  onSubmit: (data: CreateQuoteDto) => void;
  isLoading?: boolean;
  mode: 'create' | 'edit';
}

export function QuoteForm({ quote, feeStructures, onSubmit, isLoading, mode }: QuoteFormProps) {
  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      recipientName: quote?.recipientName || '',
      recipientEmail: quote?.recipientEmail || '',
      recipientPhone: quote?.recipientPhone || '',
      childName: quote?.childName || '',
      childDob: quote?.childDob ? new Date(quote.childDob).toISOString().split('T')[0] : '',
      expectedStartDate: quote?.expectedStartDate
        ? new Date(quote.expectedStartDate).toISOString().split('T')[0]
        : '',
      validityDays: quote?.validityDays || 30,
      notes: quote?.notes || '',
      lines: quote?.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        vatType: l.vatType as 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT',
        feeStructureId: l.feeStructureId || undefined,
      })) || [{ description: '', quantity: 1, unitPriceCents: 0, vatType: 'EXEMPT' as const }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const lines = form.watch('lines');

  // Add fee structure as line
  const addFeeStructure = (fs: FeeStructure) => {
    append({
      description: fs.name + (fs.description ? ` - ${fs.description}` : ''),
      quantity: 1,
      unitPriceCents: fs.amount_cents,
      vatType: 'EXEMPT', // Education services are VAT exempt
      feeStructureId: fs.id,
    });
  };

  // Calculate totals (education services are VAT exempt)
  const subtotalCents = lines.reduce((sum, line) => {
    return sum + (line.unitPriceCents || 0) * (line.quantity || 1);
  }, 0);

  const vatCents = lines.reduce((sum, line) => {
    const lineTotal = (line.unitPriceCents || 0) * (line.quantity || 1);
    if (line.vatType === 'STANDARD') {
      return sum + Math.round(lineTotal * 0.15);
    }
    return sum;
  }, 0);

  const totalCents = subtotalCents + vatCents;

  const handleSubmit = (data: QuoteFormValues) => {
    const dto: CreateQuoteDto = {
      recipientName: data.recipientName,
      recipientEmail: data.recipientEmail,
      recipientPhone: data.recipientPhone || undefined,
      childName: data.childName || undefined,
      childDob: data.childDob || undefined,
      expectedStartDate: data.expectedStartDate || undefined,
      validityDays: data.validityDays,
      notes: data.notes || undefined,
      lines: data.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        vatType: line.vatType,
        feeStructureId: line.feeStructureId || undefined,
      })),
    };
    onSubmit(dto);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Recipient Information */}
        <Card>
          <CardHeader>
            <CardTitle>Recipient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="recipientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Parent name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="recipientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="parent@email.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="recipientPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="082 123 4567" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Child Information */}
        <Card>
          <CardHeader>
            <CardTitle>Child Information (Optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="childName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Child Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Child's name" />
                    </FormControl>
                    <FormDescription>For enrollment tracking</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="childDob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expectedStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Start Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quote Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Quote Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="validityDays"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Valid For (Days)</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} />
                  </FormControl>
                  <FormDescription>Quote expires after this many days</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle>Fee Breakdown</CardTitle>
              <div className="flex flex-wrap gap-2">
                {feeStructures && feeStructures.length > 0 && (
                  <Select
                    onValueChange={(id) => {
                      const fs = feeStructures.find((f) => f.id === id);
                      if (fs) addFeeStructure(fs);
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Add fee structure" />
                    </SelectTrigger>
                    <SelectContent>
                      {feeStructures
                        .filter((fs) => fs.is_active)
                        .map((fs) => (
                          <SelectItem key={fs.id} value={fs.id}>
                            {fs.name} ({formatCurrency(fs.amount_cents / 100)})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({
                      description: '',
                      quantity: 1,
                      unitPriceCents: 0,
                      vatType: 'EXEMPT',
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[250px]">Description</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-32">Amount (R)</TableHead>
                    <TableHead className="w-36">VAT Type</TableHead>
                    <TableHead className="w-32 text-right">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const lineTotal = (lines[index]?.unitPriceCents || 0) * (lines[index]?.quantity || 1);
                    const lineVat =
                      lines[index]?.vatType === 'STANDARD' ? Math.round(lineTotal * 0.15) : 0;
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
                                  <Input {...field} type="number" min={1} className="w-20" />
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
                                  <Input
                                    type="number"
                                    min={0}
                                    step="100"
                                    className="w-28"
                                    placeholder="0"
                                    value={field.value ? (field.value / 100).toFixed(2) : ''}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value) || 0;
                                      field.onChange(Math.round(value * 100));
                                    }}
                                  />
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
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="EXEMPT">Exempt</SelectItem>
                                  <SelectItem value="STANDARD">15% VAT</SelectItem>
                                  <SelectItem value="ZERO_RATED">0% (Zero)</SelectItem>
                                  <SelectItem value="NO_VAT">No VAT</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency((lineTotal + lineVat) / 100)}
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
                    <TableCell colSpan={4} className="text-right">
                      Subtotal
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(subtotalCents / 100)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  {vatCents > 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-right">
                        VAT (15%)
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(vatCents / 100)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold">
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
            {form.formState.errors.lines?.root && (
              <p className="text-sm text-destructive mt-2">
                {form.formState.errors.lines.root.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Enter terms, conditions, and additional notes..."
                      rows={4}
                    />
                  </FormControl>
                  <FormDescription>
                    These notes will appear on the quote sent to the recipient.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : mode === 'create' ? 'Create Quote' : 'Update Quote'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
