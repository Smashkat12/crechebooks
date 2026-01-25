'use client';

/**
 * Address Inline Form
 * TASK-ACCT-014: Inline form for onboarding wizard
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant, useUpdateTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';

const addressSchema = z.object({
  addressLine1: z.string().min(1, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  province: z.string().min(1, 'Province is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
});

type AddressFormData = z.infer<typeof addressSchema>;

interface AddressFormProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function AddressForm({ onComplete, onCancel }: AddressFormProps) {
  const { toast } = useToast();
  const { data: tenant, isLoading: tenantLoading } = useTenant();
  const updateTenant = useUpdateTenant();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormData>({
    resolver: zodResolver(addressSchema),
  });

  // Pre-populate form with existing data
  useEffect(() => {
    if (tenant) {
      reset({
        addressLine1: tenant.addressLine1 || '',
        addressLine2: tenant.addressLine2 || '',
        city: tenant.city || '',
        province: tenant.province || '',
        postalCode: tenant.postalCode || '',
      });
    }
  }, [tenant, reset]);

  const onSubmit = async (data: AddressFormData) => {
    if (!tenant) return;

    try {
      await updateTenant.mutateAsync({
        tenantId: tenant.id,
        data,
      });
      toast({
        title: 'Address saved',
        description: 'Your address has been updated successfully.',
      });
      onComplete();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save address. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="addressLine1">Street Address *</Label>
          <Input
            id="addressLine1"
            {...register('addressLine1')}
            placeholder="e.g., 123 Main Road"
          />
          {errors.addressLine1 && (
            <p className="text-sm text-destructive">{errors.addressLine1.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="addressLine2">Address Line 2</Label>
          <Input
            id="addressLine2"
            {...register('addressLine2')}
            placeholder="Apartment, suite, unit, etc. (optional)"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              {...register('city')}
              placeholder="e.g., Johannesburg"
            />
            {errors.city && (
              <p className="text-sm text-destructive">{errors.city.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="province">Province *</Label>
            <Input
              id="province"
              {...register('province')}
              placeholder="e.g., Gauteng"
            />
            {errors.province && (
              <p className="text-sm text-destructive">{errors.province.message}</p>
            )}
          </div>
        </div>
        <div className="w-1/2 space-y-2">
          <Label htmlFor="postalCode">Postal Code *</Label>
          <Input
            id="postalCode"
            {...register('postalCode')}
            placeholder="e.g., 2000"
          />
          {errors.postalCode && (
            <p className="text-sm text-destructive">{errors.postalCode.message}</p>
          )}
        </div>
      </div>

      <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
        This address will appear on invoices and official documents.
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting || updateTenant.isPending}>
          {(isSubmitting || updateTenant.isPending) ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Save & Complete
            </>
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default AddressForm;
