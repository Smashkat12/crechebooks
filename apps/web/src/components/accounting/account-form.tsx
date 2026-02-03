'use client';

/**
 * TASK-ACCT-UI-001: Account Form Component
 * Create and edit forms for chart of accounts.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { Account, AccountType, AccountSubType, CreateAccountDto, UpdateAccountDto } from '@/hooks/use-accounts';

const accountFormSchema = z.object({
  code: z.string().min(1, 'Account code is required').max(20, 'Account code must be 20 characters or less'),
  name: z.string().min(1, 'Account name is required').max(200, 'Account name must be 200 characters or less'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  subType: z.string().optional(),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  parentId: z.string().optional(),
  isEducationExempt: z.boolean().default(false),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

// Use discriminated union for proper type inference
interface CreateAccountFormProps {
  account?: undefined;
  accounts?: Account[];
  onSubmit: (data: CreateAccountDto) => void;
  isLoading?: boolean;
  mode: 'create';
}

interface EditAccountFormProps {
  account: Account;
  accounts?: Account[];
  onSubmit: (data: UpdateAccountDto) => void;
  isLoading?: boolean;
  mode: 'edit';
}

type AccountFormProps = CreateAccountFormProps | EditAccountFormProps;

const ACCOUNT_SUB_TYPES: Record<AccountType, { value: AccountSubType; label: string }[]> = {
  ASSET: [
    { value: 'BANK', label: 'Bank' },
    { value: 'CURRENT_ASSET', label: 'Current Asset' },
    { value: 'FIXED_ASSET', label: 'Fixed Asset' },
  ],
  LIABILITY: [
    { value: 'CURRENT_LIABILITY', label: 'Current Liability' },
    { value: 'LONG_TERM_LIABILITY', label: 'Long-term Liability' },
  ],
  EQUITY: [{ value: 'EQUITY', label: 'Equity' }],
  REVENUE: [
    { value: 'OPERATING_REVENUE', label: 'Operating Revenue' },
    { value: 'OTHER_REVENUE', label: 'Other Revenue' },
  ],
  EXPENSE: [
    { value: 'COST_OF_SALES', label: 'Cost of Sales' },
    { value: 'OPERATING_EXPENSE', label: 'Operating Expense' },
    { value: 'OTHER_EXPENSE', label: 'Other Expense' },
  ],
};

export function AccountForm(props: AccountFormProps) {
  const { accounts, onSubmit, isLoading, mode } = props;
  const account = mode === 'edit' ? props.account : undefined;

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      code: account?.code || '',
      name: account?.name || '',
      type: account?.type || 'EXPENSE',
      subType: account?.subType || undefined,
      description: account?.description || '',
      parentId: account?.parentId || undefined,
      isEducationExempt: account?.isEducationExempt || false,
    },
  });

  const selectedType = form.watch('type');
  const availableSubTypes = ACCOUNT_SUB_TYPES[selectedType] || [];
  const availableParents = accounts?.filter(
    (a) => a.type === selectedType && a.id !== account?.id && a.isActive
  ) || [];

  const handleSubmit = (data: AccountFormValues) => {
    if (mode === 'create') {
      const createData: CreateAccountDto = {
        code: data.code,
        name: data.name,
        type: data.type,
        subType: data.subType as AccountSubType | undefined,
        description: data.description,
        parentId: data.parentId || undefined,
        isEducationExempt: data.isEducationExempt,
      };
      (onSubmit as (data: CreateAccountDto) => void)(createData);
    } else {
      const updateData: UpdateAccountDto = {
        name: data.name,
        subType: data.subType as AccountSubType | undefined,
        description: data.description,
        parentId: data.parentId || undefined,
        isEducationExempt: data.isEducationExempt,
      };
      (onSubmit as (data: UpdateAccountDto) => void)(updateData);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Code</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="e.g., 4000"
                    disabled={mode === 'edit'}
                    className="font-mono"
                  />
                </FormControl>
                <FormDescription>Unique code for this account (e.g., 1000, 4100)</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., Tuition Fees" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={mode === 'edit'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ASSET">Asset</SelectItem>
                    <SelectItem value="LIABILITY">Liability</SelectItem>
                    <SelectItem value="EQUITY">Equity</SelectItem>
                    <SelectItem value="REVENUE">Revenue</SelectItem>
                    <SelectItem value="EXPENSE">Expense</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="subType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sub Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sub type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {availableSubTypes.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {availableParents.length > 0 && (
          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Parent Account (Optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select parent account" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {availableParents.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.code} - {parent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Group this account under a parent</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Describe this account's purpose"
                  className="resize-none"
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedType === 'REVENUE' && (
          <FormField
            control={form.control}
            name="isEducationExempt"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-emerald-50/50">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>VAT Exempt (Section 12(h))</FormLabel>
                  <FormDescription>
                    Education services are exempt from VAT under SARS Section 12(h).
                    Enable for tuition, registration, and educational fees.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        )}

        <div className="flex justify-end gap-4 pt-4">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : mode === 'create' ? 'Create Account' : 'Update Account'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
