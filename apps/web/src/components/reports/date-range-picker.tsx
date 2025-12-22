'use client';

import { useState } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from 'date-fns';
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
    getRange: () => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }),
  },
  {
    key: 'last_month',
    label: 'Last Month',
    getRange: () => ({
      from: startOfMonth(subMonths(new Date(), 1)),
      to: endOfMonth(subMonths(new Date(), 1)),
    }),
  },
  {
    key: 'last_3_months',
    label: 'Last 3 Months',
    getRange: () => ({
      from: startOfMonth(subMonths(new Date(), 2)),
      to: endOfMonth(new Date()),
    }),
  },
  {
    key: 'this_year',
    label: 'This Year',
    getRange: () => ({
      from: startOfYear(new Date()),
      to: endOfYear(new Date()),
    }),
  },
  {
    key: 'last_year',
    label: 'Last Year',
    getRange: () => ({
      from: startOfYear(subYears(new Date(), 1)),
      to: endOfYear(subYears(new Date(), 1)),
    }),
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
      onChange({ from: range.from, to: range.to });
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
                {format(value.from, 'dd MMM yyyy')} - {format(value.to, 'dd MMM yyyy')}
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
