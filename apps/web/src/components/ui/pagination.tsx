'use client';

/**
 * Pagination Component
 * TASK-UI-006: Fix Table Pagination
 *
 * Features:
 * - Proper pagination component with page navigation
 * - Support page size selection (10, 25, 50, 100)
 * - Show total count and current range
 * - Remember pagination state in URL
 * - Handle empty states and edge cases
 * - Keyboard navigation support
 * - Loading states during page changes
 * - Accessible ARIA attributes
 */

import * as React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PaginationProps {
  /** Total number of items */
  total: number;
  /** Default page size (default: 25) */
  pageSize?: number;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Show total count text */
  showTotal?: boolean;
  /** Show page size selector */
  showSizeSelector?: boolean;
  /** Maximum number of page buttons to show */
  maxPageButtons?: number;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
  /** Callback when page size changes */
  onPageSizeChange?: (size: number) => void;
  /** Whether to sync state with URL */
  syncWithUrl?: boolean;
  /** Additional class name */
  className?: string;
  /** Custom page parameter name for URL */
  pageParam?: string;
  /** Custom size parameter name for URL */
  sizeParam?: string;
  /** Loading state during page changes */
  isLoading?: boolean;
  /** Current page (for controlled mode) */
  currentPage?: number;
  /** Current page size (for controlled mode) */
  currentPageSize?: number;
}

