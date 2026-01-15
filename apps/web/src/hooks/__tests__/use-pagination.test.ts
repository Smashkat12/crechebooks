/**
 * usePagination Hook Tests
 * TASK-UI-002: Expand Frontend Test Coverage
 *
 * Tests for pagination hook including:
 * - Page navigation (next, prev, first, last)
 * - Boundary conditions
 * - Page size changes
 * - Total pages calculation
 * - Query params generation
 * - Helper functions (getPaginationMeta, getPageNumbers)
 */

import { renderHook, act } from '@testing-library/react';
import { getPaginationMeta, getPageNumbers } from '../use-pagination';

// Mock Next.js navigation hooks
const mockSearchParams = new URLSearchParams();
const mockPush = jest.fn();
const mockPathname = '/test';

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

// Import after mocking
import { usePagination, useLocalPagination } from '../use-pagination';

describe('usePagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset search params
    mockSearchParams.delete('page');
    mockSearchParams.delete('size');
  });

  describe('initial state', () => {
    it('should have default page 1', () => {
      const { result } = renderHook(() => usePagination({ totalItems: 100 }));

      expect(result.current.page).toBe(1);
    });

    it('should have default page size 25', () => {
      const { result } = renderHook(() => usePagination({ totalItems: 100 }));

      expect(result.current.pageSize).toBe(25);
    });

    it('should respect custom default page size', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 50 })
      );

      expect(result.current.pageSize).toBe(50);
    });

    it('should respect initial page', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, initialPage: 3, syncWithUrl: false })
      );

      expect(result.current.page).toBe(3);
    });
  });

  describe('totalPages calculation', () => {
    it('should calculate total pages correctly', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 10 })
      );

      expect(result.current.totalPages).toBe(10);
    });

    it('should round up for partial pages', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 95, defaultPageSize: 10 })
      );

      expect(result.current.totalPages).toBe(10);
    });

    it('should return 1 for empty data', () => {
      const { result } = renderHook(() => usePagination({ totalItems: 0 }));

      expect(result.current.totalPages).toBe(1);
    });

    it('should return 1 for less than one page', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 5, defaultPageSize: 25 })
      );

      expect(result.current.totalPages).toBe(1);
    });
  });

  describe('item range calculation', () => {
    it('should calculate startItem and endItem for first page', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 10 })
      );

      expect(result.current.startItem).toBe(1);
      expect(result.current.endItem).toBe(10);
    });

    it('should return 0 startItem for empty data', () => {
      const { result } = renderHook(() => usePagination({ totalItems: 0 }));

      expect(result.current.startItem).toBe(0);
      expect(result.current.endItem).toBe(0);
    });

    it('should handle partial last page', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 95, defaultPageSize: 25, syncWithUrl: false })
      );

      // Navigate to last page
      act(() => {
        result.current.lastPage();
      });

      expect(result.current.startItem).toBe(76);
      expect(result.current.endItem).toBe(95);
    });
  });

  describe('offset calculation', () => {
    it('should calculate offset for first page', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 10 })
      );

      expect(result.current.offset).toBe(0);
    });

    it('should calculate offset for subsequent pages', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 10, syncWithUrl: false, initialPage: 3 })
      );

      expect(result.current.offset).toBe(20);
    });
  });

  describe('hasPrevious and hasNext', () => {
    it('should not have previous on first page', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, syncWithUrl: false })
      );

      expect(result.current.hasPrevious).toBe(false);
    });

    it('should have next when there are more pages', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 10, syncWithUrl: false })
      );

      expect(result.current.hasNext).toBe(true);
    });

    it('should not have next on last page', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 10, defaultPageSize: 10, syncWithUrl: false })
      );

      expect(result.current.hasNext).toBe(false);
    });

    it('should have previous when not on first page', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, syncWithUrl: false, initialPage: 2 })
      );

      expect(result.current.hasPrevious).toBe(true);
    });
  });

  describe('isEmpty and isSinglePage flags', () => {
    it('should be empty when totalItems is 0', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 0, syncWithUrl: false })
      );

      expect(result.current.isEmpty).toBe(true);
    });

    it('should not be empty when there are items', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 10, syncWithUrl: false })
      );

      expect(result.current.isEmpty).toBe(false);
    });

    it('should be single page when totalPages is 1', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 10, defaultPageSize: 25, syncWithUrl: false })
      );

      expect(result.current.isSinglePage).toBe(true);
    });

    it('should not be single page when totalPages > 1', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 10, syncWithUrl: false })
      );

      expect(result.current.isSinglePage).toBe(false);
    });
  });

  describe('queryParams', () => {
    it('should provide query params object', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 10, syncWithUrl: false })
      );

      expect(result.current.queryParams).toEqual({
        page: 1,
        pageSize: 10,
        offset: 0,
        limit: 10,
      });
    });
  });

  describe('pageSizeOptions', () => {
    it('should have default page size options', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, syncWithUrl: false })
      );

      expect(result.current.pageSizeOptions).toEqual([10, 25, 50, 100]);
    });

    it('should respect custom page size options', () => {
      const { result } = renderHook(() =>
        usePagination({
          totalItems: 100,
          pageSizeOptions: [5, 10, 20],
          syncWithUrl: false,
        })
      );

      expect(result.current.pageSizeOptions).toEqual([5, 10, 20]);
    });
  });

  describe('searchParamsString', () => {
    it('should generate URL search params string', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, defaultPageSize: 10, syncWithUrl: false })
      );

      expect(result.current.searchParamsString).toBe('page=1&size=10');
    });
  });

  describe('loading state', () => {
    it('should have isLoading false initially', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, syncWithUrl: false })
      );

      expect(result.current.isLoading).toBe(false);
    });

    it('should update loading state', () => {
      const { result } = renderHook(() =>
        usePagination({ totalItems: 100, syncWithUrl: false })
      );

      act(() => {
        result.current.setIsLoading(true);
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should call onLoadingChange callback', () => {
      const onLoadingChange = jest.fn();
      const { result } = renderHook(() =>
        usePagination({
          totalItems: 100,
          onLoadingChange,
          syncWithUrl: false,
        })
      );

      act(() => {
        result.current.setIsLoading(true);
      });

      expect(onLoadingChange).toHaveBeenCalledWith(true);
    });
  });
});

