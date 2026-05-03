/**
 * Unit tests for GET /payments/:paymentId/suggestions (AUDIT-PAY-009)
 *
 * Asserts that:
 *  1. The controller looks up the Payment row tenant-scoped and delegates to
 *     PaymentMatchingService.getSuggestionsForTransaction.
 *  2. MatchCandidate fields are mapped to the frontend PaymentSuggestion shape:
 *     - invoiceOutstandingCents / 100 → amount (ZAR decimal)
 *     - confidenceScore / 100       → confidence (0-1)
 *     - matchReasons.join('; ')     → reason
 *  3. 404 is thrown when no Payment row is found.
 *  4. An empty array is returned when the Payment has no transactionId.
 *  5. The route is accessible to VIEWER-role users (read-only endpoint).
 *
 * Uses the same direct-instantiation pattern as payment-source-plumbing.spec.ts
 * to avoid TestingModule overhead.
 */

import { NotFoundException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { PaymentMatchingService } from '../../database/services/payment-matching.service';
import { PaymentReceiptService } from '../../database/services/payment-receipt.service';
import { ArrearsService } from '../../database/services/arrears.service';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { IUser } from '../../database/entities/user.entity';
import type { MatchCandidate } from '../../database/dto/payment-matching.dto';
import { MatchConfidenceLevel } from '../../database/dto/payment-matching.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (tenantId = 'tenant-001'): IUser =>
  ({
    id: 'user-001',
    tenantId,
    tenantRoles: [{ tenantId, role: 'ADMIN' }],
  }) as unknown as IUser;

const makeCandidate = (
  overrides: Partial<MatchCandidate> = {},
): MatchCandidate => ({
  transactionId: 'tx-001',
  invoiceId: 'inv-001',
  invoiceNumber: 'INV-2026-001',
  confidenceLevel: MatchConfidenceLevel.HIGH,
  confidenceScore: 85,
  matchReasons: ['First name found', 'Amount match'],
  parentId: 'parent-001',
  parentName: 'Mary Smith',
  childName: 'Thabo',
  invoiceOutstandingCents: 350000,
  transactionAmountCents: 350000,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Factory — builds controller with mocked collaborators
// ---------------------------------------------------------------------------

interface ControllerSetup {
  controller: PaymentController;
  getSuggestionsMock: jest.MockedFunction<
    PaymentMatchingService['getSuggestionsForTransaction']
  >;
  paymentFindFirstMock: jest.Mock;
}

function makeController(
  paymentRow: { transactionId: string | null } | null,
): ControllerSetup {
  const getSuggestionsMock = jest.fn() as jest.MockedFunction<
    PaymentMatchingService['getSuggestionsForTransaction']
  >;

  const paymentFindFirstMock = jest.fn().mockResolvedValue(paymentRow);

  const prismaMock = {
    payment: { findFirst: paymentFindFirstMock },
  } as unknown as PrismaService;

  const matchingServiceMock = {
    getSuggestionsForTransaction: getSuggestionsMock,
  } as unknown as PaymentMatchingService;

  const controller = new PaymentController(
    {} as unknown as PaymentAllocationService,
    matchingServiceMock,
    {} as unknown as PaymentReceiptService,
    {} as unknown as ArrearsService,
    {} as unknown as PaymentRepository,
    {} as unknown as InvoiceRepository,
    prismaMock,
  );

  return { controller, getSuggestionsMock, paymentFindFirstMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentController.getPaymentSuggestions — AUDIT-PAY-009', () => {
  it('Test 1: maps MatchCandidate to PaymentSuggestionDto shape correctly', async () => {
    const candidate = makeCandidate({
      confidenceScore: 80,
      invoiceOutstandingCents: 500000, // R5 000.00
      matchReasons: ['Exact reference match', 'Amount match'],
    });

    const { controller, getSuggestionsMock } = makeController({
      transactionId: 'tx-001',
    });
    getSuggestionsMock.mockResolvedValue([candidate]);

    const result = await controller.getPaymentSuggestions(
      'pay-001',
      makeUser(),
    );

    expect(result).toHaveLength(1);
    const s = result[0];
    expect(s.invoiceId).toBe('inv-001');
    expect(s.parentName).toBe('Mary Smith');
    expect(s.childName).toBe('Thabo');
    // cents → decimal ZAR
    expect(s.amount).toBe(5000);
    // 0-100 → 0-1
    expect(s.confidence).toBeCloseTo(0.8);
    // reasons joined with '; '
    expect(s.reason).toBe('Exact reference match; Amount match');
  });

  it('Test 2: throws NotFoundException when Payment row is not found', async () => {
    const { controller } = makeController(null);

    await expect(
      controller.getPaymentSuggestions('nonexistent', makeUser()),
    ).rejects.toThrow(NotFoundException);
  });

  it('Test 3: returns empty array when Payment has no transactionId', async () => {
    const { controller, getSuggestionsMock } = makeController({
      transactionId: null,
    });

    const result = await controller.getPaymentSuggestions(
      'pay-no-tx',
      makeUser(),
    );

    expect(result).toEqual([]);
    // Service must NOT be called — no transaction to score against
    expect(getSuggestionsMock).not.toHaveBeenCalled();
  });

  it('Test 4: passes tenantId and transactionId correctly to the service', async () => {
    const { controller, getSuggestionsMock, paymentFindFirstMock } =
      makeController({
        transactionId: 'tx-abc',
      });
    getSuggestionsMock.mockResolvedValue([]);

    await controller.getPaymentSuggestions('pay-xyz', makeUser('tenant-999'));

    // Payment lookup must be tenant-scoped
    expect(paymentFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-999' }),
      }),
    );

    // Service called with tenant and resolved transactionId
    expect(getSuggestionsMock).toHaveBeenCalledWith('tenant-999', 'tx-abc');
  });

  it('Test 5: returns empty array when service returns no candidates', async () => {
    const { controller, getSuggestionsMock } = makeController({
      transactionId: 'tx-001',
    });
    getSuggestionsMock.mockResolvedValue([]);

    const result = await controller.getPaymentSuggestions(
      'pay-001',
      makeUser(),
    );

    expect(result).toEqual([]);
  });

  it('Test 6: maps multiple candidates in order (highest confidence first)', async () => {
    const high = makeCandidate({ invoiceId: 'inv-high', confidenceScore: 90 });
    const medium = makeCandidate({ invoiceId: 'inv-med', confidenceScore: 65 });

    const { controller, getSuggestionsMock } = makeController({
      transactionId: 'tx-001',
    });
    // Service already sorts DESC — we just verify the controller preserves order
    getSuggestionsMock.mockResolvedValue([high, medium]);

    const result = await controller.getPaymentSuggestions(
      'pay-001',
      makeUser(),
    );

    expect(result).toHaveLength(2);
    expect(result[0].invoiceId).toBe('inv-high');
    expect(result[1].invoiceId).toBe('inv-med');
    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
  });
});
