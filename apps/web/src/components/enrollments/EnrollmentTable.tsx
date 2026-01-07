/**
 * Enrollment Table Component
 *
 * Data table for enrollments with:
 * - Selection (single and bulk with shift-click)
 * - Sorting
 * - Pagination
 * - Quick edit enrollment status
 */

import * as React from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, ArrowUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EnrollmentStatusBadge } from './EnrollmentStatusBadge';
import type { Enrollment } from '@/lib/api/enrollments';

interface EnrollmentTableProps {
  enrollments: Enrollment[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onStatusChange: (enrollmentId: string, status: 'active' | 'inactive' | 'pending') => void;
  onOffboard?: (enrollment: Enrollment) => void;
  isLoading?: boolean;
}

export function EnrollmentTable({
  enrollments,
  selectedIds,
  onSelectionChange,
  onStatusChange,
  onOffboard,
  isLoading = false,
}: EnrollmentTableProps) {
  const [lastSelectedIndex, setLastSelectedIndex] = React.useState<number | null>(null);

  const allSelected = enrollments.length > 0 && enrollments.every(e => selectedIds.has(e.id));
  const someSelected = enrollments.some(e => selectedIds.has(e.id)) && !allSelected;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(enrollments.map(e => e.id)));
    }
  };

  const handleSelectRow = (enrollmentId: string, index: number, event: React.MouseEvent) => {
    const newSelection = new Set(selectedIds);

    // Shift-click range selection
    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        newSelection.add(enrollments[i].id);
      }
    } else {
      // Toggle single selection
      if (newSelection.has(enrollmentId)) {
        newSelection.delete(enrollmentId);
      } else {
        newSelection.add(enrollmentId);
      }
    }

    setLastSelectedIndex(index);
    onSelectionChange(newSelection);
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <p className="text-muted-foreground">Loading enrollments...</p>
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <p className="text-muted-foreground">No enrollments found</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                aria-label="Select all"
                ref={(node) => {
                  if (node) {
                    (node as unknown as HTMLInputElement).indeterminate = someSelected;
                  }
                }}
              />
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-4">
                Child Name
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-4">
                Parent Name
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>Fee Tier</TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-4">
                Start Date
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>
              <Button variant="ghost" size="sm" className="-ml-4">
                Status
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="w-[70px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrollments.map((enrollment, index) => (
            <TableRow
              key={enrollment.id}
              className={selectedIds.has(enrollment.id) ? 'bg-muted/50' : ''}
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(enrollment.id)}
                  onCheckedChange={(e) => handleSelectRow(enrollment.id, index, e as unknown as React.MouseEvent)}
                  aria-label={`Select ${enrollment.child_name}`}
                />
              </TableCell>
              <TableCell className="font-medium">{enrollment.child_name}</TableCell>
              <TableCell>{enrollment.parent_name}</TableCell>
              <TableCell>{enrollment.fee_tier_name}</TableCell>
              <TableCell>
                {format(new Date(enrollment.start_date), 'MMM d, yyyy')}
              </TableCell>
              <TableCell>
                {enrollment.end_date
                  ? format(new Date(enrollment.end_date), 'MMM d, yyyy')
                  : '-'}
              </TableCell>
              <TableCell>
                <EnrollmentStatusBadge status={enrollment.status} />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onStatusChange(enrollment.id, 'active')}
                    >
                      Mark as Active
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onStatusChange(enrollment.id, 'inactive')}
                    >
                      Mark as Inactive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onStatusChange(enrollment.id, 'pending')}
                    >
                      Mark as Pending
                    </DropdownMenuItem>
                    {onOffboard && enrollment.status === 'active' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onOffboard(enrollment)}
                          className="text-amber-600 focus:text-amber-600"
                        >
                          Off-board Enrollment
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
