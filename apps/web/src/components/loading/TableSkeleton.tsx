import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TableSkeletonProps {
  /** Number of rows to display */
  rows?: number;
  /** Number of columns to display */
  columns?: number;
  /** Show toolbar/search area above table */
  showToolbar?: boolean;
  /** Show pagination below table */
  showPagination?: boolean;
  /** Use full table component vs simple divs */
  useTableComponent?: boolean;
}

/**
 * Table skeleton for data table loading states.
 * Can render as full table component or simplified div structure.
 */
export function TableSkeleton({
  rows = 5,
  columns = 5,
  showToolbar = true,
  showPagination = true,
  useTableComponent = true,
}: TableSkeletonProps) {
  if (!useTableComponent) {
    return (
      <div className="space-y-3">
        {showToolbar && (
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-[250px]" />
            <Skeleton className="h-10 w-[100px]" />
          </div>
        )}
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
        {showPagination && (
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-[200px]" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showToolbar && (
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-[250px]" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-[100px]" />
            <Skeleton className="h-10 w-[100px]" />
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, index) => (
                <TableHead key={index}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: columns }).map((_, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <Skeleton
                      className="h-4"
                      style={{ width: `${60 + Math.random() * 40}%` }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between px-2">
          <Skeleton className="h-8 w-[200px]" />
          <div className="flex items-center space-x-6 lg:space-x-8">
            <Skeleton className="h-8 w-[100px]" />
            <Skeleton className="h-8 w-[100px]" />
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact table skeleton without pagination
 */
export function CompactTableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <TableSkeleton
      rows={rows}
      columns={columns}
      showToolbar={false}
      showPagination={false}
    />
  );
}
