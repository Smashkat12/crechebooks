'use client';

/**
 * VAT Configuration Inline Form
 * TASK-ACCT-014: Inline form for onboarding wizard
 */

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenant, useUpdateTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';

const vatConfigSchema = z.object({
  taxStatus: z.enum(['VAT_REGISTERED', 'NOT_REGISTERED']),
  vatNumber: z.string().optional(),
});

type VatConfigFormData = z.infer<typeof vatConfigSchema>;

interface VatConfigFormProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function VatConfigForm({ onComplete, onCancel }: VatConfigFormProps) {
  const { toast } = useToast();
  const { data: tenant, isLoading: tenantLoading } = useTenant();
  const updateTenant = useUpdateTenant();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<VatConfigFormData>({
    resolver: zodResolver(vatConfigSchema),
    defaultValues: {
      taxStatus: 'NOT_REGISTERED',
    },
  });

  const taxStatus = watch('taxStatus');

  // Pre-populate form with existing data
  useEffect(() => {
    if (tenant) {
      reset({
        taxStatus: tenant.taxStatus || 'NOT_REGISTERED',
        vatNumber: tenant.vatNumber || '',
      });
    }
  }, [tenant, reset]);

  const onSubmit = async (data: VatConfigFormData) => {
    if (!tenant) return;

    // Clear VAT number if not registered
    const submitData = {
      ...data,
      vatNumber: data.taxStatus === 'VAT_REGISTERED' ? data.vatNumber : undefined,
    };

    try {
      await updateTenant.mutateAsync({
        tenantId: tenant.id,
        data: submitData,
      });
      toast({
        title: 'VAT configuration saved',
        description: 'Your VAT settings have been updated successfully.',
      });
      onComplete();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save VAT configuration. Please try again.',
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
          <Label htmlFor="taxStatus">VAT Registration Status *</Label>
          <Controller
            name="taxStatus"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Select VAT status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_REGISTERED">Not VAT Registered</SelectItem>
                  <SelectItem value="VAT_REGISTERED">VAT Registered</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.taxStatus && (
            <p className="text-sm text-destructive">{errors.taxStatus.message}</p>
          )}
        </div>

        {taxStatus === 'VAT_REGISTERED' && (
          <div className="space-y-2">
            <Label htmlFor="vatNumber">VAT Number</Label>
            <Input
              id="vatNumber"
              {...register('vatNumber')}
              placeholder="e.g., 4XXXXXXXXX"
            />
            {errors.vatNumber && (
              <p className="text-sm text-destructive">{errors.vatNumber.message}</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
        {taxStatus === 'VAT_REGISTERED' ? (
          <>VAT will be calculated at 15% on all invoices. Your VAT number will appear on invoices.</>
        ) : (
          <>No VAT will be charged on invoices. You can update this later if you become VAT registered.</>
        )}
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

export default VatConfigForm;
