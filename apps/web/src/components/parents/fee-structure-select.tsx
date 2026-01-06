'use client';

import { Control, FieldPath, FieldValues } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormFieldWrapper } from '@/components/forms/form-field';
import { formatCurrency } from '@/lib/utils/format';
import type { IFeeStructure } from '@crechebooks/types';

interface FeeStructureSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  description?: string;
  required?: boolean;
  feeStructures: IFeeStructure[];
  disabled?: boolean;
}

export function FeeStructureSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  control,
  name,
  label = 'Fee Structure',
  description,
  required,
  feeStructures,
  disabled,
}: FeeStructureSelectProps<TFieldValues, TName>) {
  const activeStructures = feeStructures.filter(fs => fs.isActive);

  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      required={required}
    >
      {(field) => (
        <Select
          onValueChange={field.onChange}
          defaultValue={field.value}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a fee structure" />
          </SelectTrigger>
          <SelectContent>
            {activeStructures.map((structure) => (
              <SelectItem key={structure.id} value={structure.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{structure.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency((structure.amountCents ?? structure.baseAmount ?? 0) / 100)} / month
                  </span>
                </div>
              </SelectItem>
            ))}
            {activeStructures.length === 0 && (
              <SelectItem value="_none" disabled>
                No fee structures available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
    </FormFieldWrapper>
  );
}
