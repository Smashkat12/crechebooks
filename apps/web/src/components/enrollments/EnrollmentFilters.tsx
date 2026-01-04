/**
 * Enrollment Filters Component
 *
 * Filter toolbar for enrollments with:
 * - Status filter (all/active/inactive/pending)
 * - Fee tier filter
 * - Search input (child name, parent name)
 */

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface EnrollmentFiltersState {
  status?: 'all' | 'active' | 'inactive' | 'pending';
  feeTierId?: string;
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
  const hasActiveFilters = !!(
    filters.status !== 'active' ||
    filters.feeTierId ||
    filters.search
  );

  const handleClearFilters = () => {
    onFiltersChange({
      status: 'active',
    });
  };

  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center', className)}>
      {/* Status Filter */}
      <Select
        value={filters.status || 'active'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            status: value as 'all' | 'active' | 'inactive' | 'pending',
          })
        }
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="all">All Status</SelectItem>
        </SelectContent>
      </Select>

      {/* Fee Tier Filter - Placeholder for now */}
      <Select
        value={filters.feeTierId}
        onValueChange={(value) =>
          onFiltersChange({ ...filters, feeTierId: value })
        }
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Filter by fee tier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Fee Tiers</SelectItem>
          <SelectItem value="tier-1">Standard Tier</SelectItem>
          <SelectItem value="tier-2">Premium Tier</SelectItem>
          <SelectItem value="tier-3">VIP Tier</SelectItem>
        </SelectContent>
      </Select>

      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by child or parent name..."
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
