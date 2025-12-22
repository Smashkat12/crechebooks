'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/forms/form';
import { FormInput } from '@/components/forms/form-input';
import { FormSelect } from '@/components/forms/form-select';
import type { IParent } from '@crechebooks/types';

const SA_PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/;

const parentSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(SA_PHONE_REGEX, 'Invalid SA phone number (e.g., 0821234567)').optional().or(z.literal('')),
  whatsappNumber: z.string().regex(SA_PHONE_REGEX, 'Invalid SA WhatsApp number').optional().or(z.literal('')),
  address: z.string().max(255).optional(),
  preferredCommunication: z.enum(['EMAIL', 'WHATSAPP', 'BOTH']),
});

type ParentFormValues = z.infer<typeof parentSchema>;

interface ParentFormProps {
  parent?: IParent;
  onSave: (data: ParentFormValues) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const communicationOptions = [
  { value: 'EMAIL', label: 'Email Only' },
  { value: 'WHATSAPP', label: 'WhatsApp Only' },
  { value: 'BOTH', label: 'Email and WhatsApp' },
];

export function ParentForm({ parent, onSave, onCancel, isLoading = false }: ParentFormProps) {
  const form = useForm<ParentFormValues>({
    resolver: zodResolver(parentSchema),
    defaultValues: {
      firstName: parent?.firstName ?? '',
      lastName: parent?.lastName ?? '',
      email: parent?.email ?? '',
      phone: parent?.phone ?? '',
      whatsappNumber: parent?.whatsappNumber ?? '',
      address: parent?.address ?? '',
      preferredCommunication: parent?.preferredCommunication ?? 'EMAIL',
    },
  });

  const onSubmit = async (data: ParentFormValues) => {
    try {
      await onSave(data);
      if (!parent) {
        form.reset();
      }
    } catch (error) {
      console.error('Failed to save parent:', error);
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

        <FormInput
          control={form.control}
          name="email"
          label="Email Address"
          type="email"
          placeholder="parent@example.com"
          required
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            control={form.control}
            name="phone"
            label="Phone Number"
            placeholder="0821234567"
            description="South African mobile number"
          />
          <FormInput
            control={form.control}
            name="whatsappNumber"
            label="WhatsApp Number"
            placeholder="0821234567"
            description="For invoice notifications"
          />
        </div>

        <FormInput
          control={form.control}
          name="address"
          label="Address"
          placeholder="Full residential address"
        />

        <FormSelect
          control={form.control}
          name="preferredCommunication"
          label="Preferred Communication"
          options={communicationOptions}
          required
        />

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : parent ? 'Update Parent' : 'Add Parent'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
