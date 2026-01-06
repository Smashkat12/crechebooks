import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Control, FieldPath, FieldValues } from 'react-hook-form';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { FormFieldWrapper } from './form-field';

type DatePickerMode = 'default' | 'dob' | 'future';

interface DatePickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  /** Mode preset: 'dob' for date of birth (1940-now), 'future' for future dates, 'default' for ±10 years */
  mode?: DatePickerMode;
}

export function DatePicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  control,
  name,
  label,
  description,
  required,
  placeholder = 'Pick a date',
  disabled,
  minDate,
  maxDate,
  mode = 'default',
}: DatePickerProps<TFieldValues, TName>) {
  // Calculate year range based on mode
  const currentYear = new Date().getFullYear();
  let fromYear: number;
  let toYear: number;

  switch (mode) {
    case 'dob':
      // Date of birth: 1940 to current year (staff could be born any time)
      fromYear = 1940;
      toYear = currentYear;
      break;
    case 'future':
      // Future dates: current year to 10 years ahead
      fromYear = currentYear;
      toYear = currentYear + 10;
      break;
    default:
      // Default: 10 years back to 5 years forward
      fromYear = currentYear - 10;
      toYear = currentYear + 5;
  }

  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      required={required}
    >
      {(field) => (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !field.value && 'text-muted-foreground'
              )}
              disabled={disabled}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {field.value ? (
                format(new Date(field.value), 'PPP')
              ) : (
                <span>{placeholder}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={field.value ? new Date(field.value) : undefined}
              onSelect={(date) => {
                if (date) {
                  // Set to noon to avoid timezone issues, return as Date object
                  const localDate = new Date(date);
                  localDate.setHours(12, 0, 0, 0);
                  field.onChange(localDate);
                } else {
                  field.onChange(null);
                }
              }}
              disabled={(date) => {
                if (disabled) return true;
                if (minDate && date < minDate) return true;
                if (maxDate && date > maxDate) return true;
                return false;
              }}
              fromYear={fromYear}
              toYear={toYear}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )}
    </FormFieldWrapper>
  );
}
