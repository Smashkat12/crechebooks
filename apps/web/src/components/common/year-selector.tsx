'use client';

import { Calendar } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface YearSelectorProps {
  value: number;
  onChange: (year: number) => void;
  /** Start year for the range (default: 2020) */
  startYear?: number;
  /** End year for the range (default: current year) */
  endYear?: number;
  /** Include "All Years" option (value: 0) */
  includeAllYears?: boolean;
  className?: string;
}

/**
 * Year selector dropdown component for filtering data by calendar year.
 * Shows available years in descending order (newest first).
 * When includeAllYears is true, adds "All Years" option with value 0.
 */
export function YearSelector({
  value,
  onChange,
  startYear = 2020,
  endYear = new Date().getFullYear(),
  includeAllYears = false,
  className,
}: YearSelectorProps) {
  // Generate years array in descending order
  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => endYear - i
  );

  return (
    <Select
      value={value.toString()}
      onValueChange={(val) => onChange(parseInt(val, 10))}
    >
      <SelectTrigger className={className ?? 'w-[140px]'}>
        <Calendar className="mr-2 h-4 w-4" />
        <SelectValue placeholder="Select year">{value === 0 ? 'All Years' : value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {includeAllYears && (
          <SelectItem value="0">All Years</SelectItem>
        )}
        {years.map((year) => (
          <SelectItem key={year} value={year.toString()}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
