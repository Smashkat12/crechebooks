'use client';

/**
 * Month Picker Component
 * TASK-PORTAL-014: Parent Portal Statements Page
 *
 * Month/year selector with:
 * - Year dropdown
 * - Month grid (Jan-Dec)
 * - Highlight current month
 * - Disable future months
 * - Click to select period
 */

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface MonthPickerProps {
  selectedYear: number;
  selectedMonth: number | null;
  onYearChange: (year: number) => void;
  onMonthSelect: (year: number, month: number) => void;
  minYear?: number;
  maxYear?: number;
}

const MONTHS = [
  { value: 1, label: 'Jan', fullLabel: 'January' },
  { value: 2, label: 'Feb', fullLabel: 'February' },
  { value: 3, label: 'Mar', fullLabel: 'March' },
  { value: 4, label: 'Apr', fullLabel: 'April' },
  { value: 5, label: 'May', fullLabel: 'May' },
  { value: 6, label: 'Jun', fullLabel: 'June' },
  { value: 7, label: 'Jul', fullLabel: 'July' },
  { value: 8, label: 'Aug', fullLabel: 'August' },
  { value: 9, label: 'Sep', fullLabel: 'September' },
  { value: 10, label: 'Oct', fullLabel: 'October' },
  { value: 11, label: 'Nov', fullLabel: 'November' },
  { value: 12, label: 'Dec', fullLabel: 'December' },
];

export function MonthPicker({
  selectedYear,
  selectedMonth,
  onYearChange,
  onMonthSelect,
  minYear = 2020,
  maxYear,
}: MonthPickerProps) {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // 1-indexed

  // Default maxYear to current year
  const effectiveMaxYear = maxYear || currentYear;

  // Generate year options
  const yearOptions: number[] = [];
  for (let year = effectiveMaxYear; year >= minYear; year--) {
    yearOptions.push(year);
  }

  // Check if a month is in the future
  const isFutureMonth = (year: number, month: number): boolean => {
    if (year > currentYear) return true;
    if (year === currentYear && month > currentMonth) return true;
    return false;
  };

  // Check if a month is the current month
  const isCurrentMonth = (year: number, month: number): boolean => {
    return year === currentYear && month === currentMonth;
  };

  // Navigate to previous year
  const handlePrevYear = () => {
    if (selectedYear > minYear) {
      onYearChange(selectedYear - 1);
    }
  };

  // Navigate to next year
  const handleNextYear = () => {
    if (selectedYear < effectiveMaxYear) {
      onYearChange(selectedYear + 1);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Year Selection */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Select Period</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handlePrevYear}
                disabled={selectedYear <= minYear}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous year</span>
              </Button>

              <Select
                value={String(selectedYear)}
                onValueChange={(value) => onYearChange(parseInt(value, 10))}
              >
                <SelectTrigger className="w-[100px] h-8">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextYear}
                disabled={selectedYear >= effectiveMaxYear}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next year</span>
              </Button>
            </div>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {MONTHS.map((month) => {
              const isFuture = isFutureMonth(selectedYear, month.value);
              const isCurrent = isCurrentMonth(selectedYear, month.value);
              const isSelected = selectedMonth === month.value;

              return (
                <button
                  key={month.value}
                  onClick={() => {
                    if (!isFuture) {
                      onMonthSelect(selectedYear, month.value);
                    }
                  }}
                  disabled={isFuture}
                  className={cn(
                    'relative px-3 py-2 text-sm font-medium rounded-md transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                    // Default state
                    'border border-transparent hover:bg-muted/50',
                    // Selected state
                    isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                    // Current month indicator (not selected)
                    isCurrent && !isSelected && 'border-primary text-primary',
                    // Disabled (future) state
                    isFuture && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                  )}
                >
                  <span className="sm:hidden">{month.label}</span>
                  <span className="hidden sm:inline">{month.fullLabel.substring(0, 3)}</span>
                  {isCurrent && !isSelected && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Period Display */}
          {selectedMonth && (
            <div className="text-center text-sm text-muted-foreground pt-2 border-t">
              Selected: <span className="font-medium text-foreground">
                {MONTHS.find(m => m.value === selectedMonth)?.fullLabel} {selectedYear}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
