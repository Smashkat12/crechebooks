'use client';

/**
 * Fee Structure Inline Form
 * TASK-ACCT-UI-006: Inline form for onboarding wizard
 */

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateFeeStructure, useFeeStructures } from '@/hooks/use-fee-structures';
import { useToast } from '@/hooks/use-toast';

const feeStructureSchema = z.object({
  name: z.string().min(1, 'Fee structure name is required').max(100),
  description: z.string().max(500).optional(),
  fee_type: z.enum(['FULL_DAY', 'HALF_DAY', 'HOURLY', 'CUSTOM']),
  amount: z.coerce.number().min(0, 'Amount must be positive'),
  registration_fee: z.coerce.number().min(0).optional(),
  vat_inclusive: z.boolean(),
  sibling_discount_percent: z.coerce.number().min(0).max(100).optional(),
  effective_from: z.string().min(1, 'Start date is required'),
});

type FeeStructureFormData = z.infer<typeof feeStructureSchema>;

interface FeeStructureFormProps {
  onComplete: () => void;
  onCancel?: () => void;
}

export function FeeStructureForm({ onComplete, onCancel }: FeeStructureFormProps) {
  const { toast } = useToast();
  const createFeeStructure = useCreateFeeStructure();
  const { data: feeStructures, isLoading: feeStructuresLoading } = useFeeStructures();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FeeStructureFormData>({
    resolver: zodResolver(feeStructureSchema),
    defaultValues: {
      name: '',
      description: '',
      fee_type: 'FULL_DAY',
      amount: 0,
      registration_fee: 0,
      vat_inclusive: true,
      sibling_discount_percent: 0,
      effective_from: new Date().toISOString().split('T')[0],
    },
  });

  const feeType = watch('fee_type');

  // If there are already fee structures, show a message
  const hasFeeStructures = feeStructures && feeStructures.fee_structures.length > 0;

  const onSubmit = async (data: FeeStructureFormData) => {
    try {
      await createFeeStructure.mutateAsync(data);
      toast({
        title: 'Fee structure created',
        description: 'Your fee structure has been created successfully.',
      });
      onComplete();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create fee structure. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (feeStructuresLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If fee structures already exist, allow skipping
  if (hasFeeStructures) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              You already have {feeStructures.fee_structures.length} fee structure(s) set up.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onComplete}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Fee Structure Name *</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="e.g., Full Day (Baby Class), Half Day (Toddler)"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="fee_type">Fee Type *</Label>
          <Controller
            name="fee_type"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fee type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_DAY">Full Day</SelectItem>
                  <SelectItem value="HALF_DAY">Half Day</SelectItem>
                  <SelectItem value="HOURLY">Hourly</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.fee_type && (
            <p className="text-sm text-destructive">{errors.fee_type.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">
            Monthly Amount (ZAR) *
            {feeType === 'HOURLY' && <span className="text-muted-foreground"> per hour</span>}
          </Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            {...register('amount')}
            placeholder="e.g., 3500.00"
          />
          {errors.amount && (
            <p className="text-sm text-destructive">{errors.amount.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="registration_fee">Registration Fee (ZAR)</Label>
          <Input
            id="registration_fee"
            type="number"
            step="0.01"
            min="0"
            {...register('registration_fee')}
            placeholder="e.g., 500.00 (optional)"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sibling_discount_percent">Sibling Discount %</Label>
          <Input
            id="sibling_discount_percent"
            type="number"
            step="1"
            min="0"
            max="100"
            {...register('sibling_discount_percent')}
            placeholder="e.g., 10 (optional)"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="effective_from">Effective From *</Label>
          <Input
            id="effective_from"
            type="date"
            {...register('effective_from')}
          />
          {errors.effective_from && (
            <p className="text-sm text-destructive">{errors.effective_from.message}</p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-4">
          <Controller
            name="vat_inclusive"
            control={control}
            render={({ field }) => (
              <Switch
                id="vat_inclusive"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor="vat_inclusive" className="cursor-pointer">
            Amount includes VAT
          </Label>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            {...register('description')}
            placeholder="Optional description for this fee structure"
            rows={2}
          />
        </div>
      </div>

      <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
        This fee structure will be used when enrolling children. You can create more fee structures later.
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting || createFeeStructure.isPending}>
          {(isSubmitting || createFeeStructure.isPending) ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Create & Complete
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

export default FeeStructureForm;
