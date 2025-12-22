'use client';

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface PeriodSelectorProps {
  value: string;
  onChange: (period: string) => void;
  type?: 'monthly' | 'bimonthly';
  yearsBack?: number;
  label?: string;
}

export function PeriodSelector({
  value,
  onChange,
  type = 'monthly',
  yearsBack = 2,
  label = 'Tax Period',
}: PeriodSelectorProps) {
  const periods = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    for (let year = currentYear; year >= currentYear - yearsBack; year--) {
      const maxMonth = year === currentYear ? currentMonth : 12;

      if (type === 'bimonthly') {
        // VAT periods are bi-monthly
        for (let period = Math.ceil(maxMonth / 2); period >= 1; period--) {
          const startMonth = (period - 1) * 2 + 1;
          const endMonth = period * 2;
          const startMonthName = new Date(year, startMonth - 1).toLocaleString('en-ZA', { month: 'short' });
          const endMonthName = new Date(year, endMonth - 1).toLocaleString('en-ZA', { month: 'short' });
          result.push({
            value: `${year}-${String(endMonth).padStart(2, '0')}`,
            label: `${startMonthName} - ${endMonthName} ${year}`,
          });
        }
      } else {
        // Monthly periods
        for (let month = maxMonth; month >= 1; month--) {
          const monthName = new Date(year, month - 1).toLocaleString('en-ZA', { month: 'long' });
          result.push({
            value: `${year}-${String(month).padStart(2, '0')}`,
            label: `${monthName} ${year}`,
          });
        }
      }
    }

    return result;
  }, [type, yearsBack]);

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          {periods.map((period) => (
            <SelectItem key={period.value} value={period.value}>
              {period.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
