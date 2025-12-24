'use client';

/**
 * Responsive Table Component
 * TASK-WEB-046: Mobile Responsive Improvements
 *
 * A table that converts to cards on mobile viewports.
 */

import { useBreakpoint } from '@/hooks/useBreakpoint';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Column definition for the responsive table
 */
export interface Column<T> {
  /** Unique key for the column */
  key: string;
  /** Column header label */
  header: string;
  /** Function to render cell content */
  render: (item: T) => React.ReactNode;
  /** Whether to hide this column on mobile cards (default: false) */
  hideOnMobile?: boolean;
  /** CSS class for the cell */
  className?: string;
  /** CSS class for the header */
  headerClassName?: string;
}

export interface ResponsiveTableProps<T> {
  /** Data items to display */
  data: T[];
  /** Column definitions */
  columns: Column<T>[];
  /** Custom renderer for mobile card view (optional) */
  mobileCardRenderer?: (item: T, index: number) => React.ReactNode;
  /** Key extractor function for list rendering */
  keyExtractor?: (item: T, index: number) => string;
  /** Whether the table is loading */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Additional class name for the table container */
  className?: string;
  /** Callback when a row is clicked */
  onRowClick?: (item: T) => void;
}

/**
 * Default mobile card renderer
 */
function DefaultMobileCard<T>({
  item,
  columns,
  onClick,
}: {
  item: T;
  columns: Column<T>[];
  onClick?: (item: T) => void;
}) {
  const visibleColumns = columns.filter((col) => !col.hideOnMobile);

  return (
    <Card
      className={cn(
        'mb-3',
        onClick && 'cursor-pointer hover:bg-muted/50 transition-colors'
      )}
      onClick={() => onClick?.(item)}
    >
      <CardContent className="p-4">
        <div className="space-y-2">
          {visibleColumns.map((column, index) => (
            <div
              key={column.key}
              className={cn(
                'flex justify-between items-start gap-2',
                index === 0 && 'pb-2 border-b'
              )}
            >
              <span className="text-sm text-muted-foreground shrink-0">
                {column.header}
              </span>
              <span
                className={cn(
                  'text-sm text-right',
                  index === 0 && 'font-medium'
                )}
              >
                {column.render(item)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for mobile cards
 */
function MobileCardSkeleton() {
  return (
    <Card className="mb-3 animate-pulse">
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for table rows
 */
function TableRowSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <TableRow className="animate-pulse">
      {Array.from({ length: columnCount }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 bg-muted rounded w-3/4" />
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * Responsive table that shows as table on desktop
 * and as cards on mobile.
 */
export function ResponsiveTable<T>({
  data,
  columns,
  mobileCardRenderer,
  keyExtractor = (_, index) => String(index),
  isLoading = false,
  emptyMessage = 'No data available',
  className,
  onRowClick,
}: ResponsiveTableProps<T>) {
  const { isMobile } = useBreakpoint();

  // Loading state
  if (isLoading) {
    if (isMobile) {
      return (
        <div className={className}>
          {[1, 2, 3].map((i) => (
            <MobileCardSkeleton key={i} />
          ))}
        </div>
      );
    }

    return (
      <div className={cn('rounded-md border', className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.headerClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRowSkeleton key={i} columnCount={columns.length} />
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-12 text-muted-foreground',
          className
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  // Mobile view - cards
  if (isMobile) {
    return (
      <div className={className}>
        {data.map((item, index) =>
          mobileCardRenderer ? (
            <div key={keyExtractor(item, index)}>
              {mobileCardRenderer(item, index)}
            </div>
          ) : (
            <DefaultMobileCard
              key={keyExtractor(item, index)}
              item={item}
              columns={columns}
              onClick={onRowClick}
            />
          )
        )}
      </div>
    );
  }

  // Desktop view - table
  return (
    <div className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className={column.headerClassName}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => (
            <TableRow
              key={keyExtractor(item, index)}
              className={cn(
                onRowClick && 'cursor-pointer hover:bg-muted/50'
              )}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.render(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
