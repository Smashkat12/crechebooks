'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/forms/form';
import { FormInput } from '@/components/forms/form-input';
import { FormSelect } from '@/components/forms/form-select';
import { FormCheckbox } from '@/components/forms/form-checkbox';
import type { IParent } from '@crechebooks/types';

const SA_PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/;

const parentSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(SA_PHONE_REGEX, 'Invalid SA phone number (e.g., 0821234567)').optional().or(z.literal('')),
  whatsappNumber: z.string().regex(SA_PHONE_REGEX, 'Invalid SA WhatsApp number').optional().or(z.literal('')),
  address: z.string().max(255).optional(),
  preferredCommunication: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'BOTH']),
  /** TASK-WA-004: WhatsApp opt-in consent (POPIA compliant) */
  whatsappOptIn: z.boolean().default(false),
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
  { value: 'SMS', label: 'SMS Only' },
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
      whatsappNumber: parent?.whatsapp ?? '',
      address: parent?.address ?? '',
      preferredCommunication: parent?.preferredContact ?? 'EMAIL',
      // TASK-WA-004: WhatsApp opt-in from parent record
      whatsappOptIn: (parent as unknown as { whatsappOptIn?: boolean })?.whatsappOptIn ?? false,
    },
  });

  // Watch whatsappNumber for conditional rendering
  const whatsappNumber = useWatch({ control: form.control, name: 'whatsappNumber' });
  const whatsappOptIn = useWatch({ control: form.control, name: 'whatsappOptIn' });

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

        {/* TASK-WA-004: WhatsApp Opt-In Consent Section */}
        <Card className="bg-muted/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-green-600" />
              WhatsApp Notifications
            </CardTitle>
            <CardDescription className="text-sm">
              Receive invoices, statements, and payment reminders via WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormCheckbox
              control={form.control}
              name="whatsappOptIn"
              label="I consent to receive WhatsApp messages"
              description="By checking this box, I agree to receive invoices, monthly statements, and payment reminders via WhatsApp. I understand I can withdraw this consent at any time. This consent is required under the Protection of Personal Information Act (POPIA)."
              disabled={!whatsappNumber}
            />
            {!whatsappNumber && (
              <p className="text-sm text-amber-600">
                Please enter a WhatsApp number above to enable WhatsApp notifications.
              </p>
            )}
            {whatsappOptIn && whatsappNumber && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <MessageSquare className="h-4 w-4" />
                WhatsApp notifications will be enabled for {whatsappNumber}
              </div>
            )}
          </CardContent>
        </Card>

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