export function Pagination({
  total,
  pageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  showTotal = true,
  showSizeSelector = true,
  maxPageButtons = 5,
  onPageChange,
  onPageSizeChange,
  syncWithUrl = true,
  className,
  pageParam = 'page',
  sizeParam = 'size',
  isLoading = false,
  currentPage: controlledPage,
  currentPageSize: controlledPageSize,
}: PaginationProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const paginationRef = React.useRef<HTMLDivElement>(null);

  // Get current values from URL or defaults
  const urlPage = syncWithUrl
    ? Number(searchParams.get(pageParam)) || 1
    : 1;
  const urlSize = syncWithUrl
    ? Number(searchParams.get(sizeParam)) || pageSize
    : pageSize;

  // Internal state for non-URL mode
  const [internalPage, setInternalPage] = React.useState(1);
  const [internalSize, setInternalSize] = React.useState(pageSize);

  // Determine page and size based on mode (controlled > URL > internal)
  const page = controlledPage ?? (syncWithUrl ? urlPage : internalPage);
  const size = controlledPageSize ?? (syncWithUrl ? urlSize : internalSize);

  // Calculate pagination values
  const totalPages = Math.max(1, Math.ceil(total / size));
  const startItem = total === 0 ? 0 : (page - 1) * size + 1;
  const endItem = Math.min(page * size, total);

  // Ensure current page is valid
  React.useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      handlePageChange(totalPages);
    }
  }, [total, size]);

  // Update URL parameters
  const updateParams = React.useCallback(
    (newPage: number, newSize: number) => {
      if (!syncWithUrl) return;

      const params = new URLSearchParams(searchParams.toString());
      params.set(pageParam, newPage.toString());
      params.set(sizeParam, newSize.toString());
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname, syncWithUrl, pageParam, sizeParam]
  );

  const handlePageChange = React.useCallback(
    (newPage: number) => {
      const validPage = Math.max(1, Math.min(newPage, totalPages));

      if (syncWithUrl) {
        updateParams(validPage, size);
      } else {
        setInternalPage(validPage);
      }

      onPageChange?.(validPage);
    },
    [totalPages, size, syncWithUrl, updateParams, onPageChange]
  );

  const handlePageSizeChange = React.useCallback(
    (newSize: string) => {
      const sizeNum = Number(newSize);

      if (syncWithUrl) {
        // Reset to page 1 when changing page size
        updateParams(1, sizeNum);
      } else {
        setInternalSize(sizeNum);
        setInternalPage(1);
      }

      onPageSizeChange?.(sizeNum);
    },
    [syncWithUrl, updateParams, onPageSizeChange]
  );

  // Generate page numbers to display with ellipsis
  const getPageNumbers = React.useMemo((): (number | 'ellipsis-start' | 'ellipsis-end')[] => {
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];

    if (totalPages <= maxPageButtons + 2) {
      // Show all pages if total is manageable
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      // Calculate range around current page
      const halfRange = Math.floor((maxPageButtons - 3) / 2);
      let startPage = Math.max(2, page - halfRange);
      let endPage = Math.min(totalPages - 1, page + halfRange);

      // Adjust if we're near the start or end
      if (page <= halfRange + 2) {
        endPage = maxPageButtons - 2;
      } else if (page >= totalPages - halfRange - 1) {
        startPage = totalPages - maxPageButtons + 3;
      }

      // Add ellipsis if needed before range
      if (startPage > 2) {
        pages.push('ellipsis-start');
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      // Add ellipsis if needed after range
      if (endPage < totalPages - 1) {
        pages.push('ellipsis-end');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  }, [page, totalPages, maxPageButtons]);

  // Keyboard navigation handler
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (isLoading) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          if (page > 1) handlePageChange(page - 1);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          if (page < totalPages) handlePageChange(page + 1);
          break;
        case 'Home':
          e.preventDefault();
          handlePageChange(1);
          break;
        case 'End':
          e.preventDefault();
          handlePageChange(totalPages);
          break;
      }
    },
    [page, totalPages, isLoading, handlePageChange]
  );

  // Don't render if no items
  if (total === 0) {
    return null;
  }

  // Single page - show minimal UI
  if (totalPages === 1 && !showSizeSelector) {
    return showTotal ? (
      <div className={cn('px-4 py-3 text-sm text-muted-foreground', className)}>
        Showing {startItem}-{endItem} of {total}
      </div>
    ) : null;
  }

  const pageNumbers = getPageNumbers;

  return (
    <div
      ref={paginationRef}
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t',
        isLoading && 'opacity-60 pointer-events-none',
        className
      )}
      role="navigation"
      aria-label="Pagination"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Left side: Total count and page size selector */}
      <div className="flex items-center gap-4">
        {showTotal && (
          <span className="text-sm text-muted-foreground whitespace-nowrap" aria-live="polite">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </span>
            ) : (
              <>
                Showing <span className="font-medium">{startItem}</span> to{' '}
                <span className="font-medium">{endItem}</span> of{' '}
                <span className="font-medium">{total}</span> results
              </>
            )}
          </span>
        )}

        {showSizeSelector && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="page-size-select"
              className="text-sm text-muted-foreground whitespace-nowrap"
            >
              Per page:
            </label>
            <Select
              value={size.toString()}
              onValueChange={handlePageSizeChange}
              disabled={isLoading}
            >
              <SelectTrigger id="page-size-select" className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={option.toString()}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Right side: Page navigation */}
      <nav className="flex items-center gap-1" aria-label="Page navigation">
        {/* First page button */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 hidden sm:flex"
          onClick={() => handlePageChange(1)}
          disabled={page === 1 || isLoading}
          aria-label="Go to first page"
          title="First page (Home)"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        {/* Previous page button */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1 || isLoading}
          aria-label="Go to previous page"
          title="Previous page (Left arrow)"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Page numbers */}
        <div className="flex items-center gap-1" role="group" aria-label="Page numbers">
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
                variant={page === pageNum ? 'default' : 'outline'}
                size="icon"
                className={cn(
                  'h-8 w-8 min-w-[2rem]',
                  page === pageNum && 'font-semibold'
                )}
                onClick={() => handlePageChange(pageNum)}
                disabled={isLoading}
                aria-label={`Page ${pageNum}${page === pageNum ? ', current page' : ''}`}
                aria-current={page === pageNum ? 'page' : undefined}
              >
                {pageNum}
              </Button>
            )
          )}
        </div>

        {/* Next page button */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages || isLoading}
          aria-label="Go to next page"
          title="Next page (Right arrow)"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Last page button */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 hidden sm:flex"
          onClick={() => handlePageChange(totalPages)}
          disabled={page === totalPages || isLoading}
          aria-label="Go to last page"
          title="Last page (End)"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
}

/**
 * Compact pagination for smaller spaces
 */
export interface CompactPaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
  isLoading?: boolean;
}

export function CompactPagination({
  total,
  page,
  pageSize,
  onPageChange,
  className,
  isLoading = false,
}: CompactPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        isLoading && 'opacity-60',
        className
      )}
      role="navigation"
      aria-label="Compact pagination"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1 || isLoading}
        className="h-7 px-2"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span
        className="text-sm text-muted-foreground whitespace-nowrap min-w-[60px] text-center"
        aria-live="polite"
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin mx-auto" />
        ) : (
          `${page} / ${totalPages}`
        )}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages || isLoading}
        className="h-7 px-2"
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Server-side pagination props for data tables
 * Use this interface when implementing server-side pagination
 */
export interface ServerPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isLoading?: boolean;
}

/**
 * Server-side pagination component
 * Designed for server-side pagination where page changes trigger API calls
 */
export function ServerPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
}: ServerPaginationProps) {
  return (
    <Pagination
      total={totalItems}
      currentPage={currentPage}
      currentPageSize={pageSize}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      isLoading={isLoading}
      syncWithUrl={false}
    />
  );
}

export default Pagination;
