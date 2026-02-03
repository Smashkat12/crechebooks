'use client';

/**
 * TASK-ACCT-UI-004: Supplier Form Component
 * Create and edit forms for supplier management.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import type { Supplier, CreateSupplierDto } from '@/hooks/use-suppliers';
import type { Account } from '@/hooks/use-accounts';

const supplierFormSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').max(200),
  tradingName: z.string().max(200).optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  address: z.string().optional(),
  vatNumber: z.string().max(20).optional(),
  registrationNumber: z.string().max(50).optional(),
  paymentTermsDays: z.coerce.number().min(0).default(30),
  bankName: z.string().max(100).optional(),
  branchCode: z.string().max(20).optional(),
  accountNumber: z.string().max(50).optional(),
  accountType: z.enum(['CHEQUE', 'SAVINGS', 'CURRENT', '']).optional(),
  defaultAccountId: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

// Use discriminated union for proper type inference
interface CreateSupplierFormProps {
  supplier?: undefined;
  accounts?: Account[];
  onSubmit: (data: CreateSupplierDto) => void;
  isLoading?: boolean;
  mode: 'create';
}

interface EditSupplierFormProps {
  supplier: Supplier;
  accounts?: Account[];
  onSubmit: (data: Partial<CreateSupplierDto>) => void;
  isLoading?: boolean;
  mode: 'edit';
}

type SupplierFormProps = CreateSupplierFormProps | EditSupplierFormProps;

export function SupplierForm(props: SupplierFormProps) {
  const { accounts, onSubmit, isLoading, mode } = props;
  const supplier = mode === 'edit' ? props.supplier : undefined;

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: supplier?.name || '',
      tradingName: supplier?.tradingName || '',
      email: supplier?.email || '',
      phone: supplier?.phone || '',
      address: supplier?.address || '',
      vatNumber: supplier?.vatNumber || '',
      registrationNumber: supplier?.registrationNumber || '',
      paymentTermsDays: supplier?.paymentTermsDays ?? 30,
      bankName: supplier?.bankName || '',
      branchCode: supplier?.branchCode || '',
      accountNumber: supplier?.accountNumber || '',
      accountType: (supplier?.accountType as 'CHEQUE' | 'SAVINGS' | 'CURRENT' | '') || '',
      defaultAccountId: supplier?.defaultAccountId || '',
    },
  });

  // Filter expense accounts for default account selection
  const expenseAccounts = accounts?.filter((a) => a.type === 'EXPENSE' && a.isActive) || [];

  const handleSubmit = (data: SupplierFormValues) => {
    // Clean empty strings to undefined
    const cleanData: CreateSupplierDto = {
      name: data.name,
      tradingName: data.tradingName || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      address: data.address || undefined,
      vatNumber: data.vatNumber || undefined,
      registrationNumber: data.registrationNumber || undefined,
      paymentTermsDays: data.paymentTermsDays,
      bankName: data.bankName || undefined,
      branchCode: data.branchCode || undefined,
      accountNumber: data.accountNumber || undefined,
      accountType: data.accountType || undefined,
      defaultAccountId: data.defaultAccountId || undefined,
    };

    if (mode === 'create') {
      (onSubmit as (data: CreateSupplierDto) => void)(cleanData);
    } else {
      (onSubmit as (data: Partial<CreateSupplierDto>) => void)(cleanData);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Legal Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ABC Supplies (Pty) Ltd" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tradingName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trading Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ABC Supplies" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="accounts@supplier.co.za" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="011 123 4567" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="123 Main Street, Johannesburg, 2000" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vatNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VAT Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="4123456789" />
                    </FormControl>
                    <FormDescription>10-digit VAT registration number</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="registrationNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Registration</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="2020/123456/07" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Payment Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="paymentTermsDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Terms (Days)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} />
                    </FormControl>
                    <FormDescription>Number of days until payment is due</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Expense Account</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {expenseAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Default account for bills from this supplier</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Bank Details */}
        <Card>
          <CardHeader>
            <CardTitle>Bank Details (for EFT Payments)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Standard Bank" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="branchCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch Code</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="051001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="1234567890" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        <SelectItem value="CHEQUE">Cheque</SelectItem>
                        <SelectItem value="SAVINGS">Savings</SelectItem>
                        <SelectItem value="CURRENT">Current</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : mode === 'create' ? 'Create Supplier' : 'Update Supplier'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
