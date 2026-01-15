'use client';

/**
 * Responsive Table Component
 * TASK-UI-008: Fix Mobile Responsiveness
 *
 * Features:
 * - Horizontal scroll wrapper for tables on mobile
 * - Card view option for mobile
 * - Touch-friendly interactions
 * - Sticky header support
 * - Loading and empty states
 */

import * as React from 'react';
import { useMobile } from '@/hooks/use-mobile';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

/**
 * Column definition for the responsive table
 */
export interface TableColumn<T> {
  /** Unique key for the column */
  key: string;
  /** Column header label */
  header: string;
  /** Function to render cell content */
  render: (item: T, index: number) => React.ReactNode;
  /** Whether to hide this column on mobile cards (default: false) */
  hideOnMobile?: boolean;
  /** Make this the primary field shown first on mobile cards */
  isPrimary?: boolean;
  /** CSS class for the cell */
  className?: string;
  /** CSS class for the header */
  headerClassName?: string;
  /** Minimum width for the column */
  minWidth?: string;
  /** Sticky column (always visible when scrolling horizontally) */
  sticky?: 'left' | 'right';
}

export interface ResponsiveTableProps<T> {
  /** Data items to display */
  data: T[];
  /** Column definitions */
  columns: TableColumn<T>[];
  /** Custom renderer for mobile card view */
  mobileCardRender?: (item: T, index: number) => React.ReactNode;
  /** Key extractor function for list rendering */
  keyExtractor?: (item: T, index: number) => string;
  /** Whether the table is loading */
  isLoading?: boolean;
  /** Number of skeleton rows to show when loading */
  loadingRows?: number;
  /** Empty state message */
  emptyMessage?: string;
  /** Empty state component */
  emptyComponent?: React.ReactNode;
  /** Additional class name for the container */
  className?: string;
  /** Callback when a row is clicked */
  onRowClick?: (item: T, index: number) => void;
  /** Force card view regardless of screen size */
  forceCardView?: boolean;
  /** Force table view regardless of screen size */
  forceTableView?: boolean;
  /** Enable sticky header */
  stickyHeader?: boolean;
  /** Maximum height for scrollable table */
  maxHeight?: string;
  /** Row hover effect */
  hoverEffect?: boolean;
  /** Striped rows */
  striped?: boolean;
  /** Compact mode with less padding */
  compact?: boolean;
}

// ============================================================================
// Mobile Card Component
// ============================================================================

interface MobileCardProps<T> {
  item: T;
  index: number;
  columns: TableColumn<T>[];
  onClick?: (item: T, index: number) => void;
}

