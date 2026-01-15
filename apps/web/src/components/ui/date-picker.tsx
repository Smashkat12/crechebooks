'use client';

/**
 * Date Picker Component with SA Timezone Support
 * TASK-UI-007: Fix Date Picker Timezone
 *
 * Features:
 * - Proper SA timezone (Africa/Johannesburg) handling via date-fns-tz
 * - Display dates in local SA format (dd/MM/yyyy)
 * - Send dates to API in ISO format with timezone
 * - Handle date boundaries correctly for billing
 * - Prevent future date selection where applicable
 * - Support for date constraints (min/max dates)
 */

import * as React from 'react';
import { CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  formatSADate,
  todaySA,
  startOfDaySA,
  SA_DATE_FORMAT,
} from '@/lib/date-utils';
import { isBefore, isAfter, isValid } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

export interface DatePickerProps {
  /** Selected date */
  value?: Date | null;
  /** Callback when date changes */
  onChange?: (date: Date | null) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Date format for display */
  dateFormat?: string;
  /** Disable future dates */
  disableFuture?: boolean;
  /** Disable past dates */
  disablePast?: boolean;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Show clear button */
  clearable?: boolean;
  /** Additional class name */
  className?: string;
  /** ID for the trigger button */
  id?: string;
  /** Name attribute for form integration */
  name?: string;
  /** Error state */
  error?: boolean;
  /** Error message */
  errorMessage?: string;
  /** ARIA label */
  'aria-label'?: string;
  /** ARIA described by */
  'aria-describedby'?: string;
  /** Callback when popover opens/closes */
  onOpenChange?: (open: boolean) => void;
}

// ============================================================================
// DatePicker Component
// ============================================================================

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  dateFormat = SA_DATE_FORMAT,
  disableFuture = false,
  disablePast = false,
  minDate,
  maxDate,
  disabled = false,
  required = false,
  clearable = true,
  className,
  id,
  name,
  error = false,
  errorMessage,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  onOpenChange,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Calculate today in SA timezone
  const today = React.useMemo(() => todaySA(), []);

  // Calculate effective date constraints
  const effectiveMinDate = React.useMemo(() => {
    if (disablePast && minDate) {
      return isBefore(today, minDate) ? minDate : today;
    }
    if (disablePast) return today;
    return minDate;
  }, [disablePast, minDate, today]);

  const effectiveMaxDate = React.useMemo(() => {
    if (disableFuture && maxDate) {
      return isAfter(today, maxDate) ? maxDate : today;
    }
    if (disableFuture) return today;
    return maxDate;
  }, [disableFuture, maxDate, today]);

  // Disable dates outside valid range
  const disabledMatcher = React.useCallback(
    (date: Date) => {
      if (effectiveMinDate && isBefore(date, effectiveMinDate)) return true;
      if (effectiveMaxDate && isAfter(date, effectiveMaxDate)) return true;
      return false;
    },
    [effectiveMinDate, effectiveMaxDate]
  );

  // Handle date selection - convert to SA timezone start of day
  const handleSelect = React.useCallback(
    (date: Date | undefined) => {
      if (date) {
        // Convert to start of day in SA timezone for consistent handling
        const saDate = startOfDaySA(date);
        onChange?.(saDate);
      } else {
        onChange?.(null);
      }
      setOpen(false);
    },
    [onChange]
  );

  // Handle clear button click
  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onChange?.(null);
    },
    [onChange]
  );

  // Handle popover open change
  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
      onOpenChange?.(newOpen);
    },
    [onOpenChange]
  );

  // Format displayed value
  const displayValue = React.useMemo(() => {
    if (!value || !isValid(value)) return '';
    return formatSADate(value, dateFormat);
  }, [value, dateFormat]);

  // Determine initial month to show in calendar
  const defaultMonth = React.useMemo(() => {
    if (value && isValid(value)) return value;
    return today;
  }, [value, today]);

  // Generate error ID for accessibility
  const errorId = errorMessage && id ? `${id}-error` : undefined;
  const describedBy = [ariaDescribedBy, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel || placeholder}
            aria-required={required}
            aria-invalid={error}
            aria-describedby={describedBy}
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground',
              error && 'border-destructive focus:ring-destructive',
              className
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">
              {displayValue || placeholder}
            </span>
            {clearable && value && !disabled && (
              <X
                className="ml-2 h-4 w-4 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                onClick={handleClear}
                aria-label="Clear date"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value || undefined}
            onSelect={handleSelect}
            disabled={disabledMatcher}
            defaultMonth={defaultMonth}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* Hidden input for form submission */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={value ? value.toISOString() : ''}
        />
      )}

      {/* Error message */}
      {errorMessage && (
        <p
          id={errorId}
          className="mt-1 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Utility exports from date-utils for convenience
// ============================================================================

export {
  formatSADate,
  todaySA,
  startOfDaySA,
  SA_DATE_FORMAT,
} from '@/lib/date-utils';

export default DatePicker;
