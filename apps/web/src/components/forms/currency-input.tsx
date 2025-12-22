import * as React from 'react';
import { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { FormFieldWrapper } from './form-field';

interface CurrencyInputProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'name' | 'type' | 'value' | 'onChange'
  > {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  description?: string;
  required?: boolean;
}

/**
 * Formats a number as ZAR currency (R X,XXX.XX)
 */
function formatCurrency(value: string | number): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return '';
  }

  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numValue);
}

/**
 * Parses a formatted currency string to a number
 */
function parseCurrency(value: string): string {
  // Remove R, spaces, and commas
  const cleaned = value.replace(/[R\s,]/g, '');

  // Validate that it's a valid number format
  if (!/^\d*\.?\d{0,2}$/.test(cleaned)) {
    return '';
  }

  return cleaned;
}

interface CurrencyInputFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'name' | 'type' | 'value' | 'onChange' | 'onBlur'
> {
  field: {
    value: string | number | undefined | null;
    onChange: (value: string) => void;
    onBlur: () => void;
  };
}

function CurrencyInputField({ field, ...inputProps }: CurrencyInputFieldProps) {
  const [displayValue, setDisplayValue] = React.useState('');

  // Initialize display value from field value
  React.useEffect(() => {
    if (field.value !== undefined && field.value !== null && field.value !== '') {
      setDisplayValue(formatCurrency(field.value));
    }
  }, [field.value]);

  return (
    <div className="relative">
      <Input
        {...inputProps}
        type="text"
        value={displayValue}
        onChange={(e) => {
          const input = e.target.value;

          // Allow empty input
          if (input === '' || input === 'R') {
            setDisplayValue('');
            field.onChange('');
            return;
          }

          // Parse the input
          const parsed = parseCurrency(input);

          if (parsed !== '') {
            // Update the field value with the raw number
            field.onChange(parsed);
            // Update display with formatted version
            setDisplayValue(formatCurrency(parsed));
          }
        }}
        onBlur={() => {
          // Format on blur
          const parsed = parseCurrency(displayValue);
          if (parsed !== '') {
            setDisplayValue(formatCurrency(parsed));
          }
          field.onBlur();
        }}
        placeholder="R 0.00"
      />
    </div>
  );
}

export function CurrencyInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  control,
  name,
  label,
  description,
  required,
  ...inputProps
}: CurrencyInputProps<TFieldValues, TName>) {
  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      required={required}
    >
      {(field) => <CurrencyInputField field={field} {...inputProps} />}
    </FormFieldWrapper>
  );
}
