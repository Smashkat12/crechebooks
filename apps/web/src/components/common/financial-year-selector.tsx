'use client';

import { Calendar } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface FinancialYear {
  year: number;
  label: string;
  startDate: string;
  endDate: string;
}

interface FinancialYearSelectorProps {
  /** Currently selected financial year (null = all time) */
  value: number | null;
  /** Callback when selection changes */
  onChange: (year: number | null) => void;
  /** Available financial years from API */
  availableYears: FinancialYear[];
  /** Whether to include "All Time" option */
  includeAllTime?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * Tax Year selector dropdown for South African tax years (1 March - 28/29 February).
 * Shows available years based on actual data in the system.
 *
 * Tax year labels follow format: "TY 2025/26" (1 March 2025 - 28 Feb 2026)
 */
export function FinancialYearSelector({
  value,
  onChange,
  availableYears,
  includeAllTime = true,
  isLoading = false,
  className,
}: FinancialYearSelectorProps) {
  if (isLoading) {
    return <Skeleton className={className ?? 'h-10 w-[160px]'} />;
  }

  // If no available years and no all-time option, show placeholder
  if (availableYears.length === 0 && !includeAllTime) {
    return (
      <Select disabled>
        <SelectTrigger className={className ?? 'w-[160px]'}>
          <Calendar className="mr-2 h-4 w-4" />
          <SelectValue placeholder="No data" />
        </SelectTrigger>
      </Select>
    );
  }

  const displayValue = value === null
    ? 'all'
    : value.toString();

  const getDisplayLabel = () => {
    if (value === null) return 'All Time';
    const ty = availableYears.find(y => y.year === value);
    return ty?.label ?? `TY ${value}/${(value + 1).toString().slice(-2)}`;
  };

  return (
    <Select
      value={displayValue}
      onValueChange={(val) => {
        if (val === 'all') {
          onChange(null);
        } else {
          onChange(parseInt(val, 10));
        }
      }}
    >
      <SelectTrigger className={className ?? 'w-[160px]'}>
        <Calendar className="mr-2 h-4 w-4" />
        <SelectValue>{getDisplayLabel()}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {includeAllTime && (
          <SelectItem value="all">All Time</SelectItem>
        )}
        {availableYears.map((fy) => (
          <SelectItem key={fy.year} value={fy.year.toString()}>
            {fy.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
