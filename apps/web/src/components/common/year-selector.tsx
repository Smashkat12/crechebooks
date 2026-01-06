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
  className?: string;
}

/**
 * Year selector dropdown component for filtering data by calendar year.
 * Shows available years in descending order (newest first).
 */
export function YearSelector({
  value,
  onChange,
  startYear = 2020,
  endYear = new Date().getFullYear(),
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
        <SelectValue placeholder="Select year" />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={year.toString()}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
