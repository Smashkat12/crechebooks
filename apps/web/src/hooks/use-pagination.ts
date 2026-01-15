/**
 * Pagination Hook
 * TASK-UI-006: Fix Table Pagination
 *
 * Features:
 * - URL-synchronized pagination state
 * - Support for page size selection (10, 25, 50, 100)
 * - Calculates total pages and item ranges
 * - Works with React Query for data fetching
 * - Keyboard navigation support
 * - Loading state management
 * - Edge case handling (empty data, single page)
 */

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export interface UsePaginationOptions {
  /** Default page size (default: 25) */
  defaultPageSize?: number;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Whether to sync state with URL (default: true) */
  syncWithUrl?: boolean;
  /** Custom page parameter name for URL (default: 'page') */
  pageParam?: string;
  /** Custom size parameter name for URL (default: 'size') */
  sizeParam?: string;
  /** Total number of items (for calculations) */
  totalItems?: number;
  /** Initial page (for controlled mode) */
  initialPage?: number;
  /** Callback when loading state changes */
  onLoadingChange?: (isLoading: boolean) => void;
  /** Auto-scroll to top on page change */
  scrollToTop?: boolean;
  /** Scroll target element (default: window) */
  scrollTarget?: string;
}

export interface UsePaginationReturn {
  /** Current page number (1-indexed) */
  page: number;
  /** Current page size */
  pageSize: number;
  /** Total number of pages */
  totalPages: number;
  /** First item index (1-indexed) for display */
  startItem: number;
  /** Last item index for display */
  endItem: number;
  /** Offset for database queries (0-indexed) */
  offset: number;
  /** Whether there's a previous page */
  hasPrevious: boolean;
  /** Whether there's a next page */
  hasNext: boolean;
  /** Go to a specific page */
  setPage: (page: number) => void;
  /** Change the page size */
  setPageSize: (size: number) => void;
  /** Go to the next page */
  nextPage: () => void;
  /** Go to the previous page */
  prevPage: () => void;
  /** Go to the first page */
  firstPage: () => void;
  /** Go to the last page */
  lastPage: () => void;
  /** Reset to first page with current page size */
  reset: () => void;
  /** Query params for API calls */
  queryParams: {
    page: number;
    pageSize: number;
    offset: number;
    limit: number;
  };
  /** URL search params string for links */
  searchParamsString: string;
  /** Loading state indicator */
  isLoading: boolean;
  /** Set loading state */
  setIsLoading: (loading: boolean) => void;
  /** Whether the data is empty */
  isEmpty: boolean;
  /** Whether there's only one page */
  isSinglePage: boolean;
  /** Available page size options */
  pageSizeOptions: number[];
  /** Keyboard event handler for navigation */
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Hook for managing pagination state with URL synchronization
 *
 * @example
 * const {
 *   page,
 *   pageSize,
 *   queryParams,
 *   setPage,
 *   setPageSize,
 * } = usePagination({ totalItems: data?.total });
 *
 * const { data } = useQuery({
 *   queryKey: ['items', queryParams],
 *   queryFn: () => fetchItems(queryParams),
 * });
 */
export function usePagination(
  options: UsePaginationOptions = {}
): UsePaginationReturn {
  const {
    defaultPageSize = 25,
    pageSizeOptions = [10, 25, 50, 100],
    syncWithUrl = true,
    pageParam = 'page',
    sizeParam = 'size',
    totalItems = 0,
    initialPage = 1,
    onLoadingChange,
    scrollToTop = false,
    scrollTarget,
  } = options;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoadingState] = useState(false);
  const [internalPage, setInternalPage] = useState(initialPage);
  const [internalPageSize, setInternalPageSize] = useState(defaultPageSize);
  const previousPageRef = useRef<number>(initialPage);

  // Notify loading state changes
  const setIsLoading = useCallback((loading: boolean) => {
    setIsLoadingState(loading);
    onLoadingChange?.(loading);
  }, [onLoadingChange]);

  // Get current values from URL or internal state
  const page = syncWithUrl
    ? Math.max(1, Number(searchParams.get(pageParam)) || 1)
    : internalPage;

  const pageSize = syncWithUrl
    ? Math.max(1, Number(searchParams.get(sizeParam)) || defaultPageSize)
    : internalPageSize;

