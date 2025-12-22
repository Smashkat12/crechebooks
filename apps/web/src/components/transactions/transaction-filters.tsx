/**
 * Transaction Filters Component
 *
 * Filter toolbar for transactions with:
 * - Date range picker
 * - Status filter (all/categorized/uncategorized/needs_review)
 * - Category select
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
import { CategorySelect } from './category-select';

export interface TransactionFiltersState {
  dateRange?: DateRange;
  status?: 'all' | 'categorized' | 'uncategorized' | 'needs_review';
  categoryCode?: string;
  search?: string;
}

interface TransactionFiltersProps {
  filters: TransactionFiltersState;
  onFiltersChange: (filters: TransactionFiltersState) => void;
  className?: string;
}

export function TransactionFilters({
  filters,
  onFiltersChange,
  className,
}: TransactionFiltersProps) {
  const hasActiveFilters = !!(
    filters.dateRange?.from ||
    filters.status !== 'all' ||
    filters.categoryCode ||
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
            status: value as 'all' | 'categorized' | 'uncategorized' | 'needs_review',
          })
        }
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="categorized">Categorized</SelectItem>
          <SelectItem value="uncategorized">Uncategorized</SelectItem>
          <SelectItem value="needs_review">Needs Review</SelectItem>
        </SelectContent>
      </Select>

      {/* Category Filter */}
      <div className="w-full sm:w-[220px]">
        <CategorySelect
          value={filters.categoryCode}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, categoryCode: value })
          }
          placeholder="Filter by category"
        />
      </div>

      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transactions..."
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
