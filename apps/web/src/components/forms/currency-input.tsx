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
 * Handles en-ZA locale where comma is decimal separator and space is thousands separator
 */
function parseCurrency(value: string): string {
  // Remove R symbol and spaces (spaces are thousand separators in ZA locale)
  let cleaned = value.replace(/[R\s]/g, '');

  // In en-ZA locale, comma is the decimal separator - convert to period
  const lastCommaIdx = cleaned.lastIndexOf(',');
  if (lastCommaIdx !== -1) {
    cleaned = cleaned.substring(0, lastCommaIdx) + '.' + cleaned.substring(lastCommaIdx + 1);
  }

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
    onChange: (value: number | undefined) => void;
    onBlur: () => void;
  };
}

function CurrencyInputField({ field, ...inputProps }: CurrencyInputFieldProps) {
  const [displayValue, setDisplayValue] = React.useState('');
  const [isFocused, setIsFocused] = React.useState(false);

  // Initialize/update display value from field value (only when not focused)
  React.useEffect(() => {
    if (!isFocused && field.value !== undefined && field.value !== null && field.value !== '') {
      setDisplayValue(formatCurrency(field.value));
    }
  }, [field.value, isFocused]);

  return (
    <div className="relative">
      <Input
        {...inputProps}
        type="text"
        value={displayValue}
        onChange={(e) => {
          const input = e.target.value;

          // Allow empty input
          if (input === '' || input === 'R' || input === 'R ') {
            setDisplayValue('');
            field.onChange(undefined);
            return;
          }

          // When focused, allow raw numeric input without reformatting
          if (isFocused) {
            // Strip non-numeric chars except decimal point
            const raw = input.replace(/[^\d.]/g, '');
            setDisplayValue(raw);
            const numValue = parseFloat(raw);
            field.onChange(isNaN(numValue) ? undefined : numValue);
            return;
          }

          // Parse the formatted input
          const parsed = parseCurrency(input);
          if (parsed !== '') {
            const numValue = parseFloat(parsed);
            field.onChange(isNaN(numValue) ? undefined : numValue);
            setDisplayValue(formatCurrency(parsed));
          }
        }}
        onFocus={() => {
          setIsFocused(true);
          // Show raw number when focused for easier editing
          if (field.value !== undefined && field.value !== null) {
            const num = typeof field.value === 'string' ? parseFloat(String(field.value)) : field.value;
            if (!isNaN(num as number) && num !== 0) {
              setDisplayValue(String(num));
            } else {
              setDisplayValue('');
            }
          }
        }}
        onBlur={() => {
          setIsFocused(false);
          // Format nicely on blur
          if (field.value !== undefined && field.value !== null && field.value !== '' && field.value !== 0) {
            setDisplayValue(formatCurrency(field.value));
          } else {
            setDisplayValue('');
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
