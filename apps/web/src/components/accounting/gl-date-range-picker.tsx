'use client';

/**
 * TASK-ACCT-UI-002: General Ledger Date Range Picker
 * Specialized date range picker for accounting periods with SA timezone support.
 */

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
  subQuarters,
  subYears,
} from 'date-fns';

export interface GLDateRange {
  from: Date;
  to: Date;
}

interface GLDateRangePickerProps {
  value: GLDateRange;
  onChange: (range: GLDateRange) => void;
  className?: string;
  disabled?: boolean;
}

type PresetKey = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'thisYear' | 'lastYear' | 'custom';

const presets: { key: PresetKey; label: string }[] = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisQuarter', label: 'This Quarter' },
  { key: 'lastQuarter', label: 'Last Quarter' },
  { key: 'thisYear', label: 'This Year' },
  { key: 'lastYear', label: 'Last Year' },
  { key: 'custom', label: 'Custom Range' },
];

function getPresetRange(key: PresetKey): GLDateRange | null {
  const now = new Date();

  switch (key) {
    case 'thisMonth':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'lastMonth':
      return { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) };
    case 'thisQuarter':
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case 'lastQuarter':
      return { from: startOfQuarter(subQuarters(now, 1)), to: endOfQuarter(subQuarters(now, 1)) };
    case 'thisYear':
      return { from: startOfYear(now), to: endOfYear(now) };
    case 'lastYear':
      return { from: startOfYear(subYears(now, 1)), to: endOfYear(subYears(now, 1)) };
    case 'custom':
      return null;
    default:
      return null;
  }
}

function detectPreset(range: GLDateRange): PresetKey {
  const now = new Date();

  const presetChecks: { key: PresetKey; range: GLDateRange }[] = [
    { key: 'thisMonth', range: { from: startOfMonth(now), to: endOfMonth(now) } },
    { key: 'lastMonth', range: { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) } },
    { key: 'thisQuarter', range: { from: startOfQuarter(now), to: endOfQuarter(now) } },
    { key: 'lastQuarter', range: { from: startOfQuarter(subQuarters(now, 1)), to: endOfQuarter(subQuarters(now, 1)) } },
    { key: 'thisYear', range: { from: startOfYear(now), to: endOfYear(now) } },
    { key: 'lastYear', range: { from: startOfYear(subYears(now, 1)), to: endOfYear(subYears(now, 1)) } },
  ];

  for (const check of presetChecks) {
    if (
      format(range.from, 'yyyy-MM-dd') === format(check.range.from, 'yyyy-MM-dd') &&
      format(range.to, 'yyyy-MM-dd') === format(check.range.to, 'yyyy-MM-dd')
    ) {
      return check.key;
    }
  }

  return 'custom';
}

export function GLDateRangePicker({ value, onChange, className, disabled }: GLDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const currentPreset = detectPreset(value);

  const handlePresetChange = (key: string) => {
    const range = getPresetRange(key as PresetKey);
    if (range) {
      onChange(range);
    }
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      onChange({ from: range.from, to: range.to });
      setOpen(false);
    } else if (range?.from) {
      // Partial selection - keep popover open
      onChange({ from: range.from, to: value.to });
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Select value={currentPreset} onValueChange={handlePresetChange} disabled={disabled}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.key} value={preset.key}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              'justify-start text-left font-normal min-w-[240px]',
              !value && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(value.from, 'dd MMM yyyy')} - {format(value.to, 'dd MMM yyyy')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={value.from}
            selected={{ from: value.from, to: value.to }}
            onSelect={handleCalendarSelect}
            numberOfMonths={2}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
