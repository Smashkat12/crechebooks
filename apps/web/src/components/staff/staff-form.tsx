'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/forms/form';
import { FormInput } from '@/components/forms/form-input';
import { FormSelect } from '@/components/forms/form-select';
import { DatePicker } from '@/components/forms/date-picker';
import { CurrencyInput } from '@/components/forms/currency-input';
import type { IStaff } from '@crechebooks/types';

// SA ID number validation using Luhn algorithm
function validateSAIdNumber(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;

  const digits = id.split('').map(Number);
  let sum = 0;

  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      sum += digits[i];
    } else {
      const doubled = digits[i] * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[12];
}

const staffSchema = z.object({
  employeeNumber: z.string().min(1, 'Employee number is required').max(20),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  idNumber: z.string()
    .length(13, 'SA ID must be 13 digits')
    .regex(/^\d{13}$/, 'ID must contain only digits')
    .refine(validateSAIdNumber, 'Invalid SA ID number'),
  taxNumber: z.string().regex(/^\d{10}$/, 'Tax number must be 10 digits').optional().or(z.literal('')),
  dateOfBirth: z.date({ required_error: 'Date of birth is required' }),
  startDate: z.date({ required_error: 'Start date is required' }),
  endDate: z.date().optional(),
  salary: z.number().min(1, 'Salary is required'),
  paymentMethod: z.enum(['EFT', 'CASH']),
  bankAccountNumber: z.string().max(20).optional(),
  bankBranchCode: z.string().length(6, 'Branch code must be 6 digits').optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']),
});

type StaffFormValues = z.infer<typeof staffSchema>;

interface StaffFormProps {
  staff?: IStaff;
  onSave: (data: StaffFormValues) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const paymentMethodOptions = [
  { value: 'EFT', label: 'Electronic Transfer (EFT)' },
  { value: 'CASH', label: 'Cash' },
];

const statusOptions = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'TERMINATED', label: 'Terminated' },
];

export function StaffForm({ staff, onSave, onCancel, isLoading = false }: StaffFormProps) {
  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      employeeNumber: staff?.employeeNumber ?? '',
      firstName: staff?.firstName ?? '',
      lastName: staff?.lastName ?? '',
      idNumber: staff?.idNumber ?? '',
      taxNumber: staff?.taxNumber ?? '',
      dateOfBirth: staff?.dateOfBirth ? new Date(staff.dateOfBirth) : undefined,
      startDate: staff?.startDate ? new Date(staff.startDate) : new Date(),
      endDate: staff?.endDate ? new Date(staff.endDate) : undefined,
      salary: staff?.salary ? staff.salary / 100 : 0,
      paymentMethod: staff?.paymentMethod ?? 'EFT',
      bankAccountNumber: staff?.bankAccountNumber ?? '',
      bankBranchCode: staff?.bankBranchCode ?? '',
      status: staff?.status ?? 'ACTIVE',
    },
  });

  const paymentMethod = form.watch('paymentMethod');

  const onSubmit = async (data: StaffFormValues) => {
    try {
      // Convert salary to cents before saving
      const formData = {
        ...data,
        salary: Math.round(data.salary * 100),
      };
      await onSave(formData);
      if (!staff) {
        form.reset();
      }
    } catch (error) {
      console.error('Failed to save staff:', error);
      throw error;
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormInput
            control={form.control}
            name="employeeNumber"
            label="Employee Number"
            placeholder="EMP001"
            required
          />
          <FormInput
            control={form.control}
            name="firstName"
            label="First Name"
            placeholder="Enter first name"
            required
          />
          <FormInput
            control={form.control}
            name="lastName"
            label="Last Name"
            placeholder="Enter last name"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            control={form.control}
            name="idNumber"
            label="SA ID Number"
            placeholder="8501015800088"
            description="13-digit South African ID number"
            required
          />
          <FormInput
            control={form.control}
            name="taxNumber"
            label="Tax Reference Number"
            placeholder="1234567890"
            description="10-digit SARS tax number"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DatePicker
            control={form.control}
            name="dateOfBirth"
            label="Date of Birth"
            mode="dob"
            required
          />
          <DatePicker
            control={form.control}
            name="startDate"
            label="Start Date"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CurrencyInput
            control={form.control}
            name="salary"
            label="Monthly Gross Salary"
            required
          />
          <FormSelect
            control={form.control}
            name="paymentMethod"
            label="Payment Method"
            options={paymentMethodOptions}
            required
          />
        </div>

        {paymentMethod === 'EFT' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormInput
              control={form.control}
              name="bankAccountNumber"
              label="Bank Account Number"
              placeholder="Enter account number"
            />
            <FormInput
              control={form.control}
              name="bankBranchCode"
              label="Branch Code"
              placeholder="250655"
            />
          </div>
        )}

        <FormSelect
          control={form.control}
          name="status"
          label="Employment Status"
          options={statusOptions}
          required
        />

        {staff && (
          <DatePicker
            control={form.control}
            name="endDate"
            label="End Date (if terminated)"
          />
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : staff ? 'Update Staff' : 'Add Staff'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
