'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import type { StatementStatus } from '@/hooks/use-statements';

interface StatementFiltersProps {
  status: StatementStatus | 'all';
  onStatusChange: (status: StatementStatus | 'all') => void;
  periodStart: string;
  onPeriodStartChange: (date: string) => void;
  periodEnd: string;
  onPeriodEndChange: (date: string) => void;
  onReset: () => void;
}

export function StatementFilters({
  status,
  onStatusChange,
  periodStart,
  onPeriodStartChange,
  periodEnd,
  onPeriodEndChange,
  onReset,
}: StatementFiltersProps) {
  const hasFilters = status !== 'all' || periodStart || periodEnd;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Select value={status} onValueChange={(v) => onStatusChange(v as StatementStatus | 'all')}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="DRAFT">Draft</SelectItem>
          <SelectItem value="FINAL">Final</SelectItem>
          <SelectItem value="DELIVERED">Delivered</SelectItem>
          <SelectItem value="CANCELLED">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Period:</span>
        <Input
          type="date"
          value={periodStart}
          onChange={(e) => onPeriodStartChange(e.target.value)}
          className="w-[150px]"
          placeholder="From"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={periodEnd}
          onChange={(e) => onPeriodEndChange(e.target.value)}
          className="w-[150px]"
          placeholder="To"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X className="mr-2 h-4 w-4" />
          Reset
        </Button>
      )}
    </div>
  );
}
