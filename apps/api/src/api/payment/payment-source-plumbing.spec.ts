/**
 * Payment source field plumbing tests
 *
 * Asserts that the `source` field on `MatchDecision` flows all the way through
 * `AppliedMatch` and reaches the `auto_matched[].source` field on the HTTP
 * response built by `PaymentController.matchPayments()`.
 *
 * We test the controller-level mapping by calling the controller method with a
 * mocked `PaymentMatchingService` that returns a controlled `MatchingBatchResult`.
 */

import { PaymentController } from './payment.controller';
import { PaymentMatchingService } from '../../database/services/payment-matching.service';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { PaymentReceiptService } from '../../database/services/payment-receipt.service';
import { ArrearsService } from '../../database/services/arrears.service';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import type { IUser } from '../../database/entities/user.entity';
import type { MatchingBatchResult } from '../../database/dto/payment-matching.dto';
import type { ApiMatchPaymentsDto } from './dto';

// Minimal IUser with a tenantId so TenantGuard doesn't fire
const makeUser = (): IUser =>
  ({
    id: 'user-001',
    tenantId: 'tenant-001',
    tenantRoles: [{ tenantId: 'tenant-001', role: 'OWNER' }],
  }) as unknown as IUser;

const makeAppliedMatch = (
  source: 'deterministic' | 'sdk' | 'deterministic+ruvector',
) => ({
  paymentId: 'pay-001',
  transactionId: 'tx-001',
  invoiceId: 'inv-001',
  invoiceNumber: 'INV-2025-001',
  amountCents: 100000,
  confidenceScore: 95,
  source,
});

const makeBatchResult = (
  source: 'deterministic' | 'sdk' | 'deterministic+ruvector',
): MatchingBatchResult => ({
  processed: 1,
  autoApplied: 1,
  reviewRequired: 0,
  noMatch: 0,
  results: [
    {
      transactionId: 'tx-001',
      status: 'AUTO_APPLIED',
      appliedMatch: makeAppliedMatch(source),
      reason: 'High confidence match',
    },
  ],
});

describe('PaymentController — source field plumbing', () => {
  let controller: PaymentController;
  let matchingServiceMock: jest.Mocked<
    Pick<PaymentMatchingService, 'matchPayments'>
  >;

  beforeEach(() => {
    matchingServiceMock = {
      matchPayments: jest.fn(),
    };

    controller = new PaymentController(
      {} as unknown as PaymentAllocationService,
      matchingServiceMock as unknown as PaymentMatchingService,
      {} as unknown as PaymentReceiptService,
      {} as unknown as ArrearsService,
      {} as unknown as PaymentRepository,
      {} as unknown as InvoiceRepository,
    );
  });

  it('Test 1: source "deterministic" flows to auto_matched[].source', async () => {
    matchingServiceMock.matchPayments.mockResolvedValue(
      makeBatchResult('deterministic'),
    );

    const dto: ApiMatchPaymentsDto = { transaction_ids: ['tx-001'] };
    const result = await controller.matchPayments(dto, makeUser());

    expect(result.data.auto_matched).toHaveLength(1);
    expect(result.data.auto_matched[0].source).toBe('deterministic');
  });

  it('Test 2: source "sdk" flows to auto_matched[].source (not overridden to "deterministic")', async () => {
    matchingServiceMock.matchPayments.mockResolvedValue(makeBatchResult('sdk'));

    const dto: ApiMatchPaymentsDto = { transaction_ids: ['tx-001'] };
    const result = await controller.matchPayments(dto, makeUser());

    expect(result.data.auto_matched).toHaveLength(1);
    expect(result.data.auto_matched[0].source).toBe('sdk');
  });

  it('Test 3: source "deterministic+ruvector" flows to auto_matched[].source', async () => {
    matchingServiceMock.matchPayments.mockResolvedValue(
      makeBatchResult('deterministic+ruvector'),
    );

    const dto: ApiMatchPaymentsDto = { transaction_ids: ['tx-001'] };
    const result = await controller.matchPayments(dto, makeUser());

    expect(result.data.auto_matched).toHaveLength(1);
    expect(result.data.auto_matched[0].source).toBe('deterministic+ruvector');
  });
});