function MobileCard<T>({ item, index, columns, onClick }: MobileCardProps<T>) {
  const visibleColumns = columns.filter((col) => !col.hideOnMobile);
  const primaryColumn = visibleColumns.find((col) => col.isPrimary);
  const otherColumns = primaryColumn
    ? visibleColumns.filter((col) => col.key !== primaryColumn.key)
    : visibleColumns.slice(1);

  const firstColumn = primaryColumn || visibleColumns[0];

  return (
    <Card
      className={cn(
        'mb-3 transition-colors',
        onClick && 'cursor-pointer hover:bg-muted/50 active:scale-[0.99]'
      )}
      onClick={() => onClick?.(item, index)}
    >
      <CardContent className="p-4">
        {/* Primary/First field - emphasized */}
        {firstColumn && (
          <div className="pb-3 mb-3 border-b">
            <span className="text-xs text-muted-foreground block mb-1">
              {firstColumn.header}
            </span>
            <span className="font-medium">
              {firstColumn.render(item, index)}
            </span>
          </div>
        )}

        {/* Other fields in a grid */}
        <div className="grid grid-cols-2 gap-3">
          {otherColumns.map((column) => (
            <div key={column.key} className="min-w-0">
              <span className="text-xs text-muted-foreground block mb-1 truncate">
                {column.header}
              </span>
              <span className="text-sm block truncate">
                {column.render(item, index)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Loading Skeletons
// ============================================================================

function TableRowSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <TableRow>
      {Array.from({ length: columnCount }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full max-w-[200px]" />
        </TableCell>
      ))}
    </TableRow>
  );
}

function MobileCardSkeleton() {
  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="pb-3 mb-3 border-b">
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({
  message,
  component,
}: {
  message?: string;
  component?: React.ReactNode;
}) {
  if (component) {
    return <>{component}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-12 w-12 mb-4 opacity-50"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p>{message || 'No data available'}</p>
    </div>
  );
}

// ============================================================================
// Responsive Table Component
// ============================================================================

/**
 * A responsive table component that:
 * - Shows a horizontally scrollable table on desktop
 * - Shows cards on mobile (can be overridden)
 * - Supports loading and empty states
 * - Has touch-friendly interactions
 */
export function ResponsiveTable<T>({
  data,
  columns,
  mobileCardRender,
  keyExtractor = (_, index) => String(index),
  isLoading = false,
  loadingRows = 3,
  emptyMessage,
  emptyComponent,
  className,
  onRowClick,
  forceCardView = false,
  forceTableView = false,
  stickyHeader = false,
  maxHeight,
  hoverEffect = true,
  striped = false,
  compact = false,
}: ResponsiveTableProps<T>) {
  const isMobile = useMobile();

  // Determine view mode
  const showCards =
    forceCardView || (!forceTableView && isMobile && !forceTableView);

  // Loading state
  if (isLoading) {
    if (showCards) {
      return (
        <div className={className}>
          {Array.from({ length: loadingRows }).map((_, i) => (
            <MobileCardSkeleton key={i} />
          ))}
        </div>
      );
    }

    return (
      <div
        className={cn(
          'rounded-md border overflow-hidden',
          className
        )}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      column.headerClassName,
                      column.minWidth && `min-w-[${column.minWidth}]`
                    )}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: loadingRows }).map((_, i) => (
                <TableRowSkeleton key={i} columnCount={columns.length} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={className}>
        <EmptyState message={emptyMessage} component={emptyComponent} />
      </div>
    );
  }

  // Mobile card view
  if (showCards) {
    return (
      <div className={className}>
        {data.map((item, index) =>
          mobileCardRender ? (
            <div key={keyExtractor(item, index)}>
              {mobileCardRender(item, index)}
            </div>
          ) : (
            <MobileCard
              key={keyExtractor(item, index)}
              item={item}
              index={index}
              columns={columns}
              onClick={onRowClick}
            />
          )
        )}
      </div>
    );
  }

  // Desktop table view with horizontal scroll
  return (
    <div
      className={cn(
        'rounded-md border overflow-hidden',
        className
      )}
    >
      {/* Horizontal scroll wrapper - TASK-UI-008 */}
      <div
        className={cn(
          'overflow-x-auto',
          // Negative margin trick to extend scroll area on mobile
          '-mx-4 px-4 md:mx-0 md:px-0',
          maxHeight && 'overflow-y-auto',
          // Smooth scrolling and momentum on touch devices
          'scroll-smooth',
          // Touch-friendly scrollbar
          'scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent'
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <div className="inline-block min-w-full align-middle">
          <Table>
            <TableHeader
              className={cn(
                stickyHeader && 'sticky top-0 bg-background z-10'
              )}
            >
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      'whitespace-nowrap',
                      compact ? 'px-3 py-2' : 'px-4 py-3',
                      column.headerClassName,
                      column.minWidth && `min-w-[${column.minWidth}]`,
                      column.sticky === 'left' &&
                        'sticky left-0 bg-background z-10',
                      column.sticky === 'right' &&
                        'sticky right-0 bg-background z-10'
                    )}
                  >
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
                    onRowClick && 'cursor-pointer',
                    hoverEffect && 'hover:bg-muted/50',
                    striped && index % 2 === 1 && 'bg-muted/25',
                    // Touch feedback
                    onRowClick && 'active:bg-muted/75 transition-colors'
                  )}
                  onClick={() => onRowClick?.(item, index)}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        'whitespace-nowrap',
                        compact ? 'px-3 py-2' : 'px-4 py-4',
                        column.className,
                        column.sticky === 'left' &&
                          'sticky left-0 bg-background',
                        column.sticky === 'right' &&
                          'sticky right-0 bg-background'
                      )}
                    >
                      {column.render(item, index)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Horizontal Scroll Table Wrapper (Simple Version)
// ============================================================================

/**
 * Simple wrapper to make any table horizontally scrollable on mobile
 */
export function ScrollableTableWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-x-auto -mx-4 md:mx-0',
        'scroll-smooth',
        className
      )}
    >
      <div className="inline-block min-w-full align-middle px-4 md:px-0">
        {children}
      </div>
    </div>
  );
}

export default ResponsiveTable;
