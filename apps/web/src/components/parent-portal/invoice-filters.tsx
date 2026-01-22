'use client';

/**
 * Invoice Filters Component
 * TASK-PORTAL-013: Parent Portal Invoices Page
 *
 * Filter controls for the invoices list:
 * - Status dropdown (All, Paid, Pending, Overdue)
 * - Date range picker (start date, end date)
 * - Clear filters button
 * - Uses URL search params for state management
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';

export type InvoiceStatusFilter = 'all' | 'paid' | 'pending' | 'overdue';

interface InvoiceFiltersProps {
  className?: string;
}

const statusOptions: { value: InvoiceStatusFilter; label: string }[] = [
  { value: 'all', label: 'All Invoices' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'overdue', label: 'Overdue' },
];

export function InvoiceFilters({ className }: InvoiceFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current filter values from URL
  const currentStatus = (searchParams.get('status') as InvoiceStatusFilter) || 'all';
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  const startDate = startDateParam ? new Date(startDateParam) : null;
  const endDate = endDateParam ? new Date(endDateParam) : null;

  // Update URL search params
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '' || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      // Reset to page 1 when filters change
      params.delete('page');

      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [router, pathname, searchParams]
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      updateParams({ status: value });
    },
    [updateParams]
  );

  const handleStartDateChange = useCallback(
    (date: Date | null) => {
      updateParams({ startDate: date ? date.toISOString().split('T')[0] : null });
    },
    [updateParams]
  );

  const handleEndDateChange = useCallback(
    (date: Date | null) => {
      updateParams({ endDate: date ? date.toISOString().split('T')[0] : null });
    },
    [updateParams]
  );

  const handleClearFilters = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  const hasActiveFilters = currentStatus !== 'all' || startDate || endDate;

  return (
    <div className={className}>
      {/* Mobile: Vertical stack, Desktop: Horizontal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
        {/* Status Filter */}
        <div className="flex-1 min-w-[160px]">
          <Label htmlFor="status-filter" className="text-sm font-medium mb-1.5 block">
            Status
          </Label>
          <Select value={currentStatus} onValueChange={handleStatusChange}>
            <SelectTrigger id="status-filter" className="w-full">
              <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-2">
          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="start-date" className="text-sm font-medium mb-1.5 block">
              From Date
            </Label>
            <DatePicker
              id="start-date"
              value={startDate}
              onChange={handleStartDateChange}
              placeholder="Start date"
              maxDate={endDate || undefined}
              clearable
              className="w-full"
            />
          </div>

          <div className="flex-1 min-w-[160px]">
            <Label htmlFor="end-date" className="text-sm font-medium mb-1.5 block">
              To Date
            </Label>
            <DatePicker
              id="end-date"
              value={endDate}
              onChange={handleEndDateChange}
              placeholder="End date"
              minDate={startDate || undefined}
              clearable
              className="w-full"
            />
          </div>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-4 w-4" />
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
