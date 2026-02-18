'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Form } from '@/components/forms/form';
import { FormInput } from '@/components/forms/form-input';
import { FormSelect } from '@/components/forms/form-select';
import { DatePicker } from '@/components/forms/date-picker';
import { FeeStructureSelect } from './fee-structure-select';
import { ProrataDisplay } from './prorata-display';
import type { IChild, IFeeStructure } from '@crechebooks/types';

const childSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  dateOfBirth: z.date({ required_error: 'Date of birth is required' }),
  enrollmentDate: z.date({ required_error: 'Enrollment date is required' }),
  exitDate: z.date().optional(),
  feeStructureId: z.string().min(1, 'Fee structure is required'),
  status: z.enum(['ACTIVE', 'PENDING', 'WITHDRAWN', 'GRADUATED']),
  notes: z.string().max(500).optional(),
});

type ChildFormValues = z.infer<typeof childSchema>;

interface ChildFormProps {
  parentId: string;
  child?: IChild;
  feeStructures?: IFeeStructure[];
  onSave: (data: ChildFormValues & { parentId: string }) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const statusOptions = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
  { value: 'GRADUATED', label: 'Graduated' },
];

export function ChildForm({
  parentId,
  child,
  feeStructures = [],
  onSave,
  onCancel,
  isLoading = false
}: ChildFormProps) {
  const [selectedFeeStructure, setSelectedFeeStructure] = useState<IFeeStructure | null>(null);

  const form = useForm<ChildFormValues>({
    resolver: zodResolver(childSchema),
    defaultValues: {
      firstName: child?.firstName ?? '',
      lastName: child?.lastName ?? '',
      dateOfBirth: child?.dateOfBirth ? new Date(child.dateOfBirth) : undefined,
      enrollmentDate: child?.enrollmentDate ? new Date(child.enrollmentDate) : new Date(),
      exitDate: child?.exitDate ? new Date(child.exitDate) : undefined,
      feeStructureId: child?.feeStructureId ?? '',
      status: child?.status ?? 'PENDING',
      notes: child?.notes ?? '',
    },
  });

  const enrollmentDate = form.watch('enrollmentDate');
  const feeStructureId = form.watch('feeStructureId');

  useEffect(() => {
    if (feeStructureId && feeStructures.length > 0) {
      const structure = feeStructures.find(fs => fs.id === feeStructureId);
      setSelectedFeeStructure(structure ?? null);
    }
  }, [feeStructureId, feeStructures]);

  const onSubmit = async (data: ChildFormValues) => {
    try {
      await onSave({ ...data, parentId });
      if (!child) {
        form.reset();
      }
    } catch (error) {
      console.error('Failed to save child:', error);
      throw error;
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
          <DatePicker
            control={form.control}
            name="dateOfBirth"
            label="Date of Birth"
            required
          />
          <DatePicker
            control={form.control}
            name="enrollmentDate"
            label="Enrollment Date"
            required
          />
        </div>

        <FeeStructureSelect
          control={form.control}
          name="feeStructureId"
          label="Fee Structure"
          feeStructures={feeStructures}
          required
        />

        {selectedFeeStructure && enrollmentDate && (
          <ProrataDisplay
            feeStructure={selectedFeeStructure}
            enrollmentDate={enrollmentDate}
          />
        )}

        <FormSelect
          control={form.control}
          name="status"
          label="Enrollment Status"
          options={statusOptions}
          required
        />

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Any additional notes about this child..."
            {...form.register('notes')}
            className="min-h-[80px]"
          />
        </div>

        {child && (
          <DatePicker
            control={form.control}
            name="exitDate"
            label="Exit Date (if applicable)"
          />
        )}

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : child ? 'Update Child' : 'Add Child'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
