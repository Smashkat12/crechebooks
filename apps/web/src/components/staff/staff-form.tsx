'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/forms/form';
import { FormInput } from '@/components/forms/form-input';
import { FormSelect } from '@/components/forms/form-select';
import { DatePicker } from '@/components/forms/date-picker';
import { CurrencyInput } from '@/components/forms/currency-input';
import { Info } from 'lucide-react';
import type { IStaff } from '@crechebooks/types';
import { extractDobFromSaId } from '@/lib/utils/constants';

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
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('A valid email is required for staff portal access'),
  phone: z.string().max(20).optional().or(z.literal('')),
  idNumber: z.string()
    .length(13, 'SA ID must be 13 digits')
    .regex(/^\d{13}$/, 'ID must contain only digits')
    .refine(validateSAIdNumber, 'Invalid SA ID number'),
  dateOfBirth: z.date({ required_error: 'Date of birth is required' }),
  startDate: z.date({ required_error: 'Start date is required' }),
  endDate: z.date().optional(),
  // Employment details
  position: z.string().min(1, 'Position is required').max(100),
  department: z.string().max(100).optional().or(z.literal('')),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'PART_TIME']),
  payFrequency: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY']),
  // Compensation
  salary: z.number().min(1, 'Salary is required'),
});

type StaffFormValues = z.infer<typeof staffSchema>;

interface StaffFormProps {
  staff?: IStaff;
  onSave: (data: StaffFormValues) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

// Common position options for creches
const positionOptions = [
  { value: 'Principal', label: 'Principal' },
  { value: 'Teacher', label: 'Teacher' },
  { value: 'Assistant Teacher', label: 'Assistant Teacher' },
  { value: 'Cook', label: 'Cook' },
  { value: 'Cleaner', label: 'Cleaner' },
  { value: 'Administrator', label: 'Administrator' },
  { value: 'Driver', label: 'Driver' },
  { value: 'Security', label: 'Security' },
  { value: 'Other', label: 'Other' },
];

const departmentOptions = [
  { value: 'Management', label: 'Management' },
  { value: 'Teaching', label: 'Teaching' },
  { value: 'Kitchen', label: 'Kitchen' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Administration', label: 'Administration' },
  { value: 'Transport', label: 'Transport' },
];

const employmentTypeOptions = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'PART_TIME', label: 'Part-Time' },
];

const payFrequencyOptions = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'WEEKLY', label: 'Weekly' },
];

export function StaffForm({ staff, onSave, onCancel, isLoading = false }: StaffFormProps) {
  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      firstName: staff?.firstName ?? '',
      lastName: staff?.lastName ?? '',
      email: staff?.email ?? '',
      phone: staff?.phone ?? '',
      idNumber: staff?.idNumber ?? '',
      dateOfBirth: staff?.dateOfBirth ? new Date(staff.dateOfBirth) : undefined,
      startDate: staff?.startDate ? new Date(staff.startDate) : new Date(),
      endDate: staff?.endDate ? new Date(staff.endDate) : undefined,
      position: staff?.position ?? '',
      department: staff?.department ?? '',
      employmentType: (staff?.employmentType as 'PERMANENT' | 'CONTRACT' | 'PART_TIME') ?? 'PERMANENT',
      payFrequency: (staff?.payFrequency as 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY') ?? 'MONTHLY',
      salary: staff?.salary ? staff.salary / 100 : 0,
    },
  });

  // Auto-populate date of birth from SA ID number
  const watchedIdNumber = form.watch('idNumber');
  useEffect(() => {
    if (!watchedIdNumber || watchedIdNumber.length < 6) return;
    const dob = extractDobFromSaId(watchedIdNumber);
    if (dob) {
      form.setValue('dateOfBirth', dob, { shouldValidate: true });
    }
  }, [watchedIdNumber]);

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
        {/* Auto-generation info banner (only for new staff) */}
        {!staff && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Employee number will be auto-generated</p>
                <p className="mt-1">
                  Staff will receive an email to complete their own onboarding (banking details, tax info, documents, and signatures) via the Staff Portal.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Personal Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Personal Information</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              name="email"
              label="Email Address"
              placeholder="name@example.com"
              description="Required — staff will use this to access the Staff Portal"
              required
            />
            <FormInput
              control={form.control}
              name="phone"
              label="Phone Number"
              placeholder="+27..."
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
            <DatePicker
              control={form.control}
              name="dateOfBirth"
              label="Date of Birth"
              description="Auto-filled from ID number"
              mode="dob"
              required
            />
          </div>
        </div>

        {/* Employment Details */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-lg font-medium">Employment Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormSelect
              control={form.control}
              name="position"
              label="Position/Job Title"
              options={positionOptions}
              placeholder="Select position"
              required
            />
            <FormSelect
              control={form.control}
              name="department"
              label="Department"
              options={departmentOptions}
              placeholder="Select department"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormSelect
              control={form.control}
              name="employmentType"
              label="Employment Type"
              options={employmentTypeOptions}
              required
            />
            <FormSelect
              control={form.control}
              name="payFrequency"
              label="Pay Frequency"
              options={payFrequencyOptions}
              required
            />
            <DatePicker
              control={form.control}
              name="startDate"
              label="Start Date"
              required
            />
          </div>
        </div>

        {/* Compensation */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-lg font-medium">Compensation</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CurrencyInput
              control={form.control}
              name="salary"
              label="Monthly Gross Salary"
              required
            />
          </div>
        </div>

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
