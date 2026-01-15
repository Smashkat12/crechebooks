'use client';

/**
 * Date Range Picker Component with SA Timezone Support
 * TASK-UI-007: Fix Date Picker Timezone
 *
 * Features:
 * - Proper SA timezone (Africa/Johannesburg) handling via date-fns-tz
 * - Display dates in local SA format (dd/MM/yyyy)
 * - Send dates to API in ISO format with timezone
 * - Support date ranges (start/end date pickers)
 * - Preset ranges (This Month, Last Month, This Quarter, etc.)
 * - Month/year boundaries for billing periods
 * - Prevent future date selection where applicable
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
  endOfDaySA,
  SA_DATE_FORMAT,
  getDateRangePresets,
  getBillingPresets,
  type DateRange,
  type DateRangePreset,
} from '@/lib/date-utils';
import { isBefore, isAfter, isValid, addDays } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

export interface DateRangePickerProps {
  /** Selected date range */
  value?: DateRange;
  /** Callback when range changes */
  onChange?: (range: DateRange) => void;
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
  /** Maximum range span in days */
  maxRangeDays?: number;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Show clear button */
  clearable?: boolean;
  /** Additional class name */
  className?: string;
  /** ID for the trigger button */
  id?: string;
  /** Name prefix for form integration */
  name?: string;
  /** Error state */
  error?: boolean;
  /** Error message */
  errorMessage?: string;
  /** Show preset ranges sidebar */
  showPresets?: boolean;
  /** Use billing-specific presets */
  useBillingPresets?: boolean;
  /** Custom preset ranges */
  customPresets?: DateRangePreset[];
  /** Number of months to display */
  numberOfMonths?: 1 | 2;
  /** ARIA label */
  'aria-label'?: string;
  /** ARIA described by */
  'aria-describedby'?: string;
  /** Callback when popover opens/closes */
  onOpenChange?: (open: boolean) => void;
}

// ============================================================================
// DateRangePicker Component
// ============================================================================

export function DateRangePicker({
  value = { from: null, to: null },
  onChange,
  placeholder = 'Select date range',
  dateFormat = SA_DATE_FORMAT,
  disableFuture = false,
  disablePast = false,
  minDate,
  maxDate,
  maxRangeDays,
  disabled = false,
  clearable = true,
  className,
  id,
  name,
  error = false,
  errorMessage,
  showPresets = true,
  useBillingPresets = false,
  customPresets,
  numberOfMonths = 2,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  onOpenChange,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Calculate today in SA timezone
  const today = React.useMemo(() => todaySA(), []);

  // Get presets based on configuration
  const presets = React.useMemo(() => {
    if (customPresets) return customPresets;
    if (useBillingPresets) return getBillingPresets();
    return getDateRangePresets();
  }, [customPresets, useBillingPresets]);

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

      // If we have a "from" date and maxRangeDays, limit "to" selection
      if (maxRangeDays && value.from && !value.to) {
        const maxEndDate = addDays(value.from, maxRangeDays);
        if (isAfter(date, maxEndDate)) return true;
      }

      return false;
    },
    [effectiveMinDate, effectiveMaxDate, maxRangeDays, value.from, value.to]
  );

  // Handle date range selection
  const handleSelect = React.useCallback(
    (range: { from?: Date; to?: Date } | undefined) => {
      const newRange: DateRange = {
        from: range?.from ? startOfDaySA(range.from) : null,
        to: range?.to ? endOfDaySA(range.to) : null,
      };

      onChange?.(newRange);

      // Close when range is complete
      if (newRange.from && newRange.to) {
        setOpen(false);
      }
    },
    [onChange]
  );

  // Handle clear button click
  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onChange?.({ from: null, to: null });
    },
    [onChange]
  );

  // Handle preset selection
  const handlePresetClick = React.useCallback(
    (preset: DateRangePreset) => {
      onChange?.(preset.range);
      setOpen(false);
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
    if (!value.from) return '';
    const fromStr = formatSADate(value.from, dateFormat);
    if (!value.to) return fromStr;
    const toStr = formatSADate(value.to, dateFormat);
    return `${fromStr} - ${toStr}`;
  }, [value, dateFormat]);

  // Determine initial month to show in calendar
  const defaultMonth = React.useMemo(() => {
    if (value.from && isValid(value.from)) return value.from;
    return today;
  }, [value.from, today]);

  // Prepare selected range for Calendar component
  const selectedRange = React.useMemo(() => {
    if (!value.from) return undefined;
    return {
      from: value.from,
      to: value.to || undefined,
    };
  }, [value]);

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
            aria-invalid={error}
            aria-describedby={describedBy}
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              !value.from && 'text-muted-foreground',
              error && 'border-destructive focus:ring-destructive',
              className
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">
              {displayValue || placeholder}
            </span>
            {clearable && value.from && !disabled && (
              <X
                className="ml-2 h-4 w-4 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                onClick={handleClear}
                aria-label="Clear date range"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="start"
          sideOffset={4}
        >
          <div className="flex">
            {/* Presets sidebar */}
            {showPresets && presets.length > 0 && (
              <div className="border-r p-3 space-y-1 min-w-[140px]">
                <p className="text-xs font-medium text-muted-foreground mb-2 px-2">
                  Quick Select
                </p>
                {presets.map((preset, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm font-normal h-8"
                    onClick={() => handlePresetClick(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}

            {/* Calendar */}
            <div className="p-3">
              <Calendar
                mode="range"
                selected={selectedRange}
                onSelect={handleSelect}
                disabled={disabledMatcher}
                numberOfMonths={numberOfMonths}
                defaultMonth={defaultMonth}
                initialFocus
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Hidden inputs for form submission */}
      {name && (
        <>
          <input
            type="hidden"
            name={`${name}_from`}
            value={value.from ? value.from.toISOString() : ''}
          />
          <input
            type="hidden"
            name={`${name}_to`}
            value={value.to ? value.to.toISOString() : ''}
          />
        </>
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
// Compact Date Range Picker (for smaller spaces)
// ============================================================================

export interface CompactDateRangePickerProps extends Omit<DateRangePickerProps, 'showPresets' | 'numberOfMonths'> {
  /** Separator text between dates */
  separator?: string;
}

export function CompactDateRangePicker({
  separator: _separator = 'to',
  ...props
}: CompactDateRangePickerProps) {
  return (
    <DateRangePicker
      {...props}
      showPresets={false}
      numberOfMonths={1}
      placeholder={props.placeholder || 'Select dates'}
    />
  );
}

// ============================================================================
// Billing Period Picker (specialized for billing)
// ============================================================================

export type BillingPeriodPickerProps = Omit<DateRangePickerProps, 'showPresets' | 'useBillingPresets'>;

export function BillingPeriodPicker(props: BillingPeriodPickerProps) {
  return (
    <DateRangePicker
      {...props}
      showPresets={true}
      useBillingPresets={true}
      placeholder={props.placeholder || 'Select billing period'}
    />
  );
}

// ============================================================================
// Exports
// ============================================================================

export {
  type DateRange,
  type DateRangePreset,
  getDateRangePresets,
  getBillingPresets,
} from '@/lib/date-utils';

export default DateRangePicker;
