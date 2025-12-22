/**
 * Enrollment Filters Component
 * REQ-BILL-009: Enrollment Register UI
 *
 * @description Filter controls for enrollment table:
 * - Status filter (ACTIVE, PENDING, SUSPENDED, EXITED)
 * - Parent filter
 * - Search by child name
 */

import * as React from 'react';
import { EnrollmentStatus } from '@crechebooks/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EnrollmentFiltersState {
  status: EnrollmentStatus | 'all';
  parentId?: string;
  search?: string;
}

interface EnrollmentFiltersProps {
  filters: EnrollmentFiltersState;
  onFiltersChange: (filters: EnrollmentFiltersState) => void;
  className?: string;
}

export function EnrollmentFilters({
  filters,
  onFiltersChange,
  className,
}: EnrollmentFiltersProps) {
  const handleStatusChange = (value: string) => {
    onFiltersChange({
      ...filters,
      status: value as EnrollmentStatus | 'all',
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({
      ...filters,
      search: e.target.value || undefined,
    });
  };

  return (
    <div className={cn('grid gap-4 md:grid-cols-3', className)}>
      {/* Search by child name */}
      <div className="space-y-2">
        <Label htmlFor="search">Search Child</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            placeholder="Search by child name..."
            value={filters.search || ''}
            onChange={handleSearchChange}
            className="pl-8"
          />
        </div>
      </div>

      {/* Status filter */}
      <div className="space-y-2">
        <Label htmlFor="status">Enrollment Status</Label>
        <Select value={filters.status} onValueChange={handleStatusChange}>
          <SelectTrigger id="status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value={EnrollmentStatus.ACTIVE}>Active</SelectItem>
            <SelectItem value={EnrollmentStatus.PENDING}>Pending</SelectItem>
            <SelectItem value={EnrollmentStatus.SUSPENDED}>Suspended</SelectItem>
            <SelectItem value={EnrollmentStatus.EXITED}>Exited</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Parent filter - TODO: Could be enhanced with a searchable parent dropdown */}
      <div className="space-y-2">
        <Label htmlFor="parent">Filter by Parent</Label>
        <Input
          id="parent"
          placeholder="Parent ID (optional)"
          value={filters.parentId || ''}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              parentId: e.target.value || undefined,
            })
          }
        />
      </div>
    </div>
  );
}
