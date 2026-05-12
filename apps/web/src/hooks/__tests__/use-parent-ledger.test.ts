/**
 * Tests for useParentLedger — verifies the new live ledger hook builds
 * the right request and returns the unwrapped data shape.
 *
 * Strategy mirrors use-allocate-payment.test.ts: mock @/lib/api and
 * @tanstack/react-query to capture the queryFn passed to useQuery.
 */

import { renderHook } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  apiClient: { get: jest.fn(), defaults: { baseURL: 'http://localhost' } },
  endpoints: {
    statements: {
      parentLedger: (id: string) => `/statements/parents/${id}/ledger`,
      parentLedgerPdf: (id: string) => `/statements/parents/${id}/ledger/pdf`,
    },
  },
  queryKeys: {
    statements: {
      parentLedger: (id: string, params?: unknown) => [
        'statements',
        'ledger',
        id,
        params,
      ],
    },
  },
}));

type CapturedQueryFn = () => Promise<unknown>;
let capturedQueryFn: CapturedQueryFn | null = null;

jest.mock('@tanstack/react-query', () => ({
  useQuery: (opts: { queryFn: CapturedQueryFn; enabled?: boolean }) => {
    capturedQueryFn = opts.queryFn;
    return { data: undefined, isLoading: false, error: null };
  },
}));

import { apiClient } from '@/lib/api';
import { useParentLedger } from '../use-parent-ledger';

const mockGet = jest.mocked(apiClient.get);

describe('useParentLedger', () => {
  beforeEach(() => {
    mockGet.mockReset();
    capturedQueryFn = null;
  });

  it('calls GET /statements/parents/:id/ledger with snake_case params', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          parent: { id: 'p1', name: 'X', email: null, phone: null },
          period_start: '2025-01-01',
          period_end: '2025-03-31',
          opening_balance_cents: 0,
          total_charges_cents: 100,
          total_payments_cents: 0,
          total_credits_cents: 0,
          closing_balance_cents: 100,
          lines: [],
          is_live: true,
        },
      },
    } as never);

    renderHook(() =>
      useParentLedger('parent-1', {
        periodStart: '2025-01-01',
        periodEnd: '2025-03-31',
      }),
    );

    expect(capturedQueryFn).not.toBeNull();
    const result = await capturedQueryFn!();

    expect(mockGet).toHaveBeenCalledWith(
      '/statements/parents/parent-1/ledger',
      { params: { period_start: '2025-01-01', period_end: '2025-03-31' } },
    );
    expect((result as { is_live: boolean }).is_live).toBe(true);
  });

  it('omits params when no period is given (server picks defaults)', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          parent: { id: 'p1', name: 'X', email: null, phone: null },
          period_start: '2025-01-01',
          period_end: '2025-03-31',
          opening_balance_cents: 0,
          total_charges_cents: 0,
          total_payments_cents: 0,
          total_credits_cents: 0,
          closing_balance_cents: 0,
          lines: [],
          is_live: true,
        },
      },
    } as never);

    renderHook(() => useParentLedger('parent-1'));
    await capturedQueryFn!();

    expect(mockGet).toHaveBeenCalledWith(
      '/statements/parents/parent-1/ledger',
      { params: {} },
    );
  });

  it('throws when the API returns success=false', async () => {
    mockGet.mockResolvedValueOnce({
      data: { success: false, data: null },
    } as never);

    renderHook(() => useParentLedger('parent-1'));
    await expect(capturedQueryFn!()).rejects.toThrow('Failed to load ledger');
  });
});
