'use client';

import { Calendar } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Period = 'month' | 'quarter' | 'year' | 'custom';

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  className?: string;
}

const periodOptions: { value: Period; label: string }[] = [
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
];

export function PeriodSelector({ value, onChange, className }: PeriodSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <Calendar className="h-4 w-4 mr-2" />
        <SelectValue placeholder="Select period" />
      </SelectTrigger>
      <SelectContent>
        {periodOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
