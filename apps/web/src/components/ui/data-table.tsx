'use client';

/**
 * Data Table Component with Server-Side Pagination
 * TASK-UI-006: Fix Table Pagination
 *
 * Features:
 * - Server-side pagination support
 * - Loading states during page changes
 * - Keyboard navigation
 * - Page size selection (10, 25, 50, 100)
 * - "Showing X to Y of Z results" display
 * - Empty state handling
 */

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useMemo } from "react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  pagination?: {
    pageIndex: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
  onPaginationChange?: (pagination: {
    pageIndex: number;
    pageSize: number;
  }) => void;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Empty state message */
  emptyMessage?: string;
  /** Show page size selector */
  showPageSizeSelector?: boolean;
  /** Additional class name for the container */
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  pagination,
  onPaginationChange,
  pageSizeOptions = [10, 25, 50, 100],
  emptyMessage = "No results.",
  showPageSizeSelector = true,
  className,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: !!pagination,
    pageCount: pagination?.totalPages ?? -1,
    state: {
      pagination: pagination
        ? {
            pageIndex: pagination.pageIndex,
            pageSize: pagination.pageSize,
          }
        : undefined,
    },
  });

  // Calculate display values
  const startItem = pagination
    ? pagination.pageIndex * pagination.pageSize + 1
    : 1;
  const endItem = pagination
    ? Math.min((pagination.pageIndex + 1) * pagination.pageSize, pagination.totalCount)
    : data.length;

  // Generate page numbers with ellipsis
  const pageNumbers = useMemo(() => {
    if (!pagination) return [];

    const { totalPages } = pagination;
    const currentPage = pagination.pageIndex + 1;
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    // Always show first page
    pages.push(1);

    // Calculate range around current page
    const halfRange = Math.floor((maxVisible - 3) / 2);
    let startPage = Math.max(2, currentPage - halfRange);
    let endPage = Math.min(totalPages - 1, currentPage + halfRange);

    if (currentPage <= halfRange + 2) {
      endPage = maxVisible - 2;
    } else if (currentPage >= totalPages - halfRange - 1) {
      startPage = totalPages - maxVisible + 3;
    }

    if (startPage > 2) {
      pages.push('ellipsis-start');
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages - 1) {
      pages.push('ellipsis-end');
    }

    pages.push(totalPages);

    return pages;
  }, [pagination]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!pagination || !onPaginationChange || isLoading) return;

      const { pageIndex, pageSize, totalPages } = pagination;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (pageIndex > 0) {
            onPaginationChange({ pageIndex: pageIndex - 1, pageSize });
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (pageIndex < totalPages - 1) {
            onPaginationChange({ pageIndex: pageIndex + 1, pageSize });
          }
          break;
        case 'Home':
          e.preventDefault();
          onPaginationChange({ pageIndex: 0, pageSize });
          break;
        case 'End':
          e.preventDefault();
          onPaginationChange({ pageIndex: totalPages - 1, pageSize });
          break;
      }
    },
    [pagination, onPaginationChange, isLoading]
  );

  // Handle page size change
  const handlePageSizeChange = useCallback(
    (value: string) => {
      if (!pagination || !onPaginationChange) return;
      onPaginationChange({ pageIndex: 0, pageSize: Number(value) });
    },
    [pagination, onPaginationChange]
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Loading...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && onPaginationChange && (
        <div
          className={cn(
            "flex flex-col sm:flex-row items-center justify-between gap-4 px-2",
            isLoading && "opacity-60 pointer-events-none"
          )}
          role="navigation"
          aria-label="Table pagination"
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {/* Left side: Results text and page size selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground whitespace-nowrap" aria-live="polite">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </span>
              ) : (
                <>
                  Showing <span className="font-medium">{startItem}</span> to{" "}
                  <span className="font-medium">{endItem}</span> of{" "}
                  <span className="font-medium">{pagination.totalCount}</span> results
                </>
              )}
            </span>

            {showPageSizeSelector && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="table-page-size"
                  className="text-sm text-muted-foreground whitespace-nowrap"
                >
                  Per page:
                </label>
                <Select
                  value={pagination.pageSize.toString()}
                  onValueChange={handlePageSizeChange}
                  disabled={isLoading}
                >
                  <SelectTrigger id="table-page-size" className="h-8 w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Right side: Page navigation */}
          <nav className="flex items-center gap-1" aria-label="Page navigation">
            {/* First page */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 hidden sm:flex"
              onClick={() =>
                onPaginationChange({
                  pageIndex: 0,
                  pageSize: pagination.pageSize,
                })
              }
              disabled={pagination.pageIndex === 0 || isLoading}
              aria-label="Go to first page"
              title="First page (Home)"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            {/* Previous page */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                onPaginationChange({
                  pageIndex: pagination.pageIndex - 1,
                  pageSize: pagination.pageSize,
                })
              }
              disabled={pagination.pageIndex === 0 || isLoading}
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
                    variant={pagination.pageIndex + 1 === pageNum ? 'default' : 'outline'}
                    size="icon"
                    className={cn(
                      'h-8 w-8 min-w-[2rem]',
                      pagination.pageIndex + 1 === pageNum && 'font-semibold'
                    )}
                    onClick={() =>
                      onPaginationChange({
                        pageIndex: pageNum - 1,
                        pageSize: pagination.pageSize,
                      })
                    }
                    disabled={isLoading}
                    aria-label={`Page ${pageNum}${pagination.pageIndex + 1 === pageNum ? ', current page' : ''}`}
                    aria-current={pagination.pageIndex + 1 === pageNum ? 'page' : undefined}
                  >
                    {pageNum}
                  </Button>
                )
              )}
            </div>

            {/* Next page */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                onPaginationChange({
                  pageIndex: pagination.pageIndex + 1,
                  pageSize: pagination.pageSize,
                })
              }
              disabled={pagination.pageIndex >= pagination.totalPages - 1 || isLoading}
              aria-label="Go to next page"
              title="Next page (Right arrow)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Last page */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 hidden sm:flex"
              onClick={() =>
                onPaginationChange({
                  pageIndex: pagination.totalPages - 1,
                  pageSize: pagination.pageSize,
                })
              }
              disabled={pagination.pageIndex >= pagination.totalPages - 1 || isLoading}
              aria-label="Go to last page"
              title="Last page (End)"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}
