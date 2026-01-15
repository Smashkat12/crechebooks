'use client';

/**
 * Reports Date Range Picker Component
 * Uses SA timezone utilities for proper timezone handling
 *
 * This is a specialized version for the reports section that maintains
 * the original API while using the new timezone-aware utilities.
 */

import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  formatSADate,
  startOfMonthSA,
  endOfMonthSA,
  startOfYearSA,
  endOfYearSA,
  startOfDaySA,
  endOfDaySA,
  nowSA,
} from '@/lib/date-utils';
import { subMonths, subYears } from 'date-fns';

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

type PresetKey = 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'last_year' | 'custom';

const presets: { key: PresetKey; label: string; getRange: () => DateRange }[] = [
  {
    key: 'this_month',
    label: 'This Month',
    getRange: () => {
      const now = nowSA();
      return {
        from: startOfMonthSA(now),
        to: endOfMonthSA(now),
      };
    },
  },
  {
    key: 'last_month',
    label: 'Last Month',
    getRange: () => {
      const lastMonth = subMonths(nowSA(), 1);
      return {
        from: startOfMonthSA(lastMonth),
        to: endOfMonthSA(lastMonth),
      };
    },
  },
  {
    key: 'last_3_months',
    label: 'Last 3 Months',
    getRange: () => {
      const now = nowSA();
      const threeMonthsAgo = subMonths(now, 2);
      return {
        from: startOfMonthSA(threeMonthsAgo),
        to: endOfMonthSA(now),
      };
    },
  },
  {
    key: 'this_year',
    label: 'This Year',
    getRange: () => {
      const now = nowSA();
      return {
        from: startOfYearSA(now),
        to: endOfYearSA(now),
      };
    },
  },
  {
    key: 'last_year',
    label: 'Last Year',
    getRange: () => {
      const lastYear = subYears(nowSA(), 1);
      return {
        from: startOfYearSA(lastYear),
        to: endOfYearSA(lastYear),
      };
    },
  },
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [selectedPreset, setSelectedPreset] = useState<PresetKey | 'custom'>('this_month');
  const [open, setOpen] = useState(false);

  const handlePresetChange = (preset: PresetKey) => {
    setSelectedPreset(preset);
    if (preset !== 'custom') {
      const found = presets.find((p) => p.key === preset);
      if (found) {
        onChange(found.getRange());
      }
    }
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setSelectedPreset('custom');
      // Convert to SA timezone boundaries
      onChange({
        from: startOfDaySA(range.from),
        to: endOfDaySA(range.to),
      });
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Select value={selectedPreset} onValueChange={(v) => handlePresetChange(v as PresetKey)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.key} value={preset.key}>
              {preset.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value.from && value.to ? (
              <>
                {formatSADate(value.from, 'dd MMM yyyy')} - {formatSADate(value.to, 'dd MMM yyyy')}
              </>
            ) : (
              <span>Select date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
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