describe('useLocalPagination', () => {
  it('should work without URL sync', () => {
    const { result } = renderHook(() =>
      useLocalPagination({ totalItems: 100, defaultPageSize: 10 })
    );

    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(10);
  });

  it('should navigate pages locally', () => {
    const { result } = renderHook(() =>
      useLocalPagination({ totalItems: 100, defaultPageSize: 10 })
    );

    act(() => {
      result.current.nextPage();
    });

    expect(result.current.page).toBe(2);
  });
});

describe('getPaginationMeta', () => {
  it('should calculate correct metadata', () => {
    const meta = getPaginationMeta(1, 10, 100);

    expect(meta).toEqual({
      page: 1,
      pageSize: 10,
      totalPages: 10,
      totalItems: 100,
      startItem: 1,
      endItem: 10,
      offset: 0,
      hasPrevious: false,
      hasNext: true,
      isEmpty: false,
      isSinglePage: false,
    });
  });

  it('should handle empty data', () => {
    const meta = getPaginationMeta(1, 10, 0);

    expect(meta.isEmpty).toBe(true);
    expect(meta.startItem).toBe(0);
    expect(meta.endItem).toBe(0);
  });

  it('should handle single page', () => {
    const meta = getPaginationMeta(1, 25, 10);

    expect(meta.isSinglePage).toBe(true);
    expect(meta.hasPrevious).toBe(false);
    expect(meta.hasNext).toBe(false);
  });

  it('should handle middle page', () => {
    const meta = getPaginationMeta(5, 10, 100);

    expect(meta.hasPrevious).toBe(true);
    expect(meta.hasNext).toBe(true);
    expect(meta.startItem).toBe(41);
    expect(meta.endItem).toBe(50);
  });

  it('should handle last page', () => {
    const meta = getPaginationMeta(10, 10, 95);

    expect(meta.page).toBe(10);
    expect(meta.hasNext).toBe(false);
    expect(meta.endItem).toBe(95);
  });

  it('should cap page to totalPages', () => {
    const meta = getPaginationMeta(100, 10, 50); // Page 100 but only 5 pages

    expect(meta.page).toBe(5);
  });
});

describe('getPageNumbers', () => {
  it('should return all pages when total is small', () => {
    const pages = getPageNumbers(1, 5);

    expect(pages).toEqual([1, 2, 3, 4, 5]);
  });

  it('should return all pages up to maxVisible + 2', () => {
    const pages = getPageNumbers(1, 7, 5);

    expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('should add ellipsis at start when far from beginning', () => {
    const pages = getPageNumbers(10, 20, 5);

    expect(pages).toContain(1);
    expect(pages).toContain('ellipsis-start');
    expect(pages).toContain(20);
  });

  it('should add ellipsis at end when far from end', () => {
    const pages = getPageNumbers(3, 20, 5);

    expect(pages).toContain(1);
    expect(pages).toContain('ellipsis-end');
    expect(pages).toContain(20);
  });

  it('should always include first and last page', () => {
    const pages = getPageNumbers(10, 20, 5);

    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
  });

  it('should handle current page near start', () => {
    const pages = getPageNumbers(2, 20, 5);

    expect(pages).toContain(1);
    expect(pages).toContain(2);
    expect(pages).toContain(3);
  });

  it('should handle current page near end', () => {
    const pages = getPageNumbers(19, 20, 5);

    expect(pages).toContain(19);
    expect(pages).toContain(20);
  });

  it('should handle single page', () => {
    const pages = getPageNumbers(1, 1, 5);

    expect(pages).toEqual([1]);
  });

  it('should handle two pages', () => {
    const pages = getPageNumbers(1, 2, 5);

    expect(pages).toEqual([1, 2]);
  });

  it('should center range around current page', () => {
    const pages = getPageNumbers(10, 20, 5);

    expect(pages).toContain(10);
    // Should have pages around 10
    expect(pages.filter(p => typeof p === 'number')).toContain(9);
    expect(pages.filter(p => typeof p === 'number')).toContain(11);
  });
});

describe('keyboard navigation', () => {
  it('should provide handleKeyDown function', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 100, syncWithUrl: false })
    );

    expect(typeof result.current.handleKeyDown).toBe('function');
  });
});

describe('edge cases', () => {
  it('should handle undefined totalItems', () => {
    const { result } = renderHook(() =>
      usePagination({ syncWithUrl: false })
    );

    expect(result.current.totalPages).toBe(1);
    expect(result.current.isEmpty).toBe(true);
  });

  it('should handle negative page request', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 100, syncWithUrl: false })
    );

    act(() => {
      result.current.setPage(-1);
    });

    expect(result.current.page).toBe(1);
  });

  it('should handle page beyond total', () => {
    const { result } = renderHook(() =>
      usePagination({ totalItems: 50, defaultPageSize: 10, syncWithUrl: false })
    );

    act(() => {
      result.current.setPage(100);
    });

    expect(result.current.page).toBe(5); // Max pages is 5
  });
});
