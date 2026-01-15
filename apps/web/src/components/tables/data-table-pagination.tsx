'use client';

/**
 * Data Table Pagination Component
 * TASK-UI-006: Fix Table Pagination
 *
 * Features:
 * - Page size selection (10, 25, 50, 100)
 * - Keyboard navigation support
 * - Loading state handling
 * - Accessible ARIA attributes
 * - "Showing X to Y of Z" results display
 */

import { useCallback, useMemo } from 'react';
import { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  /** Loading state during pagination */
  isLoading?: boolean;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Show "Showing X to Y of Z" text */
  showResultsText?: boolean;
}

export function DataTablePagination<TData>({
  table,
  isLoading = false,
  pageSizeOptions = [10, 25, 50, 100],
  showResultsText = true,
}: DataTablePaginationProps<TData>) {
  // Safely get row counts - these methods can throw when row selection isn't enabled
  let selectedRowCount = 0;
  let filteredRowCount = 0;

  try {
    selectedRowCount = table.getFilteredSelectedRowModel()?.rows?.length ?? 0;
  } catch {
    // Row selection not enabled
  }

  try {
    filteredRowCount = table.getFilteredRowModel()?.rows?.length ?? 0;
  } catch {
    // Filtering not enabled, fall back to core row model
    filteredRowCount = table.getCoreRowModel()?.rows?.length ?? 0;
  }

  const pageCount = table.getPageCount() || 1;
  const currentPage = (table.getState().pagination?.pageIndex ?? 0) + 1;
  const pageSize = table.getState().pagination?.pageSize ?? 25;

  // Calculate display values
  const startItem = filteredRowCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, filteredRowCount);

  // Generate page numbers with ellipsis
  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];
    const maxVisible = 5;

    if (pageCount <= maxVisible + 2) {
      for (let i = 1; i <= pageCount; i++) {
        pages.push(i);
      }
      return pages;
    }

    pages.push(1);

    const halfRange = Math.floor((maxVisible - 3) / 2);
    let startPage = Math.max(2, currentPage - halfRange);
    let endPage = Math.min(pageCount - 1, currentPage + halfRange);

    if (currentPage <= halfRange + 2) {
      endPage = maxVisible - 2;
    } else if (currentPage >= pageCount - halfRange - 1) {
      startPage = pageCount - maxVisible + 3;
    }

    if (startPage > 2) {
      pages.push('ellipsis-start');
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < pageCount - 1) {
      pages.push('ellipsis-end');
    }

    pages.push(pageCount);

    return pages;
  }, [currentPage, pageCount]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isLoading) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          if (table.getCanPreviousPage()) {
            table.previousPage();
          }
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          if (table.getCanNextPage()) {
            table.nextPage();
          }
          break;
        case 'Home':
          e.preventDefault();
          table.setPageIndex(0);
          break;
        case 'End':
          e.preventDefault();
          table.setPageIndex(pageCount - 1);
          break;
        case 'PageUp':
          e.preventDefault();
          table.setPageIndex(Math.max(0, currentPage - 6));
          break;
        case 'PageDown':
          e.preventDefault();
          table.setPageIndex(Math.min(pageCount - 1, currentPage + 4));
          break;
      }
    },
    [isLoading, table, pageCount, currentPage]
  );

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-2',
        isLoading && 'opacity-60 pointer-events-none'
      )}
      role="navigation"
      aria-label="Table pagination"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Left side: Selection info and results text */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {selectedRowCount > 0 && (
          <span>
            {selectedRowCount} of {filteredRowCount} row(s) selected.
          </span>
        )}
        {showResultsText && filteredRowCount > 0 && (
          <span aria-live="polite">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </span>
            ) : (
              <>
                Showing <span className="font-medium">{startItem}</span> to{' '}
                <span className="font-medium">{endItem}</span> of{' '}
                <span className="font-medium">{filteredRowCount}</span> results
              </>
            )}
          </span>
        )}
      </div>

      {/* Right side: Controls */}
      <div className="flex items-center space-x-4 lg:space-x-6">
        {/* Page size selector */}
        <div className="flex items-center space-x-2">
          <label htmlFor="rows-per-page" className="text-sm font-medium whitespace-nowrap">
            Rows per page
          </label>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
            disabled={isLoading}
          >
            <SelectTrigger id="rows-per-page" className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Page info */}
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {currentPage} of {pageCount}
        </div>

        {/* Navigation buttons */}
        <nav className="flex items-center space-x-1" aria-label="Page navigation">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage() || isLoading}
            aria-label="Go to first page"
            title="First page (Home)"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage() || isLoading}
            aria-label="Go to previous page"
            title="Previous page (Left arrow)"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page number buttons (hidden on small screens) */}
          <div className="hidden md:flex items-center space-x-1" role="group" aria-label="Page numbers">
            {pageNumbers.map((pageNum) =>
              pageNum === 'ellipsis-start' || pageNum === 'ellipsis-end' ? (
                <span
                  key={pageNum}
                  className="px-2 text-muted-foreground select-none"
                  aria-hidden="true"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? 'default' : 'outline'}
                  className={cn(
                    'h-8 w-8 p-0',
                    currentPage === pageNum && 'font-semibold'
                  )}
                  onClick={() => table.setPageIndex(pageNum - 1)}
                  disabled={isLoading}
                  aria-label={`Page ${pageNum}${currentPage === pageNum ? ', current page' : ''}`}
                  aria-current={currentPage === pageNum ? 'page' : undefined}
                >
                  {pageNum}
                </Button>
              )
            )}
          </div>

          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage() || isLoading}
            aria-label="Go to next page"
            title="Next page (Right arrow)"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage() || isLoading}
            aria-label="Go to last page"
            title="Last page (End)"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </div>
  );
}
