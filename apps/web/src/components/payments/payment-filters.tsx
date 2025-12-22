/**
 * Payment Filters Component
 *
 * Filter toolbar for payments with:
 * - Date range picker
 * - Status filter (all/unmatched/matched/partial)
 * - Search input
 */

import * as React from 'react';
import { CalendarIcon, Search, X } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
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

export interface PaymentFiltersState {
  dateRange?: DateRange;
  status?: 'all' | 'matched' | 'unmatched' | 'partially_matched';
  search?: string;
}

interface PaymentFiltersProps {
  filters: PaymentFiltersState;
  onFiltersChange: (filters: PaymentFiltersState) => void;
  className?: string;
}

export function PaymentFilters({
  filters,
  onFiltersChange,
  className,
}: PaymentFiltersProps) {
  const hasActiveFilters = !!(
    filters.dateRange?.from ||
    filters.status !== 'all' ||
    filters.search
  );

  const handleClearFilters = () => {
    onFiltersChange({
      status: 'all',
    });
  };

  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center', className)}>
      {/* Date Range Picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal sm:w-[260px]',
              !filters.dateRange && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {filters.dateRange?.from ? (
              filters.dateRange.to ? (
                <>
                  {format(filters.dateRange.from, 'LLL dd, y')} -{' '}
                  {format(filters.dateRange.to, 'LLL dd, y')}
                </>
              ) : (
                format(filters.dateRange.from, 'LLL dd, y')
              )
            ) : (
              'Select date range'
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={filters.dateRange?.from}
            selected={filters.dateRange}
            onSelect={(dateRange) =>
              onFiltersChange({ ...filters, dateRange })
            }
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Status Filter */}
      <Select
        value={filters.status || 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            status: value as 'all' | 'matched' | 'unmatched' | 'partially_matched',
          })
        }
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="unmatched">Unmatched</SelectItem>
          <SelectItem value="matched">Matched</SelectItem>
          <SelectItem value="partially_matched">Partially Matched</SelectItem>
        </SelectContent>
      </Select>

      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by reference or parent..."
          className="pl-8"
          value={filters.search || ''}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.target.value })
          }
        />
      </div>

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          onClick={handleClearFilters}
          className="shrink-0"
        >
          <X className="mr-2 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
