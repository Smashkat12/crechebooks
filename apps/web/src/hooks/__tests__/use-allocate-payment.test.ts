/**
 * Unit tests for useAllocatePayment — AUDIT-PAY-010
 *
 * Strategy: capture the mutationFn from useMutation options by mocking
 * @tanstack/react-query, then invoke useAllocatePayment via renderHook
 * (satisfies rules-of-hooks) and call the captured mutationFn directly.
 *
 * Asserts:
 *  1. Calls POST /payments (not /payments/:id/allocate) with correct body shape.
 *  2. Sends snake_case invoice_id matching ApiAllocatePaymentDto.
 *  3. Throws early (no network call) when transactionId is undefined.
 *  4. Passes amount as ZAR decimal — backend does Math.round(a.amount * 100).
 */

import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock @/lib/api
// Note: jest.mock is hoisted before variable declarations, so we cannot
// reference `const mockPost` inside the factory. Instead we mock the module
// with a fresh jest.fn() and retrieve it via jest.mocked() after import.
// ---------------------------------------------------------------------------

jest.mock('@/lib/api', () => ({
  apiClient: { post: jest.fn() },
  endpoints: jest.requireActual<typeof import('@/lib/api/endpoints')>('@/lib/api/endpoints').endpoints,
  queryKeys: {
    payments: {
      detail: (id: string) => ['payments', 'detail', id],
      lists: () => ['payments', 'lists'],
    },
    invoices: { all: ['invoices'] },
    arrears: { all: ['arrears'] },
  },
}));

// ---------------------------------------------------------------------------
// Mock TanStack Query — capture mutationFn, stub useQueryClient
// ---------------------------------------------------------------------------

type AllocateParams = {
  paymentId: string;
  transactionId?: string;
  allocations: { invoice_id: string; amount: number }[];
};

type CapturedMutationFn = (params: AllocateParams) => Promise<{ success: boolean }>;

let capturedMutationFn: CapturedMutationFn | null = null;

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useMutation: (options: { mutationFn: CapturedMutationFn }) => {
      capturedMutationFn = options.mutationFn;
      return {
        mutateAsync: jest.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
        error: null,
        mutate: jest.fn(),
        reset: jest.fn(),
        data: undefined,
        variables: undefined,
        status: 'idle' as const,
        isIdle: true,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        submittedAt: 0,
      };
    },
    useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  };
});

// Import after mocks
import { useAllocatePayment } from '../use-payments';
import { apiClient } from '@/lib/api';

// Typed reference to the mocked post function
const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

// ---------------------------------------------------------------------------
// Helper: render hook (satisfies rules-of-hooks) and return captured mutationFn
// ---------------------------------------------------------------------------

function setupHook(): CapturedMutationFn {
  capturedMutationFn = null;
  renderHook(() => useAllocatePayment());
  const fn = capturedMutationFn;
  if (!fn) throw new Error('useMutation was not invoked');
  return fn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAllocatePayment — AUDIT-PAY-010', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ data: { success: true } } as never);
  });

  it('Test 1: calls POST /payments (not /payments/:id/allocate) with snake_case body', async () => {
    const mutationFn = setupHook();

    await mutationFn({
      paymentId: 'pay-001',
      transactionId: 'tx-abc',
      allocations: [{ invoice_id: 'inv-001', amount: 3450.0 }],
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0] as [string, unknown];

    // Must target POST /payments (list endpoint), not /payments/pay-001/allocate
    expect(url).toBe('/payments');
    expect(body).toEqual({
      transaction_id: 'tx-abc',
      allocations: [{ invoice_id: 'inv-001', amount: 3450.0 }],
    });
  });

  it('Test 2: passes ZAR decimal amount without pre-multiplying to cents', async () => {
    const mutationFn = setupHook();

    await mutationFn({
      paymentId: 'pay-002',
      transactionId: 'tx-def',
      allocations: [
        { invoice_id: 'inv-A', amount: 1200.5 },
        { invoice_id: 'inv-B', amount: 300.0 },
      ],
    });

    const [, body] = mockPost.mock.calls[0] as [
      string,
      { allocations: { amount: number }[] },
    ];

    // Controller does Math.round(a.amount * 100) server-side — we must not pre-multiply.
    expect(body.allocations[0].amount).toBe(1200.5);
    expect(body.allocations[1].amount).toBe(300.0);
  });

  it('Test 3: throws without a network call when transactionId is undefined', async () => {
    const mutationFn = setupHook();

    await expect(
      mutationFn({
        paymentId: 'pay-003',
        transactionId: undefined,
        allocations: [{ invoice_id: 'inv-001', amount: 500.0 }],
      })
    ).rejects.toThrow('no linked bank transaction');

    // apiClient.post must NOT have been called
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('Test 4: sends correct body for multi-allocation requests', async () => {
    const mutationFn = setupHook();

    await mutationFn({
      paymentId: 'pay-004',
      transactionId: 'tx-multi',
      allocations: [
        { invoice_id: 'inv-jan', amount: 2000.0 },
        { invoice_id: 'inv-feb', amount: 1500.0 },
        { invoice_id: 'inv-mar', amount: 500.0 },
      ],
    });

    const [url, body] = mockPost.mock.calls[0] as [
      string,
      { transaction_id: string; allocations: unknown[] },
    ];

    expect(url).toBe('/payments');
    expect(body.transaction_id).toBe('tx-multi');
    expect(body.allocations).toHaveLength(3);
  });
});