  // Handle scroll to top on page change
  useEffect(() => {
    if (scrollToTop && previousPageRef.current !== page) {
      previousPageRef.current = page;
      if (scrollTarget) {
        const element = document.querySelector(scrollTarget);
        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [page, scrollToTop, scrollTarget]);

  // Calculate derived values
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(page, totalPages);
  const offset = (validPage - 1) * pageSize;
  const startItem = totalItems === 0 ? 0 : offset + 1;
  const endItem = Math.min(offset + pageSize, totalItems);
  const hasPrevious = validPage > 1;
  const hasNext = validPage < totalPages;

  // Update URL parameters or internal state
  const updateParams = useCallback(
    (newPage: number, newSize: number) => {
      if (syncWithUrl) {
        const params = new URLSearchParams(searchParams.toString());
        params.set(pageParam, newPage.toString());
        params.set(sizeParam, newSize.toString());
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      } else {
        setInternalPage(newPage);
        setInternalPageSize(newSize);
      }
    },
    [searchParams, router, pathname, syncWithUrl, pageParam, sizeParam]
  );

  const setPage = useCallback(
    (newPage: number) => {
      const validNewPage = Math.max(1, Math.min(newPage, totalPages));
      if (validNewPage !== page) {
        updateParams(validNewPage, pageSize);
      }
    },
    [totalPages, pageSize, page, updateParams]
  );

  const setPageSize = useCallback(
    (newSize: number) => {
      // Ensure valid page size
      const validSize = pageSizeOptions.includes(newSize)
        ? newSize
        : defaultPageSize;
      // Reset to page 1 when changing page size
      if (validSize !== pageSize) {
        updateParams(1, validSize);
      }
    },
    [pageSizeOptions, defaultPageSize, pageSize, updateParams]
  );

  const nextPage = useCallback(() => {
    if (hasNext) setPage(validPage + 1);
  }, [hasNext, validPage, setPage]);

  const prevPage = useCallback(() => {
    if (hasPrevious) setPage(validPage - 1);
  }, [hasPrevious, validPage, setPage]);

  const firstPage = useCallback(() => {
    setPage(1);
  }, [setPage]);

  const lastPage = useCallback(() => {
    setPage(totalPages);
  }, [totalPages, setPage]);

  const reset = useCallback(() => {
    updateParams(1, pageSize);
  }, [pageSize, updateParams]);

  // Query params for API calls
  const queryParams = useMemo(
    () => ({
      page: validPage,
      pageSize,
      offset,
      limit: pageSize,
    }),
    [validPage, pageSize, offset]
  );

  // URL search params string for building links
  const searchParamsString = useMemo(() => {
    const params = new URLSearchParams();
    params.set(pageParam, validPage.toString());
    params.set(sizeParam, pageSize.toString());
    return params.toString();
  }, [pageParam, sizeParam, validPage, pageSize]);

  // Helper flags
  const isEmpty = totalItems === 0;
  const isSinglePage = totalPages <= 1;

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (isLoading) return;

      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          prevPage();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          nextPage();
          break;
        case 'Home':
          event.preventDefault();
          firstPage();
          break;
        case 'End':
          event.preventDefault();
          lastPage();
          break;
        case 'PageUp':
          event.preventDefault();
          // Jump back 5 pages or to first
          setPage(Math.max(1, validPage - 5));
          break;
        case 'PageDown':
          event.preventDefault();
          // Jump forward 5 pages or to last
          setPage(Math.min(totalPages, validPage + 5));
          break;
      }
    },
    [isLoading, prevPage, nextPage, firstPage, lastPage, setPage, validPage, totalPages]
  );

  return {
    page: validPage,
    pageSize,
    totalPages,
    startItem,
    endItem,
    offset,
    hasPrevious,
    hasNext,
    setPage,
    setPageSize,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    reset,
    queryParams,
    searchParamsString,
    isLoading,
    setIsLoading,
    isEmpty,
    isSinglePage,
    pageSizeOptions,
    handleKeyDown,
  };
}

/**
 * Hook for pagination with local state (not synced with URL)
 * Useful for modals or sub-components
 */
export function useLocalPagination(
  options: Omit<UsePaginationOptions, 'syncWithUrl'> = {}
): UsePaginationReturn {
  return usePagination({ ...options, syncWithUrl: false });
}

/**
 * Calculate pagination metadata for display
 */
export function getPaginationMeta(
  page: number,
  pageSize: number,
  totalItems: number
) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(page, totalPages);
  const offset = (validPage - 1) * pageSize;
  const startItem = totalItems === 0 ? 0 : offset + 1;
  const endItem = Math.min(offset + pageSize, totalItems);

  return {
    page: validPage,
    pageSize,
    totalPages,
    totalItems,
    startItem,
    endItem,
    offset,
    hasPrevious: validPage > 1,
    hasNext: validPage < totalPages,
    isEmpty: totalItems === 0,
    isSinglePage: totalPages <= 1,
  };
}

/**
 * Generate page numbers array with ellipsis for display
 * @param currentPage - Current active page (1-indexed)
 * @param totalPages - Total number of pages
 * @param maxVisible - Maximum visible page buttons (default: 5)
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];

  if (totalPages <= maxVisible + 2) {
    // Show all pages if total is manageable
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

  // Adjust if near start or end
  if (currentPage <= halfRange + 2) {
    endPage = maxVisible - 2;
  } else if (currentPage >= totalPages - halfRange - 1) {
    startPage = totalPages - maxVisible + 3;
  }

  // Add ellipsis before range if needed
  if (startPage > 2) {
    pages.push('ellipsis-start');
  }

  // Add middle pages
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  // Add ellipsis after range if needed
  if (endPage < totalPages - 1) {
    pages.push('ellipsis-end');
  }

  // Always show last page
  pages.push(totalPages);

  return pages;
}

/**
 * Custom hook for server-side pagination with loading states
 * Integrates well with React Query or SWR
 */
export interface UseServerPaginationOptions extends UsePaginationOptions {
  /** Callback when page changes - use for data fetching */
  onPageChange?: (page: number, pageSize: number) => void;
}

export function useServerPagination(
  options: UseServerPaginationOptions = {}
): UsePaginationReturn & { triggerFetch: () => void } {
  const { onPageChange, ...paginationOptions } = options;
  const pagination = usePagination(paginationOptions);

  // Trigger fetch when page or pageSize changes
  useEffect(() => {
    onPageChange?.(pagination.page, pagination.pageSize);
  }, [pagination.page, pagination.pageSize, onPageChange]);

  const triggerFetch = useCallback(() => {
    onPageChange?.(pagination.page, pagination.pageSize);
  }, [onPageChange, pagination.page, pagination.pageSize]);

  return {
    ...pagination,
    triggerFetch,
  };
}

export default usePagination;
